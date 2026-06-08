/**
 * _wipe-r2-candles.ts
 *
 * One-shot R2 wipe: deletes every object under `candles/` in the bucket.
 * Leading underscore marks this as temporary — delete after the 2026-06-08
 * fresh-data re-ingest. Idempotent (re-run is a no-op on empty prefix).
 *
 * Safety: the bucket also holds image uploads under other prefixes. This
 * script ONLY touches `candles/` — never the bucket root.
 *
 * Usage: pnpm tsx scripts/_wipe-r2-candles.ts
 */
import "dotenv/config"
import {
	S3Client,
	ListObjectsV2Command,
	DeleteObjectsCommand,
} from "@aws-sdk/client-s3"

const S3_ENDPOINT = process.env.S3_ENDPOINT
const S3_BUCKET = process.env.S3_BUCKET
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY
const S3_REGION = process.env.S3_REGION ?? "auto"
const PREFIX = "candles/"

if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
	console.error(
		"missing one of S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY"
	)
	process.exit(1)
}

const main = async () => {
	const s3 = new S3Client({
		region: S3_REGION,
		endpoint: S3_ENDPOINT,
		credentials: {
			accessKeyId: S3_ACCESS_KEY_ID,
			secretAccessKey: S3_SECRET_ACCESS_KEY,
		},
		forcePathStyle: true,
	})

	let continuationToken: string | undefined = undefined
	let total = 0
	let batches = 0
	do {
		const listed = await s3.send(
			new ListObjectsV2Command({
				Bucket: S3_BUCKET,
				Prefix: PREFIX,
				MaxKeys: 1000,
				ContinuationToken: continuationToken,
			})
		)
		const objects = (listed.Contents ?? []).filter((o) => o.Key !== undefined)
		if (objects.length > 0) {
			console.log(`batch ${++batches}: ${objects.length} objects`)
			for (const obj of objects) {
				console.log(`  - ${obj.Key}`)
			}
			const deleteResult = await s3.send(
				new DeleteObjectsCommand({
					Bucket: S3_BUCKET,
					Delete: {
						Objects: objects.map((o) => ({ Key: o.Key! })),
						Quiet: true,
					},
				})
			)
			if (deleteResult.Errors && deleteResult.Errors.length > 0) {
				console.error("delete errors:", deleteResult.Errors)
				process.exit(1)
			}
			total += objects.length
		}
		continuationToken = listed.IsTruncated
			? listed.NextContinuationToken
			: undefined
	} while (continuationToken)

	console.log(`\n✓ wiped ${total} object(s) under ${PREFIX} in ${S3_BUCKET}`)
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
