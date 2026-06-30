#!/usr/bin/env python3
"""
sensei-candle-query — DuckDB → R2 Parquet candle reader for TradeSensei.

Reads candle bars from the Axion candle store (R2 Parquet via httpfs, or local
disk fallback) and returns JSON. Powers `sensei-candles` subagent — resolves
chart-vision bar indices to exact timestamps + indicator values without
calling the Axion HTTP API (there is no candle HTTP route, by design).

Local layout fallback (CANDLE_STORE_DUCKDB_BASE_PATH unset or starts without s3://):
    data/parquet/candles/<timeframeCode>/<assetSymbol>.parquet

Remote layout (basePath = s3://<bucket>/candles):
    s3://<bucket>/candles/<timeframeCode>/<assetSymbol>.parquet

Reads env from the axion .env file by default (DATABASE_URL is not needed,
only S3_* for remote reads).

Usage:
    python candle-query.py WIN 5 2026-06-22 2026-06-22 \\
        --columns timestamp,open,close,macd1_histo,macd2_histo,ema27,ema55,vwap_d \\
        [--limit 100] [--base-path data/parquet/candles | s3://bucket/candles]

Output: JSON to stdout. Schema:
    {
      "asset": "WIN",
      "timeframe": "5",
      "from": "2026-06-22T00:00:00",
      "to": "2026-06-22T23:59:59",
      "rowCount": <int>,
      "columns": ["timestamp", "open", ...],
      "rows": [ [...], [...], ... ]
    }
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

# Lazy import so the script reports a clear error if duckdb is missing.
try:
    import duckdb  # type: ignore[import-untyped]
except ImportError:
    print(
        json.dumps(
            {
                "error": "duckdb_missing",
                "detail": "Install with: pip install duckdb (or `pnpm tsx` from the axion repo which has it bundled)",
            }
        ),
        file=sys.stderr,
    )
    sys.exit(2)


AXION_REPO_DEFAULT = Path("/Users/ygorbravim/personal/projects/bravo/axion")


def load_env_from_axion_repo(repo: Path) -> None:
    """Best-effort load of S3_* + CANDLE_STORE_* env vars from axion repo .env file."""
    env_file = repo / ".env"
    if not env_file.exists():
        return
    for raw in env_file.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        # Only override if not already set in environment
        if key and key not in os.environ:
            os.environ[key] = val


def build_connection(base_path: str) -> duckdb.DuckDBPyConnection:
    """Create a DuckDB in-memory connection, wire S3 creds if remote."""
    conn = duckdb.connect(":memory:")
    if base_path.startswith("s3://"):
        endpoint = os.environ.get("S3_ENDPOINT", "")
        access = os.environ.get("S3_ACCESS_KEY_ID", "")
        secret = os.environ.get("S3_SECRET_ACCESS_KEY", "")
        region = os.environ.get("S3_REGION", "auto")
        if not (endpoint and access and secret):
            raise RuntimeError(
                "Remote candle store requires S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY"
            )
        conn.execute("INSTALL httpfs; LOAD httpfs;")
        # DuckDB's secret API works for S3-compatible (Cloudflare R2) endpoints.
        # Strip the https:// prefix if present — DuckDB wants host only.
        ep_host = endpoint.replace("https://", "").replace("http://", "").rstrip("/")
        conn.execute(
            f"""
            CREATE OR REPLACE SECRET candle_r2 (
                TYPE S3,
                KEY_ID '{access}',
                SECRET '{secret}',
                ENDPOINT '{ep_host}',
                REGION '{region}',
                URL_STYLE 'path'
            )
            """
        )
    return conn


def resolve_parquet_path(base_path: str, timeframe_code: str, asset: str) -> str:
    """Build the full Parquet file path."""
    if base_path.startswith("s3://"):
        return f"{base_path.rstrip('/')}/{timeframe_code}/{asset}.parquet"
    # Local: relative to base_path
    return str(Path(base_path) / timeframe_code / f"{asset}.parquet")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Query candle bars from Axion candle store (R2 Parquet via DuckDB)"
    )
    parser.add_argument("asset", help="Asset symbol (e.g. WIN, WDO)")
    parser.add_argument(
        "timeframe",
        help="Timeframe code (e.g. 5, 15, 60, hawk_5m_win, R21)",
    )
    parser.add_argument("from_date", help="Start (YYYY-MM-DD or full ISO)")
    parser.add_argument("to_date", help="End (YYYY-MM-DD or full ISO)")
    parser.add_argument(
        "--columns",
        default="timestamp,open,high,low,close",
        help="Comma-separated column list. Use '*' for all. Indicators live alongside OHLC.",
    )
    parser.add_argument(
        "--limit", type=int, default=None, help="Optional max row count (no limit if omitted)"
    )
    parser.add_argument(
        "--base-path",
        default=None,
        help="Override CANDLE_STORE_DUCKDB_BASE_PATH (default reads from axion .env)",
    )
    parser.add_argument(
        "--axion-repo",
        default=str(AXION_REPO_DEFAULT),
        help="Path to axion repo (for .env loading + local Parquet fallback)",
    )
    args = parser.parse_args()

    repo = Path(args.axion_repo)
    load_env_from_axion_repo(repo)

    base_path = (
        args.base_path
        or os.environ.get("CANDLE_STORE_DUCKDB_BASE_PATH")
        or str(repo / "data" / "parquet" / "candles")
    )

    parquet_path = resolve_parquet_path(base_path, args.timeframe, args.asset)

    # Normalize from/to. Allow date-only by extending to full day boundaries.
    from_iso = args.from_date if "T" in args.from_date else f"{args.from_date}T00:00:00"
    to_iso = args.to_date if "T" in args.to_date else f"{args.to_date}T23:59:59"

    cols = args.columns.strip()
    if cols == "*":
        select_clause = "*"
    else:
        # Quote each column to handle indicator keys with funky chars.
        # Synthetic column: `gate_state` derives BULL/BEAR/INSIDE per
        # RULE 01 (BRAVO_I_Nuvem.pas) — full candle open+close vs EMAs 27/55.
        parts = [c.strip() for c in cols.split(",") if c.strip()]
        select_parts = []
        for c in parts:
            if c == "gate_state":
                select_parts.append(
                    "CASE "
                    'WHEN "open" > "ema27" AND "open" > "ema55" '
                    'AND "close" > "ema27" AND "close" > "ema55" THEN \'BULL\' '
                    'WHEN "open" < "ema27" AND "open" < "ema55" '
                    'AND "close" < "ema27" AND "close" < "ema55" THEN \'BEAR\' '
                    "ELSE 'INSIDE' END AS gate_state"
                )
            else:
                select_parts.append(f'"{c}"')
        select_clause = ", ".join(select_parts)

    limit_clause = f"LIMIT {args.limit}" if args.limit else ""

    try:
        conn = build_connection(base_path)
        # Escape single quotes in parquet path (rare but possible)
        safe_path = parquet_path.replace("'", "''")
        query = f"""
            SELECT {select_clause}
            FROM read_parquet('{safe_path}')
            WHERE timestamp BETWEEN TIMESTAMP '{from_iso}' AND TIMESTAMP '{to_iso}'
            ORDER BY timestamp ASC
            {limit_clause}
        """
        cursor = conn.execute(query)
        column_names = [d[0] for d in cursor.description] if cursor.description else []
        rows = cursor.fetchall()
    except Exception as exc:  # noqa: BLE001 — surface the error as JSON
        print(
            json.dumps(
                {
                    "error": "query_failed",
                    "detail": str(exc),
                    "parquetPath": parquet_path,
                    "basePath": base_path,
                }
            ),
            file=sys.stderr,
        )
        return 1

    def serialize(v: Any) -> Any:
        # DuckDB returns datetimes as native python datetime; ISO-format them.
        if hasattr(v, "isoformat"):
            return v.isoformat()
        # Pyarrow Decimal or numpy types: stringify if not natively JSON
        try:
            json.dumps(v)
            return v
        except (TypeError, ValueError):
            return str(v)

    serialized = [[serialize(v) for v in row] for row in rows]

    out = {
        "asset": args.asset,
        "timeframe": args.timeframe,
        "from": from_iso,
        "to": to_iso,
        "basePath": base_path,
        "parquetPath": parquet_path,
        "rowCount": len(serialized),
        "columns": column_names,
        "rows": serialized,
    }
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
