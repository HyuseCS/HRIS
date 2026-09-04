import type { Config } from 'tailwindcss'
import plugin from 'tailwindcss/plugin'

export default {
	// The theme switch writes `html.dark` from localStorage and never reads the OS. Tailwind's
	// default is `media`, so every `dark:` utility followed prefers-color-scheme instead — the
	// two never agreed, and the whole dark palette was inert under the app's own toggle.
	darkMode: 'class',
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		container: {
			center: true,
			padding: {
				DEFAULT: '1rem',
				sm: '1.5rem',
				lg: '2rem'
			}
		},
		extend: {
			fontFamily: {
				sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif']
			},
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				}
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			}
		}
	},
	plugins: [
		plugin(({ addUtilities }) => {
			addUtilities({
				'.scrollbar-none': {
					'-ms-overflow-style': 'none',
					'scrollbar-width': 'none',
					'&::-webkit-scrollbar': { display: 'none' }
				}
			})
		})
	]
} satisfies Config
