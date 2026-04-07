# AGENTS.md

## Project Overview

- This workspace is an Astro + Tailwind static reader for *The Book of Disquiet*.
- `book.cleaned/` is the canonical cleaned Markdown corpus rendered by the site.
- The current source PDF is `/Users/jasonliu/Desktop/Book of Disquiet, The - Fernando Pessoa.pdf`.
- `scripts/import_desktop_pdf.py` regenerates `book.cleaned/` directly from that Desktop PDF and moves the previous corpus into `~/.Trash/codex/`.

## Local Commands

- Install frontend deps: `corepack pnpm install`
- Run the dev server: `corepack pnpm dev`
- Build the site: `corepack pnpm build`
- Preview the production build: `corepack pnpm preview`
- Regenerate the English corpus from the Desktop PDF: `uv run python scripts/import_desktop_pdf.py`

## Code Map

- `src/lib/book.ts` loads `book.cleaned/*.md`, parses the simple front matter format, renders Markdown to HTML, and builds normalized search text.
- `src/pages/index.astro` renders the landing page, starts a randomized reading order, and performs client-side search.
- `src/pages/read/[slug].astro` renders each fragment page, handles session-based previous/next navigation, query highlighting, and saved text highlights in `localStorage`.
- `src/pages/search-index.json.ts` exposes the generated search index.
- `src/layouts/BookLayout.astro` and `src/styles/global.css` define the site shell and reading styles.

## Editing Guidelines

- Prefer the smallest durable change that preserves the current structure and copy.
- For simple UI restyling, limit edits to targeted typography, spacing, and styling changes unless a broader redesign is explicitly requested.
- Treat `book.cleaned/` as the source of truth for site content. Do not bulk-regenerate or overwrite it unless the task is specifically about the text pipeline.
- Do not use `rm` or `rm -rf` for manual cleanup. Move retired files/directories into a timestamped folder under `~/.Trash/codex/` so they can be recovered.
- Preserve YAML front matter fields and the existing Markdown file naming/order in `book.cleaned/`; fragment ordering is derived from lexicographic slug sort.
- If you change highlight or search behavior, verify both `/` and `/read/[slug]/`, including keyboard navigation and query-string search navigation.
- If you change corpus parsing/rendering in `src/lib/book.ts`, check representative files with headings, blockquotes, italics/bold, and front matter before assuming all fragments still render correctly.
- Generated artifacts and dependency folders such as `dist/`, `.astro/`, `node_modules/`, `output/`, and `.venv/` should not be treated as hand-authored source.

## Python Pipeline Notes

- `scripts/import_desktop_pdf.py` extracts numbered fragments and the anthology section from the Desktop PDF, preserves lacuna markers as `.....`, and writes `book.cleaned/*.md` plus `book.cleaned/proofread-manifest.json`.
- Fragment count is not treated as a correctness signal. Validate the corpus by checking source-page ranges, first/last fragments, artifact scans, and representative excerpts against the source PDF.
- If a regeneration needs manual healing, use `docs/corpus-healing-checklist.md` and shard review work across subagents with concrete page ranges and a manual spot-check requirement.

## Validation

- For frontend changes, run `corepack pnpm build` at minimum.
- For corpus changes, run `uv run python scripts/import_desktop_pdf.py`, then run artifact scans, inspect representative Markdown files, and rebuild the site.
