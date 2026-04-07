from __future__ import annotations

import json
import re
import shutil
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import fitz


SOURCE_PDF = Path("/Users/jasonliu/Desktop/Book of Disquiet, The - Fernando Pessoa.pdf")
OUTPUT_DIR = Path("book.cleaned")
TRASH_ROOT = Path.home() / ".Trash" / "codex"
NUMBERED_START_PAGE = 54
ANTHOLOGY_INTRO_HEADING = "A Disquiet Anthology"
ANTHOLOGY_START_PAGE = 813
APPENDIX_STOP_PREFIX = "Appendix I:"
PARAGRAPH_GAP = 30
TITLE_SMALL_WORDS = {
    "a",
    "an",
    "and",
    "at",
    "by",
    "for",
    "from",
    "in",
    "of",
    "on",
    "or",
    "the",
    "to",
    "with",
}


@dataclass
class FragmentDraft:
    order: int
    title: str
    chapter_label: str
    fragment_number: int | None = None
    source_start_page: int | None = None
    source_end_page: int | None = None
    paragraphs: list[str] = field(default_factory=list)
    last_y0: float | None = None
    saw_body_line: bool = False


def normalize_line(value: str) -> str:
    return " ".join(value.strip().split())


def slugify(value: str) -> str:
    normalized = (
        unicodedata.normalize("NFKD", value)
        .encode("ascii", "ignore")
        .decode("ascii")
        .lower()
    )
    slug = re.sub(r"[^a-z0-9]+", "-", normalized).strip("-")
    return slug or "fragment"


def title_case_heading(value: str) -> str:
    value = normalize_line(value)
    value = (
        value.replace("VOYAGEI ", "VOYAGE I ")
        .replace(" INEVER ", " I NEVER ")
        .replace(" M ADE ", " MADE ")
        .replace("I N PRAISE", "IN PRAISE")
    )
    value = re.sub(
        r"\(\s*([IVX](?:\s+[IVX])+)\s*\)",
        lambda match: f"({match.group(1).replace(' ', '')})",
        value,
    )
    value = re.sub(r"\b([A-Z])\s+([A-Z])\b(?=\s+[A-Z])", r"\1\2", value)

    repaired_parts: list[str] = []
    for part in value.split():
        if (
            len(part) > 3
            and part.isupper()
            and part.endswith("I")
            and not re.fullmatch(r"[IVX]+", part)
        ):
            repaired_parts.extend([part[:-1], "I"])
        else:
            repaired_parts.append(part)
    value = " ".join(repaired_parts)

    value = re.sub(r"([A-Za-z])\(", r"\1 (", value)
    value = re.sub(r"\s+([*),.;:!?])", r"\1", value)

    if value.startswith("(") and value.endswith(")"):
        return value

    parts: list[str] = []
    for index, part in enumerate(value.split()):
        if re.fullmatch(r"\(?[IVX]+\)?[),.;:!?*]*", part, flags=re.IGNORECASE):
            parts.append(part.upper())
        else:
            lowered = part.lower()
            parts.append(
                lowered if index > 0 and lowered in TITLE_SMALL_WORDS else part.capitalize()
            )
    return " ".join(parts)


def is_number_marker(value: str, x0: float, y0: float) -> bool:
    return x0 < 80 and y0 < 100 and bool(re.fullmatch(r"\d{1,3}", value))


def is_title_line(value: str) -> bool:
    if not value or len(value) > 80:
        return False
    if value.startswith("(") and value.endswith(")"):
        return True
    letters = [char for char in value if char.isalpha()]
    return len(letters) >= 2 and all(char.isupper() for char in letters)


def append_line(fragment: FragmentDraft, value: str, y0: float) -> None:
    starts_paragraph = (
        not fragment.paragraphs
        or (fragment.last_y0 is not None and y0 - fragment.last_y0 > PARAGRAPH_GAP)
    )

    if starts_paragraph:
        fragment.paragraphs.append(value)
    elif fragment.paragraphs[-1].endswith("-"):
        fragment.paragraphs[-1] = f"{fragment.paragraphs[-1]}{value}"
    else:
        fragment.paragraphs[-1] = f"{fragment.paragraphs[-1]} {value}"

    fragment.last_y0 = y0
    fragment.saw_body_line = True


def iter_page_lines(doc: fitz.Document, page_number: int) -> list[tuple[float, float, str]]:
    blocks = doc[page_number - 1].get_text("rawdict")["blocks"]
    lines: list[tuple[int, float, float, str]] = []

    for block in blocks:
        block_type = block.get("type")

        if block_type == 1:
            x0, y0, _, y1 = block["bbox"]
            row_key = round((((float(y0) + float(y1)) / 2) / 20))
            lines.append((row_key, float(x0), float(y0), "....."))
            continue

        if block_type != 0:
            continue

        for line_data in block.get("lines", []):
            line = normalize_line(
                "".join(
                    char["c"]
                    for span in line_data.get("spans", [])
                    for char in span.get("chars", [])
                )
            )
            if not line:
                continue

            x0, y0, _, y1 = line_data["bbox"]
            row_key = round((((float(y0) + float(y1)) / 2) / 20))
            lines.append((row_key, float(x0), float(y0), line))

    return [
        (x0, y0, line)
        for _, x0, y0, line in sorted(lines, key=lambda item: (item[0], item[1], item[2]))
    ]


def parse_numbered_fragments(doc: fitz.Document) -> list[FragmentDraft]:
    fragments: list[FragmentDraft] = []
    current: FragmentDraft | None = None
    expected_number = 1

    for page_number in range(NUMBERED_START_PAGE, doc.page_count + 1):
        for x0, y0, line in iter_page_lines(doc, page_number):
            if line == ANTHOLOGY_INTRO_HEADING:
                if current is not None:
                    current.source_end_page = page_number - 1
                    fragments.append(current)
                return fragments

            if is_number_marker(line, x0, y0):
                number = int(line)
                if number != expected_number:
                    continue
                if current is not None:
                    current.source_end_page = page_number - 1
                    fragments.append(current)
                current = FragmentDraft(
                    order=number,
                    title=f"Fragment {number}",
                    chapter_label=str(number),
                    fragment_number=number,
                    source_start_page=page_number,
                    source_end_page=page_number,
                )
                expected_number += 1
                continue

            if current is None:
                continue

            current.source_end_page = page_number
            if not current.saw_body_line and is_title_line(line):
                current.title = title_case_heading(line)
                continue

            append_line(current, line, y0)

    if current is not None:
        fragments.append(current)
    return fragments


def parse_anthology_fragments(doc: fitz.Document, start_order: int) -> list[FragmentDraft]:
    fragments: list[FragmentDraft] = []
    current: FragmentDraft | None = None
    order = start_order

    for page_number in range(ANTHOLOGY_START_PAGE, doc.page_count + 1):
        for x0, y0, line in iter_page_lines(doc, page_number):
            if line.startswith(APPENDIX_STOP_PREFIX):
                if current is not None:
                    current.source_end_page = page_number - 1
                    fragments.append(current)
                return fragments

            if x0 < 80 and is_title_line(line):
                if current is not None and not current.saw_body_line:
                    current.title = title_case_heading(f"{current.title} {line}")
                    current.chapter_label = current.title
                    current.source_end_page = page_number
                    continue

                if current is not None:
                    current.source_end_page = page_number
                    fragments.append(current)
                title = title_case_heading(line)
                current = FragmentDraft(
                    order=order,
                    title=title,
                    chapter_label=title,
                    source_start_page=page_number,
                    source_end_page=page_number,
                )
                order += 1
                continue

            if current is None:
                continue

            current.source_end_page = page_number
            append_line(current, line, y0)

    if current is not None:
        fragments.append(current)
    return fragments


def build_markdown(fragment: FragmentDraft) -> str:
    frontmatter = {
        "title": fragment.title,
        "chapter_label": fragment.chapter_label,
        "source_pdf": SOURCE_PDF.name,
        "source_pages": (
            str(fragment.source_start_page)
            if fragment.source_start_page == fragment.source_end_page
            else f"{fragment.source_start_page}-{fragment.source_end_page}"
        ),
    }
    if fragment.fragment_number is not None:
        frontmatter["fragment_number"] = str(fragment.fragment_number)

    body = "\n\n".join(paragraph for paragraph in fragment.paragraphs if paragraph).strip()
    return (
        "---\n"
        + "\n".join(
            f"{key}: {json.dumps(value, ensure_ascii=False)}"
            for key, value in frontmatter.items()
        )
        + "\n---\n\n"
        + body
        + "\n"
    )


def move_to_trash(path: Path) -> None:
    if not path.exists():
        return

    trash_dir = TRASH_ROOT / datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    trash_dir.mkdir(parents=True, exist_ok=False)
    shutil.move(str(path), str(trash_dir / path.name))


def write_output(fragments: list[FragmentDraft]) -> None:
    temp_dir = OUTPUT_DIR.with_name(f"{OUTPUT_DIR.name}.tmp-{datetime.now().strftime('%Y%m%d-%H%M%S-%f')}")
    temp_dir.mkdir(parents=True, exist_ok=False)

    used_slugs: set[str] = set()
    manifest: list[dict[str, object]] = []

    for fragment in fragments:
        slug_base = slugify(fragment.title)
        slug = f"{fragment.order:03d}-{slug_base}"
        if slug in used_slugs:
            suffix = 2
            while f"{slug}-{suffix}" in used_slugs:
                suffix += 1
            slug = f"{slug}-{suffix}"
        used_slugs.add(slug)

        (temp_dir / f"{slug}.md").write_text(build_markdown(fragment), encoding="utf-8")
        manifest.append(
            {
                "order": fragment.order,
                "slug": slug,
                "title": fragment.title,
                "chapter_label": fragment.chapter_label,
                "fragment_number": fragment.fragment_number,
                "source_pdf": SOURCE_PDF.name,
                "source_pages": (
                    str(fragment.source_start_page)
                    if fragment.source_start_page == fragment.source_end_page
                    else f"{fragment.source_start_page}-{fragment.source_end_page}"
                ),
                "target": f"book.cleaned/{slug}.md",
            }
        )

    (temp_dir / "proofread-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    move_to_trash(OUTPUT_DIR)
    temp_dir.rename(OUTPUT_DIR)


def main() -> None:
    if not SOURCE_PDF.exists():
        raise SystemExit(f"Missing source PDF: {SOURCE_PDF}")

    doc = fitz.open(SOURCE_PDF)
    numbered_fragments = parse_numbered_fragments(doc)
    anthology_fragments = parse_anthology_fragments(doc, start_order=len(numbered_fragments) + 1)
    fragments = numbered_fragments + anthology_fragments

    if not fragments:
        raise SystemExit("No fragments extracted")

    if fragments[0].fragment_number != 1 or fragments[0].title != "Fragment 1":
        raise SystemExit("Unexpected first numbered fragment")

    if any(not fragment.paragraphs for fragment in fragments):
        raise SystemExit("One or more extracted fragments have empty bodies")

    write_output(fragments)
    print(
        f"Wrote {len(fragments)} fragments "
        f"({len(numbered_fragments)} numbered + {len(anthology_fragments)} anthology) "
        f"to {OUTPUT_DIR}"
    )


if __name__ == "__main__":
    main()
