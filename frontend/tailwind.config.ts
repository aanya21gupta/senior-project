import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: '#209dd7',
        secondary: '#753991',
        navy: '#032147',
      },
    },
  },
  plugins: [],
}

export default config
