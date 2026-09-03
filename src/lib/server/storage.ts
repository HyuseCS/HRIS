import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, readFile, unlink, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

// Files live OUTSIDE the web root (never in static/) so they are only reachable via
// an authenticated download route. Override the location with UPLOAD_DIR in prod.
const UPLOAD_DIR = process.env.UPLOAD_DIR
	? path.resolve(process.env.UPLOAD_DIR)
	: path.resolve(process.cwd(), 'uploads')

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB
export const ALLOWED_MIME: Record<string, string> = {
	'application/pdf': '.pdf',
	'image/png': '.png',
	'image/jpeg': '.jpg',
	'image/webp': '.webp'
}

export function isAllowedType(mime: string): boolean {
	return mime in ALLOWED_MIME
}

// Sniff the leading bytes to detect the real format, independent of the browser's
// declared MIME (#74). Only the four allowed formats are recognised — anything else
// (e.g. a renamed executable claiming application/pdf) returns null. Callers reject
// when this doesn't match the declared type.
export function sniffMime(bytes: Buffer): string | null {
	const b = bytes
	// PDF: "%PDF-"
	if (b.length >= 5 && b.toString('latin1', 0, 5) === '%PDF-') return 'application/pdf'
	// PNG: 89 50 4E 47 0D 0A 1A 0A
	if (
		b.length >= 8 &&
		b[0] === 0x89 &&
		b[1] === 0x50 &&
		b[2] === 0x4e &&
		b[3] === 0x47 &&
		b[4] === 0x0d &&
		b[5] === 0x0a &&
		b[6] === 0x1a &&
		b[7] === 0x0a
	)
		return 'image/png'
	// JPEG: FF D8 FF
	if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
	// WEBP: "RIFF" + 4 size bytes + "WEBP" (format tag at offset 8)
	if (
		b.length >= 12 &&
		b.toString('latin1', 0, 4) === 'RIFF' &&
		b.toString('latin1', 8, 12) === 'WEBP'
	)
		return 'image/webp'
	return null
}

// True when the bytes genuinely are the declared (already-allowlisted) format.
export function contentMatchesType(bytes: Buffer, declaredMime: string): boolean {
	return sniffMime(bytes) === declaredMime
}

// Resolve `rel` against `root`, refusing anything that escapes it. Extracted from
// resolveKey for #164 so the backup destination writer reuses this exact check instead of
// growing a second one — two implementations of a containment check drift, and only one of
// them gets fixed.
//
// The root itself is REJECTED (#164/E-18): '' and '.' both resolve to `root`, and every
// caller here wants a file, never the directory. Returning the directory would let a null
// or empty storageKey address the whole store.
//
// The `+ path.sep` is load-bearing: a bare startsWith(root) would accept a sibling whose
// name merely begins with the root's ("/data/uploads-evil/x").
export function resolveWithin(root: string, rel: string): string {
	const base = path.resolve(root)
	const abs = path.resolve(base, rel)
	if (!abs.startsWith(base + path.sep)) {
		throw new Error('Invalid storage key')
	}
	return abs
}

// Resolve a storageKey to an absolute path, refusing anything that escapes UPLOAD_DIR.
function resolveKey(storageKey: string): string {
	return resolveWithin(UPLOAD_DIR, storageKey)
}

export interface SavedFile {
	storageKey: string
	size: number
}

// Persist bytes under `<subdir>/<uuid><ext>`; ext is derived from the (validated) mime.
export async function saveFile(bytes: Buffer, mime: string, subdir: string): Promise<SavedFile> {
	const ext = ALLOWED_MIME[mime] ?? ''
	const key = path.posix.join(subdir, `${randomUUID()}${ext}`)
	const abs = resolveKey(key)
	await mkdir(path.dirname(abs), { recursive: true })
	await writeFile(abs, bytes)
	return { storageKey: key, size: bytes.byteLength }
}

export async function readStoredFile(storageKey: string): Promise<Buffer> {
	return readFile(resolveKey(storageKey))
}

export async function deleteStoredFile(storageKey: string): Promise<void> {
	try {
		await unlink(resolveKey(storageKey))
	} catch (e: unknown) {
		// Missing file is fine — the DB row is the source of truth.
		if ((e as NodeJS.ErrnoException)?.code !== 'ENOENT') throw e
	}
}

export interface StoredEntry {
	/** posix storageKey relative to UPLOAD_DIR */
	key: string
	mtimeMs: number
}

async function walkFiles(dir: string, out: StoredEntry[]): Promise<void> {
	let entries
	try {
		entries = await readdir(dir, { withFileTypes: true })
	} catch (e: unknown) {
		if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return
		throw e
	}
	for (const e of entries) {
		const abs = path.join(dir, e.name)
		if (e.isDirectory()) await walkFiles(abs, out)
		else if (e.isFile()) {
			const s = await stat(abs)
			out.push({
				key: path.relative(UPLOAD_DIR, abs).split(path.sep).join('/'),
				mtimeMs: s.mtimeMs
			})
		}
	}
}

// Every file currently on disk under UPLOAD_DIR, as posix storageKeys with mtimes.
// The orphan sweep diffs these against the storageKeys in the document tables (#74).
export async function listStoredKeys(): Promise<StoredEntry[]> {
	const out: StoredEntry[] = []
	await walkFiles(UPLOAD_DIR, out)
	return out
}
