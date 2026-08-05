// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';
import icon from 'astro-icon';

// https://astro.build/config
export default defineConfig({
  devToolbar: { enabled: false },
  site: 'https://smithandrew.com',
  vite: {
    plugins: [tailwindcss()]
  },
  // Phosphor icons via astro-icon. One icon family for the whole project,
  // no hand-rolled SVG paths.
  integrations: [mdx(), icon()],
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
    },
  },
});
