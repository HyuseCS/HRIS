import js from '@eslint/js'
import ts from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import svelte from 'eslint-plugin-svelte'
import svelteParser from 'svelte-eslint-parser'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

/** @type {import('eslint').Linter.Config[]} */
export default [
	// The `.claude/` + `.agents/` entries are the vendored vc-pro-max harness: third-party
	// scripts that `vc-update` diffs against upstream, so we do not lint or reformat them.
	{
		ignores: [
			'build/',
			'.svelte-kit/',
			'node_modules/',
			'dist/',
			'.claude/',
			'.agents/',
			'process/'
		]
	},
	js.configs.recommended,
	{
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
			globals: { ...globals.browser, ...globals.node }
		},
		rules: {
			// Honor the repo's `_`-prefixed throwaway convention (e.g. `[, _i]`, `_range`).
			'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
		}
	},
	{
		files: ['**/*.ts'],
		languageOptions: { parser: tsParser },
		plugins: { '@typescript-eslint': ts },
		rules: {
			...ts.configs.recommended.rules,
			// TypeScript resolves identifiers/types itself; ESLint's no-undef only
			// produces false positives on type refs (App, NodeJS, HTMLFormElement…).
			'no-undef': 'off',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
			]
		}
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parser: svelteParser,
			parserOptions: { parser: tsParser }
		},
		plugins: { svelte },
		rules: {
			...svelte.configs.recommended.rules,
			'no-undef': 'off',
			// Pre-existing a11y compiler warnings (label/control association) — surfaced
			// but not gate-blocking; svelte-check reports the same as warnings. Tracked as follow-up.
			'svelte/valid-compile': 'warn'
		}
	},
	prettier
]
