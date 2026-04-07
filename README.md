# Book of Disquiet

`book-of-disquiet` is a workspace for a cleaned Markdown edition of *The Book of Disquiet* plus an Astro-based reading site built on top of that corpus.

The repo includes both the cleaned corpus and the app/source files used to browse it locally.

## What This Repo Contains

- `book.cleaned/`: the canonical cleaned Markdown corpus
- `docs/`: maintenance notes, including the corpus validation checklist
- `src/`: Astro pages, layouts, styles, and client-side reading UI
- `scripts/`: the PDF import/regeneration workflow
- `package.json`: Astro/Tailwind frontend package metadata
- `pyproject.toml`: Python metadata for the PDF import workflow
- `dist/`, `.astro/`, `node_modules/`, `output/`, `.venv/`: generated artifacts, dependencies, or local runtime state

At the time of inspection, `book.cleaned/` contains 401 Markdown fragments, ranging from `001-fragment-1.md` through `521-a-voyage-i-never-made-iv.md`.

## Corpus

`book.cleaned/` is the source of truth for the text.

Each fragment is stored as a standalone Markdown file. Project notes indicate the corpus was generated from:

- Source PDF: `/Users/jasonliu/Desktop/Book of Disquiet, The - Fernando Pessoa.pdf`
- Regenerated on: `2026-04-02`

Useful corpus-related paths:

- [book.cleaned](/Users/jasonliu/dev/book-of-d/book.cleaned)
- [proofread-manifest.json](/Users/jasonliu/dev/book-of-d/book.cleaned/proofread-manifest.json)
- [corpus-healing-checklist.md](/Users/jasonliu/dev/book-of-d/docs/corpus-healing-checklist.md)

If you are editing content, preserve existing filenames, ordering, and front matter shape. The surrounding tooling expects lexicographic file order to remain stable.

## App Structure

Key source files:

- [src/lib/book.ts](/Users/jasonliu/dev/book-of-d/src/lib/book.ts): loads and parses `book.cleaned/*.md`
- [src/pages/index.astro](/Users/jasonliu/dev/book-of-d/src/pages/index.astro): landing page and search entry point
- [src/pages/read/[slug].astro](/Users/jasonliu/dev/book-of-d/src/pages/read/[slug].astro): fragment reader pages
- [src/scripts/book-ui.ts](/Users/jasonliu/dev/book-of-d/src/scripts/book-ui.ts): browser-side reading interactions
- [scripts/import_desktop_pdf.py](/Users/jasonliu/dev/book-of-d/scripts/import_desktop_pdf.py): regeneration pipeline from the source PDF

## Site Workflow

The project metadata shows this repo is intended to run as an Astro site with Tailwind:

```bash
corepack pnpm install
corepack pnpm dev
```

Then open [http://localhost:4321](http://localhost:4321).

Other common commands:

```bash
corepack pnpm build
corepack pnpm preview
```

## Deploy To Cloudflare Pages

This repo builds as a static Astro site, so the easiest Cloudflare setup is a Pages project connected to GitHub.

Recommended dashboard settings:

- Framework preset: `Astro`
- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: leave blank

Deployment flow:

1. Open Cloudflare Workers & Pages.
2. Create a new Pages application.
3. Import the GitHub repo `jxnl/book-of-disquiet`.
4. Apply the settings above.
5. Save and deploy.

After that, Cloudflare will automatically rebuild the site whenever you push to `main`, and it will create preview deployments for other branches.

If you prefer local manual deploys instead of Git integration, you can also build locally and upload `dist/` with Wrangler:

```bash
corepack pnpm build
npx wrangler pages project create
npx wrangler pages deploy dist
```

## Python Import Workflow

The Python project description says this repo also supports a Desktop-PDF import pipeline for regenerating the corpus:

```bash
uv run python scripts/import_desktop_pdf.py
```

## Recommended Cleanup

The following directories are usually machine-generated and should not be treated as hand-authored source:

- `dist/`
- `.astro/`
- `node_modules/`
- `output/`
- `.venv/`

If the goal is to keep a clean version-controlled project, those directories are good candidates to regenerate rather than preserve.
