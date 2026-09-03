import { mkdir, writeFile, readdir, rm, statfs } from 'node:fs/promises'
import path from 'node:path'
import { resolveWithin } from '$lib/server/storage'
import { s3Request, type S3Target } from './s3'

// The ONE place in this feature that touches both the filesystem and the network, so it is
// also the only file that has to be reviewed for path traversal and credential handling.
// A `switch (dest.kind)` per operation — no provider interface, no factory, no registry:
// there are two destinations and there will not be a third soon.
//
// Nothing here writes anywhere near UPLOAD_DIR. The only path root is the destination.

export type Destination =
	| { kind: 'LOCAL'; root: string }
	| {
			kind: 'S3'
			endpoint: string
			region: string
			bucket: string
			prefix: string
			accessKeyId: string
			secretAccessKey: string
	  }

/**
 * Build a Destination from the environment.
 *
 * Credentials live ONLY here (AD-004): a database dump cannot leak the bucket, the
 * settings page has no secret to render, and pointing backups at a different bucket is a
 * deploy action rather than a form POST a compromised session could make.
 *
 * The thrown message names the missing VARIABLE and never prints a value.
 */
export function destinationFromEnv(kind: 'LOCAL' | 'S3'): Destination {
	if (kind === 'LOCAL') {
		const root = process.env.BACKUP_DIR
		if (!root) throw new Error('backup destination is not configured: BACKUP_DIR is not set')
		return { kind: 'LOCAL', root }
	}

	const required = {
		BACKUP_S3_ENDPOINT: process.env.BACKUP_S3_ENDPOINT,
		BACKUP_S3_REGION: process.env.BACKUP_S3_REGION,
		BACKUP_S3_BUCKET: process.env.BACKUP_S3_BUCKET,
		BACKUP_S3_ACCESS_KEY_ID: process.env.BACKUP_S3_ACCESS_KEY_ID,
		BACKUP_S3_SECRET_ACCESS_KEY: process.env.BACKUP_S3_SECRET_ACCESS_KEY
	}
	const missing = Object.entries(required)
		.filter(([, v]) => !v)
		.map(([k]) => k)
	if (missing.length > 0) {
		throw new Error(`backup destination is not configured: ${missing.join(', ')} not set`)
	}
	return {
		kind: 'S3',
		endpoint: required.BACKUP_S3_ENDPOINT!,
		region: required.BACKUP_S3_REGION!,
		bucket: required.BACKUP_S3_BUCKET!,
		prefix: process.env.BACKUP_S3_PREFIX ?? '',
		accessKeyId: required.BACKUP_S3_ACCESS_KEY_ID!,
		secretAccessKey: required.BACKUP_S3_SECRET_ACCESS_KEY!
	}
}

function s3Target(dest: Extract<Destination, { kind: 'S3' }>): S3Target {
	return {
		endpoint: dest.endpoint,
		region: dest.region,
		bucket: dest.bucket,
		accessKeyId: dest.accessKeyId,
		secretAccessKey: dest.secretAccessKey
	}
}

/** `<prefix>/<relPath>`, with no leading or doubled slashes. */
function s3Key(dest: Extract<Destination, { kind: 'S3' }>, relPath: string): string {
	return [dest.prefix, relPath].filter(Boolean).join('/')
}

/**
 * Write one object at `relPath` (which always begins with the organization id, so tenant
 * partitioning is a property of the path rather than a filter someone can forget).
 *
 * LOCAL resolves through the same `resolveWithin` the upload store uses, so a traversal
 * attempt is refused by the one implementation both callers share. Directories are 0700
 * and files 0600 — this tree holds government IDs and contracts, and must not be looser
 * than UPLOAD_DIR.
 */
export async function writeObject(
	dest: Destination,
	relPath: string,
	bytes: Buffer
): Promise<void> {
	switch (dest.kind) {
		case 'LOCAL': {
			const abs = resolveWithin(dest.root, relPath)
			await mkdir(path.dirname(abs), { recursive: true, mode: 0o700 })
			await writeFile(abs, bytes, { mode: 0o600 })
			return
		}
		case 'S3': {
			await s3Request(s3Target(dest), 'PUT', `/${dest.bucket}/${s3Key(dest, relPath)}`, {}, bytes)
			return
		}
	}
}

// Deliberately tolerant of a missing tag rather than pulling in an XML parser for three
// element names.
function xmlValues(xml: string, tag: string): string[] {
	return [...xml.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g'))].map((m) => m[1])
}

/**
 * The run ids present AT THE DESTINATION for one org.
 *
 * Reconciled against BackupRun rows by the prune pass (#164/E-09): after a database reset
 * or restore, a directory with no matching row would otherwise never be counted toward
 * retention and never removed, so the destination would grow without bound.
 */
export async function listRunIds(dest: Destination, organizationId: string): Promise<string[]> {
	switch (dest.kind) {
		case 'LOCAL': {
			const orgDir = resolveWithin(dest.root, organizationId)
			try {
				const entries = await readdir(orgDir, { withFileTypes: true })
				return entries.filter((e) => e.isDirectory()).map((e) => e.name)
			} catch (e: unknown) {
				// An org that has never been backed up has no directory. That is not an error.
				if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return []
				throw e
			}
		}
		case 'S3': {
			const prefix = `${s3Key(dest, organizationId)}/`
			const ids: string[] = []
			let token: string | undefined
			// E-19: a single ListObjectsV2 silently caps at 1000 keys, which would prune only
			// part of a run and leave the rest orphaned forever.
			do {
				const query: Record<string, string> = {
					'list-type': '2',
					prefix,
					delimiter: '/',
					...(token ? { 'continuation-token': token } : {})
				}
				const res = await s3Request(s3Target(dest), 'GET', `/${dest.bucket}`, query, null)
				for (const p of xmlValues(res.body, 'Prefix')) {
					if (p === prefix) continue
					const id = p.slice(prefix.length).replace(/\/$/, '')
					if (id) ids.push(id)
				}
				token =
					xmlValues(res.body, 'IsTruncated')[0] === 'true'
						? xmlValues(res.body, 'NextContinuationToken')[0]
						: undefined
			} while (token)
			return ids
		}
	}
}

/**
 * Remove one run's tree. Idempotent (#164/E-09): BackupRun rows are kept forever, so
 * `runsToPrune` re-selects an already-pruned run on every subsequent night.
 */
export async function deleteRun(
	dest: Destination,
	organizationId: string,
	runId: string
): Promise<void> {
	switch (dest.kind) {
		case 'LOCAL': {
			const abs = resolveWithin(resolveWithin(dest.root, organizationId), runId)
			await rm(abs, { recursive: true, force: true })
			return
		}
		case 'S3': {
			const prefix = `${s3Key(dest, organizationId)}/${runId}/`
			let token: string | undefined
			do {
				const query: Record<string, string> = {
					'list-type': '2',
					prefix,
					...(token ? { 'continuation-token': token } : {})
				}
				const res = await s3Request(s3Target(dest), 'GET', `/${dest.bucket}`, query, null)
				for (const key of xmlValues(res.body, 'Key')) {
					// Per-object DELETE, not the batch DeleteObjects POST: several S3-compatible
					// providers require a Content-MD5 on the batch form (#164/E-19).
					await s3Request(s3Target(dest), 'DELETE', `/${dest.bucket}/${key}`, {}, null)
				}
				token =
					xmlValues(res.body, 'IsTruncated')[0] === 'true'
						? xmlValues(res.body, 'NextContinuationToken')[0]
						: undefined
			} while (token)
			return
		}
	}
}

/**
 * Refuse the run BEFORE a run directory exists when the destination cannot hold it (ST5).
 *
 * Advisory only — the estimate is built from the `size` columns, which can disagree with
 * what is on disk. The mid-copy ENOSPC path in run.ts is the real guard. Not applicable to
 * S3, whose free space is not ours to measure.
 */
export async function checkFreeSpace(dest: Destination, neededBytes: number): Promise<void> {
	if (dest.kind !== 'LOCAL') return
	await mkdir(dest.root, { recursive: true, mode: 0o700 })
	const fs = await statfs(dest.root)
	const free = Number(fs.bavail) * Number(fs.bsize)
	if (free < neededBytes) {
		throw new Error('insufficient free space at the backup destination')
	}
}

/**
 * True when the destination and UPLOAD_DIR sit on the same filesystem (#164/E-14).
 *
 * Path containment is not the only hazard: in the compose setup, pgdata, uploads and
 * backups are all named volumes on one droplet filesystem, so an unpruned backup tree can
 * fill the disk Postgres writes to. The caller warns; it does not refuse, because on a
 * single-volume box this is the only configuration available.
 */
export async function sharesFilesystem(a: string, b: string): Promise<boolean> {
	try {
		const [x, y] = await Promise.all([statfs(a), statfs(b)])
		return Number(x.blocks) === Number(y.blocks) && Number(x.bsize) === Number(y.bsize)
	} catch {
		return false
	}
}
