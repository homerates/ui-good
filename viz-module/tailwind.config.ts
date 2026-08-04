import type { Config } from 'tailwindcss';

// Tailwind reads color/spacing primitives FROM the design system tokens (src/design-system/tokens.ts)
// rather than duplicating a second palette here — tokens.ts is the single source of truth,
// consumed both by Tailwind (for utility classes) and directly by components (for Recharts/
// Framer Motion props, which can't take Tailwind classes).
import { colors, fontSizes } from './src/design-system/tokens';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors,
      fontSize: fontSizes,
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
