# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server at localhost:4321
npm run build    # Build production site to ./dist/
npm run preview  # Preview production build locally
```

## Architecture

This is a personal website built with **Astro 5** using file-based routing, **Tailwind CSS 4** for styling, and **MDX** for blog content.

### Key Structure

- `src/pages/` - File-based routing (each .astro file = a route)
- `src/content/blog/` - MDX blog posts with frontmatter (title, date, description, tags, draft)
- `src/layouts/Layout.astro` - Base layout with SEO meta tags, Google Fonts
- `src/components/` - Header and Footer components
- `src/styles/global.css` - Design system with custom Tailwind theme

### Design System

The site uses a "Mid-Century Modern / Warm Coffee" aesthetic defined in `global.css`:
- Colors: cream, linen, walnut, cognac, charcoal, warm-gray, espresso
- Fonts: Fraunces (serif headings), DM Sans (body), JetBrains Mono (code)
- Custom utility classes: `.card`, `.btn`, `.btn-primary`, `.btn-secondary`, `.tag`, `.prose`

### Content Collections

Blog posts in `src/content/blog/` use this schema:
```typescript
{
  title: string,
  description?: string,
  date: Date,
  tags?: string[],
  draft?: boolean
}
```

### Deployment

Deploys to GitHub Pages via `.github/workflows/deploy.yml` on push to main. Builds to `gh-pages` branch with CNAME `smithandrew.com`.
