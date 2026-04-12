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

## Deploy To Cloudflare Pages With Wrangler

This repo is set up so Cloudflare deployments can use `wrangler` both locally and in GitHub Actions.

### One-time Cloudflare setup

1. Log in locally:

```bash
wrangler login
```

2. Create the Pages project once:

```bash
wrangler pages project create
```

Use:

- Project name: `book-of-disquiet`
- Production branch: `main`

### Local deploy

```bash
corepack pnpm deploy:cloudflare
```

That builds the site without the GitHub Pages base path and uploads `dist/` with `wrangler pages deploy`.

### GitHub Action deploy

This repo also includes a Cloudflare workflow at [.github/workflows/deploy-cloudflare.yml](/Users/jasonliu/dev/book-of-d/.github/workflows/deploy-cloudflare.yml).

Add these GitHub repository secrets before enabling it:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The workflow:

- installs dependencies
- runs the Cloudflare-targeted Astro build
- deploys with `wrangler pages deploy dist --project-name=book-of-disquiet --branch=main`

### GitHub Pages note

GitHub Pages and Cloudflare Pages use different base-path needs for this repo.

- `pnpm build:github` builds with `/book-of-disquiet`
- `pnpm build:cloudflare` builds without that base path

The Astro config switches behavior via `DEPLOY_TARGET`, so both deployment targets can coexist.

## D1 + Pages Functions

The site can stay a static Astro build while Cloudflare Pages Functions handle shared highlights, notes, related-fragment links, and server-side search through D1.

### What was added

- `functions/api/reader-state.js`: returns shared counts, notes, and related fragments for a slug
- `functions/api/highlights.js`: stores shared highlight events with anonymous cookies and IP-hash rate limiting
- `functions/api/comments.js`: stores page notes with anonymous cookies and IP-hash rate limiting
- `functions/api/search.js`: does weighted token search from D1
- `migrations/0001_initial.sql`: creates the D1 schema
- `scripts/build-d1-seed.mjs`: generates `output/d1-seed.sql` from `book.cleaned/`
- `wrangler.toml`: Cloudflare Pages + D1 config scaffold

### Remote setup through Wrangler

This machine was not logged into Cloudflare when inspected, so remote project/database changes were not applied yet. Once Wrangler auth is fixed and the correct account is selected, the CLI flow is:

```bash
pnpm exec wrangler login
pnpm exec wrangler d1 create book-of-disquiet
```

Update `wrangler.toml` with the returned `database_id` and `preview_database_id`, then run:

```bash
pnpm d1:migrate:remote
pnpm d1:seed:sql
pnpm exec wrangler d1 execute DB --remote --file output/d1-seed.sql
pnpm build:cloudflare
pnpm deploy:cloudflare
```

If the Pages project already exists under a specific Cloudflare account, set `account_id` in `wrangler.toml` or export `CLOUDFLARE_ACCOUNT_ID` before the remote commands.

### Local D1 workflow

```bash
pnpm d1:migrate:local
pnpm d1:seed:sql
pnpm exec wrangler d1 execute DB --local --file output/d1-seed.sql
pnpm build:cloudflare
pnpm cf:dev
```

Then open the local Pages dev server and hit a reader page. Shared highlights and notes will use the local D1 database.

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
