# DRBTaskforce - Eleventy Setup

This branch uses [Eleventy (11ty)](https://www.11ty.dev/) for templating and build process.

## Structure

```
├── src/
│   ├── _includes/       # Layout templates
│   │   └── base.njk     # Base layout (nav, footer, head)
│   ├── _data/           # Global data files
│   ├── assets/          # Static assets (CSS, images, PDFs)
│   ├── index.njk        # Home page
│   └── token/           # Token page directory
├── _site/               # Build output (gitignored)
├── .eleventy.js         # Eleventy configuration
└── package.json         # Node dependencies
```

## Development

### First time setup:
```bash
npm install
```

### Run dev server with live reload:
```bash
npm run dev
```

Visit: http://localhost:8080

### Build for production:
```bash
npm run build
```

## Deployment

Pushes to `main` trigger automatic deployment via GitHub Actions.

The workflow:
1. Installs dependencies
2. Builds site with Eleventy  
3. Deploys `_site/` to GitHub Pages

## Benefits of This Setup

1. **Shared Templates** - Nav, footer, head in one place (`_includes/base.njk`)
2. **Easy Updates** - Change nav once, updates everywhere
3. **Fast Dev** - Live reload during development
4. **GitHub Actions** - Automatic deployment on push
5. **Clean Separation** - Content vs. presentation
6. **Extensible** - Easy to add new pages or components

## Adding a New Page

1. Create `src/newpage.njk`
2. Add frontmatter:
   ```yaml
   ---
   layout: base.njk
   title: "Page Title"
   description: "Page description"
   ---
   ```
3. Add content (just the sections, no nav/footer)
4. Build and deploy!

## CSS Management

All styles are in `/src/assets/css/main.css` - shared across all pages.

Update once, applies everywhere.
