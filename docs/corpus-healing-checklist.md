# Corpus Healing Checklist

Use this checklist after regenerating `book.cleaned/`.

## Corpus Contract

- One `.md` file per readable fragment in `book.cleaned/`, sorted by slug.
- Front matter must include `title` and `chapter_label`; use `fragment_number` for numbered sections.
- Markdown bodies should use blank-line paragraph breaks. `#` headings and `>` blockquotes are allowed.
- `00-front-matter.md` is intentionally ignored by `src/lib/book.ts`.

## Validation

- Verify fragment order and inspect the first/last fragment in each shard.
- Check that chapter labels, titles, and body text are not shifted by one fragment.
- Check title detection: short standalone headings like `LITANY` should become front matter titles, but ordinary opening sentences should stay in the body.
- Check that bodies are non-empty and paragraph breaks survived import.
- Search for extraction artifacts:

```bash
rg -nUP '\(cid:\d+\)|�|[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]' book.cleaned
```

- Search for suspicious line-wrap damage:

```bash
rg -n '\w-\s+\w' book.cleaned
```

- Spot-check 2-3 fragments per shard against the source PDF page range in `book.cleaned/proofread-manifest.json`.
- Rebuild and browser-smoke after each correction batch.

## Shards

- `001-120`
- `121-240`
- `241-360`
- `361-481`
- `482+` titled anthology fragments
