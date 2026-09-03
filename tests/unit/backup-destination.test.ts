import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
	destinationFromEnv,
	writeObject,
	listRunIds,
	deleteRun,
	checkFreeSpace,
	type Destination
} from '$lib/server/backup/destination'

const S3_DEST: Destination = {
	kind: 'S3',
	endpoint: 'https://sgp1.example.com',
	region: 'sgp1',
	bucket: 'veent-backups',
	prefix: 'veent-hris',
	accessKeyId: 'AKIDEXAMPLE',
	secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY'
}

let root: string
beforeEach(async () => {
	root = await mkdtemp(path.join(tmpdir(), 'veent-backup-test-'))
})
afterEach(() => {
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

// T-U-10 — tenant partitioning is a path property, not a filter (S6); traversal is
// refused at the writer (S1).
describe('writeObject LOCAL (T-U-10)', () => {
	it("places an org's object under <root>/<orgId>/ and nowhere else", async () => {
		const dest: Destination = { kind: 'LOCAL', root }
		await writeObject(
			dest,
			'org_a/2026-08-22T023000Z-a1b2/files/employees/e1/x.pdf',
			Buffer.from('pdf')
		)
		const abs = path.join(root, 'org_a/2026-08-22T023000Z-a1b2/files/employees/e1/x.pdf')
		expect((await readFile(abs)).toString()).toBe('pdf')
	})

	it('refuses a relPath that escapes the destination root', async () => {
		const dest: Destination = { kind: 'LOCAL', root }
		await expect(writeObject(dest, '../escaped.pdf', Buffer.from('x'))).rejects.toThrow()
		await expect(writeObject(dest, 'org_a/../../escaped.pdf', Buffer.from('x'))).rejects.toThrow()
		await expect(writeObject(dest, '/etc/passwd', Buffer.from('x'))).rejects.toThrow()
	})

	it('refuses an empty relPath — the root is a directory, never an object (E-18)', async () => {
		const dest: Destination = { kind: 'LOCAL', root }
		await expect(writeObject(dest, '', Buffer.from('x'))).rejects.toThrow()
		await expect(writeObject(dest, '.', Buffer.from('x'))).rejects.toThrow()
	})

	it('writes 0600 files inside 0700 directories (S3 — at-rest permissions)', async () => {
		const dest: Destination = { kind: 'LOCAL', root }
		await writeObject(dest, 'org_a/run1/manifest.json', Buffer.from('{}'))
		const f = await stat(path.join(root, 'org_a/run1/manifest.json'))
		const d = await stat(path.join(root, 'org_a/run1'))
		expect(f.mode & 0o777).toBe(0o600)
		expect(d.mode & 0o777).toBe(0o700)
	})
})

describe('listRunIds / deleteRun LOCAL (E-09)', () => {
	it('lists only the run directories of the org asked for', async () => {
		const dest: Destination = { kind: 'LOCAL', root }
		await writeObject(dest, 'org_a/run1/manifest.json', Buffer.from('{}'))
		await writeObject(dest, 'org_a/run2/manifest.json', Buffer.from('{}'))
		await writeObject(dest, 'org_b/run9/manifest.json', Buffer.from('{}'))
		expect((await listRunIds(dest, 'org_a')).sort()).toEqual(['run1', 'run2'])
		expect(await listRunIds(dest, 'org_b')).toEqual(['run9'])
	})

	it('returns an empty list for an org that has never been backed up', async () => {
		expect(await listRunIds({ kind: 'LOCAL', root }, 'org_never')).toEqual([])
	})

	it('deletes a run tree and is idempotent (E-09 — rows outlive directories)', async () => {
		const dest: Destination = { kind: 'LOCAL', root }
		await writeObject(dest, 'org_a/run1/files/e/x.pdf', Buffer.from('x'))
		await deleteRun(dest, 'org_a', 'run1')
		expect(await listRunIds(dest, 'org_a')).toEqual([])
		// Second call must not throw: runsToPrune re-selects already-pruned runs forever.
		await expect(deleteRun(dest, 'org_a', 'run1')).resolves.toBeUndefined()
	})

	it('refuses a runId that tries to escape the org directory', async () => {
		const dest: Destination = { kind: 'LOCAL', root }
		await expect(deleteRun(dest, 'org_a', '../../..')).rejects.toThrow()
	})
})

// T-U-12 — disk-full is refused up front, before any object is written (ST5).
//
// Deliberately NOT a statfs stub. A stub proves the comparison; it does not prove that
// statfs is called at all, nor that the bsize/bavail units were multiplied the right way
// round. Two impossible-to-be-wrong real values prove both.
describe('checkFreeSpace (T-U-12)', () => {
	it('throws when the run needs more space than the destination has', async () => {
		await expect(checkFreeSpace({ kind: 'LOCAL', root }, Number.MAX_SAFE_INTEGER)).rejects.toThrow(
			/insufficient free space at the backup destination/
		)
	})

	it('passes when the run needs one byte', async () => {
		await expect(checkFreeSpace({ kind: 'LOCAL', root }, 1)).resolves.toBeUndefined()
	})

	it('is a no-op for S3 — free space is not ours to measure', async () => {
		await expect(checkFreeSpace(S3_DEST, Number.MAX_SAFE_INTEGER)).resolves.toBeUndefined()
	})
})

// T-U-13 — the S3 path signs the real payload and fails closed (S9/ST7).
describe('writeObject S3 (T-U-13)', () => {
	it('PUTs to <bucket>/<prefix>/<relPath> with the real payload hash', async () => {
		const fetchMock = vi.fn(async () => new Response('', { status: 200 }))
		vi.stubGlobal('fetch', fetchMock)
		await writeObject(S3_DEST, 'org_a/run1/manifest.json', Buffer.from('hello'))

		const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
		expect(url).toBe('https://sgp1.example.com/veent-backups/veent-hris/org_a/run1/manifest.json')
		expect(init.method).toBe('PUT')
		const headers = init.headers as Record<string, string>
		// sha256('hello'), computed with sha256sum — not with our own signer.
		expect(headers['x-amz-content-sha256']).toBe(
			'2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
		)
		expect(JSON.stringify(headers)).not.toContain('UNSIGNED-PAYLOAD')
	})

	it('rejects on a non-2xx response rather than reporting a phantom success', async () => {
		vi.stubGlobal('fetch', async () => new Response('AccessDenied', { status: 403 }))
		await expect(writeObject(S3_DEST, 'org_a/run1/x', Buffer.from('x'))).rejects.toThrow(/403/)
	})
})

// E-19 — a single unpaginated ListObjectsV2 silently caps at 1000 keys.
describe('listRunIds S3 pagination (E-19)', () => {
	const page = (prefixes: string[], next?: string) =>
		`<?xml version="1.0"?><ListBucketResult>${prefixes
			.map((p) => `<CommonPrefixes><Prefix>${p}</Prefix></CommonPrefixes>`)
			.join('')}<IsTruncated>${next ? 'true' : 'false'}</IsTruncated>${
			next ? `<NextContinuationToken>${next}</NextContinuationToken>` : ''
		}</ListBucketResult>`

	it('follows IsTruncated / NextContinuationToken to the end', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(page(['veent-hris/org_a/run1/', 'veent-hris/org_a/run2/'], 'TOKEN1'), {
					status: 200
				})
			)
			.mockResolvedValueOnce(new Response(page(['veent-hris/org_a/run3/']), { status: 200 }))
		vi.stubGlobal('fetch', fetchMock)

		expect(await listRunIds(S3_DEST, 'org_a')).toEqual(['run1', 'run2', 'run3'])
		expect(fetchMock).toHaveBeenCalledTimes(2)
		const secondUrl = fetchMock.mock.calls[1][0] as string
		expect(secondUrl).toContain('continuation-token=TOKEN1')
	})
})

describe('deleteRun S3 (E-19 — per-object DELETE, not the batch POST)', () => {
	it('lists the run prefix and deletes each key individually', async () => {
		const listBody = `<?xml version="1.0"?><ListBucketResult><Contents><Key>veent-hris/org_a/run1/manifest.json</Key></Contents><Contents><Key>veent-hris/org_a/run1/files/x.pdf</Key></Contents><IsTruncated>false</IsTruncated></ListBucketResult>`
		const calls: { method: string; url: string }[] = []
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, init: RequestInit) => {
				calls.push({ method: init.method as string, url })
				return new Response(init.method === 'GET' ? listBody : '', { status: 200 })
			})
		)

		await deleteRun(S3_DEST, 'org_a', 'run1')

		const deletes = calls.filter((c) => c.method === 'DELETE')
		expect(deletes).toHaveLength(2)
		// The batch DeleteObjects POST requires Content-MD5 on several S3-compatible
		// providers, so it is deliberately not used.
		expect(calls.some((c) => c.method === 'POST')).toBe(false)
		expect(deletes[0].url).toContain('/veent-backups/veent-hris/org_a/run1/')
	})
})

describe('destinationFromEnv (AD-004 — credentials are env-only)', () => {
	const saved = { ...process.env }
	afterEach(() => {
		process.env = { ...saved }
	})

	it('reads BACKUP_DIR for a LOCAL destination', () => {
		process.env.BACKUP_DIR = '/data/backups'
		expect(destinationFromEnv('LOCAL')).toEqual({ kind: 'LOCAL', root: '/data/backups' })
	})

	it('throws a named error when BACKUP_DIR is missing', () => {
		delete process.env.BACKUP_DIR
		expect(() => destinationFromEnv('LOCAL')).toThrow(/BACKUP_DIR/)
	})

	it('names the missing S3 variables without printing any value', () => {
		process.env.BACKUP_S3_ENDPOINT = 'https://sgp1.example.com'
		process.env.BACKUP_S3_REGION = 'sgp1'
		process.env.BACKUP_S3_BUCKET = ''
		process.env.BACKUP_S3_ACCESS_KEY_ID = 'AKIDEXAMPLE'
		process.env.BACKUP_S3_SECRET_ACCESS_KEY = 'super-secret-value'
		try {
			destinationFromEnv('S3')
			throw new Error('expected destinationFromEnv to throw')
		} catch (e) {
			const msg = (e as Error).message
			expect(msg).toContain('BACKUP_S3_BUCKET')
			expect(msg).not.toContain('super-secret-value')
			expect(msg).not.toContain('AKIDEXAMPLE')
		}
	})

	it('builds an S3 destination when every variable is set', () => {
		process.env.BACKUP_S3_ENDPOINT = 'https://sgp1.example.com'
		process.env.BACKUP_S3_REGION = 'sgp1'
		process.env.BACKUP_S3_BUCKET = 'veent-backups'
		process.env.BACKUP_S3_PREFIX = 'veent-hris'
		process.env.BACKUP_S3_ACCESS_KEY_ID = 'AKIDEXAMPLE'
		process.env.BACKUP_S3_SECRET_ACCESS_KEY = 'secret'
		expect(destinationFromEnv('S3')).toEqual({
			kind: 'S3',
			endpoint: 'https://sgp1.example.com',
			region: 'sgp1',
			bucket: 'veent-backups',
			prefix: 'veent-hris',
			accessKeyId: 'AKIDEXAMPLE',
			secretAccessKey: 'secret'
		})
	})
})
