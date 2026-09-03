import { describe, it, expect, vi, afterEach } from 'vitest'
import { canonicalRequest, stringToSign, signV4, s3Request } from '$lib/server/backup/s3'

// ─── Official AWS SigV4 test-suite vectors ───────────────────────────────────────────
//
// EVERY expected value below is COPIED VERBATIM from AWS's own published test suite, via
// the AWS-owned mirror at
//   https://github.com/awslabs/aws-c-auth/tree/main/tests/aws-signing-test-suite/v4
// (the standalone aws-sig-v4-test-suite.zip download AWS used to host is retired — 404).
//
// This is the condition AD-005 rests on. We ship a hand-written signer instead of the
// ~15MB AWS SDK, and there is no S3-compatible environment to test against, so the ONLY
// thing standing between us and an unverifiable signer is an expectation we did not
// author. A hex value produced by our own signer and pasted back here would prove that
// the function is deterministic and nothing else. Do not regenerate these.
//
// Shared context (every case): tests/aws-signing-test-suite/v4/<case>/context.json
const CREDS = {
	accessKeyId: 'AKIDEXAMPLE',
	secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
	region: 'us-east-1',
	service: 'service'
}
const NOW = new Date('2015-08-30T12:36:00Z')
const SCOPE = '20150830/us-east-1/service/aws4_request'
const AMZ_DATE = '20150830T123600Z'
// sha256 of the empty string — the payload hash in every GET case.
const EMPTY_SHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

// ─── get-vanilla ───
const VANILLA = {
	method: 'GET',
	path: '/',
	query: {},
	headers: { Host: 'example.amazonaws.com', 'X-Amz-Date': AMZ_DATE },
	payloadHash: EMPTY_SHA
}
const VANILLA_CANONICAL = `GET
/

host:example.amazonaws.com
x-amz-date:20150830T123600Z

host;x-amz-date
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
const VANILLA_STS = `AWS4-HMAC-SHA256
20150830T123600Z
20150830/us-east-1/service/aws4_request
bb579772317eb040ac9ed261061d46c1f17a8133879d6129b6e1c25292927e63`
const VANILLA_SIG = '5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31'

// ─── get-vanilla-query-order-key-case: query params are sorted, not sent in order ───
const QUERY_ORDER_CANONICAL = `GET
/
Param1=value1&Param2=value2
host:example.amazonaws.com
x-amz-date:20150830T123600Z

host;x-amz-date
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
const QUERY_ORDER_SIG = 'b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500'

// ─── get-unreserved: RFC 3986 unreserved characters must NOT be percent-encoded ───
const UNRESERVED_PATH = '/-._~0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const UNRESERVED_CANONICAL = `GET
${UNRESERVED_PATH}

host:example.amazonaws.com
x-amz-date:20150830T123600Z

host;x-amz-date
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
const UNRESERVED_SIG = '07ef7494c76fa4850883e2b006601f940f8a34d404d0cfa977f52a65bbf5f24f'

// ─── post-x-www-form-urlencoded: a real body, hashed into x-amz-content-sha256 ───
const POST_BODY_SHA = '9095672bbd1f56dfc5b65f3e153adc8731a4a654192329106275f4c7b24d0b6e'
const POST = {
	method: 'POST',
	path: '/',
	query: {},
	headers: {
		'Content-Type': 'application/x-www-form-urlencoded',
		Host: 'example.amazonaws.com',
		'Content-Length': '13',
		'X-Amz-Content-Sha256': POST_BODY_SHA,
		'X-Amz-Date': AMZ_DATE
	},
	payloadHash: POST_BODY_SHA
}
const POST_CANONICAL = `POST
/

content-length:13
content-type:application/x-www-form-urlencoded
host:example.amazonaws.com
x-amz-content-sha256:9095672bbd1f56dfc5b65f3e153adc8731a4a654192329106275f4c7b24d0b6e
x-amz-date:20150830T123600Z

content-length;content-type;host;x-amz-content-sha256;x-amz-date
9095672bbd1f56dfc5b65f3e153adc8731a4a654192329106275f4c7b24d0b6e`
const POST_STS = `AWS4-HMAC-SHA256
20150830T123600Z
20150830/us-east-1/service/aws4_request
b1edd1d03544c25390e32085d55b57acc9a3961bb59415ff86c45c3d89d16cfb`
const POST_SIG = 'd3875051da38690788ef43de4db0d8f280229d82040bfac253562e56c3f20e0b'

// T-U-07 — the canonicalisation half of the signature (S9 / AD-005).
describe('canonicalRequest + stringToSign against official AWS vectors (T-U-07)', () => {
	it('reproduces get-vanilla byte for byte', () => {
		expect(canonicalRequest(VANILLA)).toBe(VANILLA_CANONICAL)
		expect(stringToSign(VANILLA_CANONICAL, AMZ_DATE, SCOPE)).toBe(VANILLA_STS)
	})

	it('sorts query parameters by key (get-vanilla-query-order-key-case)', () => {
		// Deliberately supplied in the wrong order — the signer must sort them.
		expect(canonicalRequest({ ...VANILLA, query: { Param2: 'value2', Param1: 'value1' } })).toBe(
			QUERY_ORDER_CANONICAL
		)
	})

	it('leaves RFC 3986 unreserved characters unencoded (get-unreserved)', () => {
		expect(canonicalRequest({ ...VANILLA, path: UNRESERVED_PATH })).toBe(UNRESERVED_CANONICAL)
	})

	it('reproduces post-x-www-form-urlencoded, including the real payload hash', () => {
		expect(canonicalRequest(POST)).toBe(POST_CANONICAL)
		expect(stringToSign(POST_CANONICAL, AMZ_DATE, SCOPE)).toBe(POST_STS)
	})
})

// T-U-08 — the full signature, including the signed-header list and Credential scope.
describe('signV4 against official AWS vectors (T-U-08)', () => {
	const auth = (r: typeof VANILLA) => signV4(r, CREDS, NOW).authorization

	it('reproduces the get-vanilla Authorization header exactly', () => {
		expect(auth(VANILLA)).toBe(
			`AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=${VANILLA_SIG}`
		)
	})

	it('reproduces get-vanilla-query-order-key-case', () => {
		expect(auth({ ...VANILLA, query: { Param2: 'value2', Param1: 'value1' } })).toContain(
			`Signature=${QUERY_ORDER_SIG}`
		)
	})

	it('reproduces get-unreserved', () => {
		expect(auth({ ...VANILLA, path: UNRESERVED_PATH })).toContain(`Signature=${UNRESERVED_SIG}`)
	})

	it('reproduces post-x-www-form-urlencoded, signed headers and all', () => {
		expect(auth(POST)).toBe(
			`AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=content-length;content-type;host;x-amz-content-sha256;x-amz-date, Signature=${POST_SIG}`
		)
	})

	it('supplies x-amz-date itself, so a caller cannot forget it', () => {
		const headers = signV4({ ...VANILLA, headers: { Host: 'example.amazonaws.com' } }, CREDS, NOW)
		expect(headers['x-amz-date']).toBe(AMZ_DATE)
		expect(headers.authorization).toContain(`Signature=${VANILLA_SIG}`)
	})

	it('changes the signature when any signed input changes', () => {
		// Cheap mutation guard: a signer that ignored its input would pass every case above.
		expect(auth({ ...VANILLA, method: 'PUT' })).not.toContain(VANILLA_SIG)
		expect(auth({ ...VANILLA, path: '/other' })).not.toContain(VANILLA_SIG)
		expect(auth({ ...VANILLA, payloadHash: 'deadbeef' })).not.toContain(VANILLA_SIG)
	})
})

// T-U-13 (signer half) — the S3 caller fails closed and signs the real payload.
describe('s3Request (T-U-13)', () => {
	afterEach(() => vi.unstubAllGlobals())

	const dest = {
		endpoint: 'https://sgp1.example.com',
		region: 'sgp1',
		bucket: 'veent-backups',
		accessKeyId: 'AKIDEXAMPLE',
		secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY'
	}
	const BODY = Buffer.from('hello')
	// sha256('hello') — computed with sha256sum, not with our own signer.
	const BODY_SHA = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'

	it('signs the real payload hash and never UNSIGNED-PAYLOAD', async () => {
		const fetchMock = vi.fn(
			async (_url: string, _init: RequestInit) => new Response('', { status: 200 })
		)
		vi.stubGlobal('fetch', fetchMock)

		await s3Request(dest, 'PUT', '/veent-backups/org_a/run/manifest.json', {}, BODY)

		const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>
		expect(headers['x-amz-content-sha256']).toBe(BODY_SHA)
		expect(JSON.stringify(headers)).not.toContain('UNSIGNED-PAYLOAD')
		expect(headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\//)
	})

	it('resolves on 2xx', async () => {
		vi.stubGlobal('fetch', async () => new Response('<ok/>', { status: 200 }))
		await expect(s3Request(dest, 'GET', '/veent-backups', {}, null)).resolves.toMatchObject({
			status: 200,
			body: '<ok/>'
		})
	})

	it('fails closed on a non-2xx response', async () => {
		vi.stubGlobal('fetch', async () => new Response('AccessDenied', { status: 403 }))
		await expect(s3Request(dest, 'PUT', '/veent-backups/x', {}, BODY)).rejects.toThrow(/403/)
	})

	// The wire query must be byte-identical to the query that was signed. URLSearchParams is
	// form-urlencoded and diverges from RFC 3986 on space, `*` and `~`, so a continuation token
	// carrying one of those used to be signed one way and sent another -> SignatureDoesNotMatch.
	it.each(['tok~en', 'tok*en', 'tok en'])(
		'sends the signed canonical query verbatim for a token containing %j',
		async (token) => {
			const fetchMock = vi.fn(
				async (_url: string, _init: RequestInit) => new Response('<ok/>', { status: 200 })
			)
			vi.stubGlobal('fetch', fetchMock)

			await s3Request(dest, 'GET', '/veent-backups', { 'continuation-token': token }, null)

			const sent = new URL(fetchMock.mock.calls[0][0] as string).search.slice(1)
			// canonicalQuery's own rules: RFC 3986, so `~` survives and space and `*` are hex.
			const expected = `continuation-token=${encodeURIComponent(token).replace(
				/[!'()*]/g,
				(c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
			)}`
			expect(sent).toBe(expected)
			// The exact form-urlencoded output that used to go out instead.
			expect(sent).not.toBe(new URLSearchParams({ 'continuation-token': token }).toString())
		}
	)

	it('aborts rather than hanging when the socket stalls', async () => {
		vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
			expect(init.signal).toBeInstanceOf(AbortSignal)
			return new Response('<ok/>', { status: 200 })
		})
		await expect(s3Request(dest, 'GET', '/veent-backups', {}, null)).resolves.toMatchObject({
			status: 200
		})
	})

	it('never puts the secret key in the thrown message', async () => {
		vi.stubGlobal('fetch', async () => new Response('AccessDenied', { status: 403 }))
		await expect(s3Request(dest, 'PUT', '/veent-backups/x', {}, BODY)).rejects.toThrow(
			expect.objectContaining({
				message: expect.not.stringContaining(dest.secretAccessKey)
			})
		)
	})
})
