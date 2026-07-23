// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  devToolbar: { enabled: false },
  site: 'https://smithandrew.com',
  vite: {
    plugins: [tailwindcss()]
  },
  integrations: [mdx(), react()],
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
    },
  },
});
