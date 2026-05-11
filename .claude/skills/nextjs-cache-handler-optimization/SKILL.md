---
name: nextjs-cache-handler-optimization
description: Fortedigital Next.js cache handler configuration and optimization patterns. Use when setting up Redis caching, configuring composite handlers, optimizing TTL strategies, or migrating from default Next.js caching to external cache handlers in production applications.
---

# Next.js Cache Handler Optimization

Production-ready cache handler patterns using @fortedigital/nextjs-cache-handler for Redis-backed caching with fallback strategies.

## When to Apply

- Migrating from Next.js default in-memory caching to Redis
- Setting up multi-tier caching with LRU + Redis composite handlers
- Optimizing cache TTL strategies for production workloads
- Implementing tag-based cache invalidation across deployments

## Critical Rules

**Disable Built-in Memory Cache**: Always set `cacheMaxMemorySize: 0` in next.config when using external handlers

```javascript
// WRONG - Competes with external handler
const nextConfig = {
	cacheHandler: require.resolve("./cache-handler.mjs"),
}

// RIGHT - Disables built-in cache
const nextConfig = {
	cacheHandler: require.resolve("./cache-handler.mjs"),
	cacheMaxMemorySize: 0,
}
```

**Global Handler Instance**: Use global variables to prevent Redis connection race conditions

```javascript
// WRONG - Creates multiple Redis connections
CacheHandler.onCreation(() => {
	const client = createClient({ url: process.env.REDIS_URL })
	return { handlers: [createRedisHandler({ client })] }
})

// RIGHT - Singleton pattern with global cache
CacheHandler.onCreation(() => {
	if (global.cacheHandlerConfig) {
		return global.cacheHandlerConfig
	}
	// Initialize once...
})
```

## Key Patterns

### Production Composite Handler

```javascript
// cache-handler.mjs
import { CacheHandler } from "@fortedigital/nextjs-cache-handler"
import createLruHandler from "@fortedigital/nextjs-cache-handler/local-lru"
import createRedisHandler from "@fortedigital/nextjs-cache-handler/redis-strings"
import createCompositeHandler from "@fortedigital/nextjs-cache-handler/composite"
import { createClient } from "redis"

CacheHandler.onCreation(async ({ buildId, dev }) => {
	if (global.cacheHandlerConfig) {
		return global.cacheHandlerConfig
	}

	if (dev) {
		return { handlers: [createLruHandler()] }
	}

	const client = createClient({
		url: process.env.REDIS_URL,
		pingInterval: 10_000,
	})

	client.on("error", (err) => {
		console.warn("Redis error", err)
		global.cacheHandlerConfig = null
	})

	await client.connect()

	const lru = createLruHandler()
	const redis = createRedisHandler({
		client,
		keyPrefix: `${buildId}:`,
	})

	global.cacheHandlerConfig = {
		handlers: [
			createCompositeHandler({
				handlers: [lru, redis],
				setStrategy: (ctx) => (ctx?.tags.includes("memory-cache") ? 0 : 1),
			}),
		],
		ttl: {
			defaultStaleAge: 60 * 60 * 24, // 24h default
			estimateExpireAge: (staleAge) => staleAge * 2,
		},
	}

	return global.cacheHandlerConfig
})

export default CacheHandler
```

### Advanced Redis Configuration

```javascript
import createRedisHandler from "@fortedigital/nextjs-cache-handler/redis-strings"
import { gzipSync, gunzipSync } from "zlib"

const redisHandler = createRedisHandler({
	client,
	keyPrefix: "app:",
	timeoutMs: 3_000,
	keyExpirationStrategy: "EXAT",
	revalidateTagQuerySize: 5_000,

	// Compression for large cache values
	valueSerializer: {
		serialize: (value) => gzipSync(JSON.stringify(value)).toString("base64"),
		deserialize: (stored) =>
			JSON.parse(gunzipSync(Buffer.from(stored, "base64")).toString("utf-8")),
	},
})
```

### Environment-Based Handler Selection

```javascript
CacheHandler.onCreation(async ({ buildId, serverDistDir, dev }) => {
	// Development: LRU only
	if (dev || process.env.NODE_ENV === "development") {
		return { handlers: [createLruHandler()] }
	}

	// Build phase: Skip Redis
	if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) {
		return { handlers: [createLruHandler()] }
	}

	// Production: Redis + LRU fallback
	const client = createClient({
		url: process.env.REDIS_URL,
		password: process.env.REDIS_ACCESS_KEY,
	})

	return {
		handlers: [redis, lru],
		ttl: {
			defaultStaleAge: 60 * 60 * 12, // 12h for no explicit revalidate
			estimateExpireAge: (staleAge) => staleAge * 2,
		},
	}
})
```

## Common Mistakes

- **Missing global singleton** — Creates multiple Redis connections causing connection pool exhaustion
- **No Redis error handling** — App crashes when Redis is unavailable instead of falling back to LRU
- **Wrong setStrategy logic** — Composite handler routes cache misses, causing performance degradation
- **Build-time Redis calls** — Attempts Redis connection during `next build`, causing build failures
