import { defineConfig } from 'vitest/config'
import { sveltekit } from '@sveltejs/kit/vite'

// A SECOND config, not a change to vitest.config.ts — the unit tier's `include` is
// restricted to tests/unit/** and its 97 db-mocking files would fight a real client.
// `plugins: [sveltekit()]` is load-bearing: without it every `$lib/...` import fails to
// resolve and this tier lands non-executable instead of red.
export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['tests/integration/**/*.{test,spec}.ts'],
		globals: true,
		environment: 'node',
		// Real rows in a shared database: never run these files against each other.
		fileParallelism: false
	}
})
