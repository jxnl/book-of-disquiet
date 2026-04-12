import { icons, renderIcon } from "@/lib/icons"

type SearchEntry = {
  slug: string
  text: string
}

type HighlightRange = {
  start: number
  end: number
}

type ReaderComment = {
  id: string
  body: string
  created_at: number
}

type ReaderRelated = {
  slug: string
  title: string
  chapter_label: string
  preview_text: string
}

type ReaderState = {
  highlightCount: number
  commentCount: number
  starCount: number
  heat: number
  comments: ReaderComment[]
  related: ReaderRelated[]
}

type FragmentDetail = {
  slug: string
  path: string
  title: string
  chapterLabel: string
  previewText: string
  bodyHtml: string
  canonicalOrder: number
}

const ORDER_STORAGE_KEY = "book-of-disquiet-order"
const STAR_STORAGE_KEY = "book-of-disquiet-stars"
const BASE_URL = import.meta.env.BASE_URL
const SEARCH_INDEX_URL = `${BASE_URL}search-index.json`
const FRAGMENT_INDEX_URL = `${BASE_URL}fragments.json`
const searchIndexPromise = fetch(SEARCH_INDEX_URL).then(
  (response) => response.json() as Promise<SearchEntry[]>,
)
const fragmentIndexPromise = fetch(FRAGMENT_INDEX_URL).then(
  (response) => response.json() as Promise<FragmentDetail[]>,
)

async function getAllSlugs() {
  const entries = await searchIndexPromise
  return entries.map((entry) => entry.slug)
}

function normalizeQuery(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function shuffle<T>(values: T[]) {
  const next = [...values]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
  }
  return next
}

function orderStorageKey(query: string) {
  return query ? `${ORDER_STORAGE_KEY}:${query}` : ORDER_STORAGE_KEY
}

function chapterHref(slug: string, query = "") {
  return query
    ? `${BASE_URL}read/${slug}/?q=${encodeURIComponent(query)}`
    : `${BASE_URL}read/${slug}/`
}

function readStoredStringArray(storageKey: string) {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(storageKey) || "null")
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((item) => typeof item === "string")
    ) {
      return parsed
    }
  } catch {
    return null
  }
  return null
}

function readStoredStars() {
  return readStoredStringArray(STAR_STORAGE_KEY) || []
}

function writeStoredStars(slugs: string[]) {
  localStorage.setItem(STAR_STORAGE_KEY, JSON.stringify(slugs))
}

function hasStoredStar(slug: string) {
  return readStoredStars().includes(slug)
}

function setStoredStar(slug: string, isStarred: boolean) {
  const next = new Set(readStoredStars())
  if (isStarred) {
    next.add(slug)
  } else {
    next.delete(slug)
  }
  writeStoredStars([...next])
}

async function getMatchingSlugs(query: string) {
  const normalizedQuery = normalizeQuery(query)
  if (!normalizedQuery) return []

  const entries = await searchIndexPromise
  return entries
    .filter((entry) => entry.text.includes(normalizedQuery))
    .map((entry) => entry.slug)
}

async function startSearchSession(query: string) {
  const normalizedQuery = normalizeQuery(query)
  if (!normalizedQuery) return null

  const matches = await getMatchingSlugs(normalizedQuery)
  if (matches.length === 0) return null

  const order = shuffle(matches)
  sessionStorage.setItem(
    orderStorageKey(normalizedQuery),
    JSON.stringify(order),
  )
  return chapterHref(order[0], normalizedQuery)
}

async function resolveSavedOrder() {
  const slugs = await getAllSlugs()
  const stored = readStoredStringArray(orderStorageKey(""))
  if (!stored || stored.length !== slugs.length) {
    const order = shuffle(slugs)
    sessionStorage.setItem(orderStorageKey(""), JSON.stringify(order))
    return order
  }

  const knownSlugs = new Set(slugs)
  const deduped = stored.filter((item) => knownSlugs.has(item))
  if (deduped.length !== slugs.length || new Set(deduped).size !== slugs.length) {
    const order = shuffle(slugs)
    sessionStorage.setItem(orderStorageKey(""), JSON.stringify(order))
    return order
  }

  return deduped
}

async function resolveSearchOrder(query: string, fallbackSlug: string) {
  const storageKey = orderStorageKey(query)
  const stored = readStoredStringArray(storageKey)
  if (stored) return stored

  const matches = await getMatchingSlugs(query)
  const order = matches.length > 0 ? shuffle(matches) : [fallbackSlug]
  sessionStorage.setItem(storageKey, JSON.stringify(order))
  return order
}

function collectTextNodes(root: Element) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  let node = walker.nextNode()

  while (node) {
    if (node.nodeValue) nodes.push(node as Text)
    node = walker.nextNode()
  }

  return nodes
}

function wrapTextRange(root: Element, start: number, end: number) {
  if (end <= start) return

  let offset = 0
  for (const textNode of collectTextNodes(root)) {
    const textLength = textNode.nodeValue?.length || 0
    const nodeStart = offset
    const nodeEnd = offset + textLength
    offset = nodeEnd

    if (nodeEnd <= start || nodeStart >= end) continue

    const range = document.createRange()
    range.setStart(textNode, Math.max(0, start - nodeStart))
    range.setEnd(textNode, Math.min(textLength, end - nodeStart))

    const mark = document.createElement("mark")
    mark.className = "book-highlight px-[0.08em]"

    try {
      range.surroundContents(mark)
    } catch {
      // A saved range can become partially invalid after DOM splitting.
    }
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function applySearchHighlights(articleBody: Element, query: string) {
  if (!query) return

  const pattern = new RegExp(`(${escapeRegExp(query)})`, "gi")
  for (const node of articleBody.querySelectorAll("p, h2, blockquote p")) {
    node.innerHTML = node.innerHTML.replace(
      pattern,
      (_, text) =>
        `<mark class="book-highlight px-[0.08em]">${text}</mark>`,
    )
  }
}

function getStoredHighlightRanges(slug: string) {
  try {
    const stored = JSON.parse(
      localStorage.getItem(`book-of-disquiet-highlights:${slug}`) || "[]",
    )
    if (!Array.isArray(stored)) return []

    return stored.filter(
      (item): item is HighlightRange =>
        item &&
        Number.isInteger(item.start) &&
        Number.isInteger(item.end) &&
        item.end > item.start,
    )
  } catch {
    return []
  }
}

function saveHighlightRange(slug: string, start: number, end: number) {
  const highlights = getStoredHighlightRanges(slug)
  if (highlights.some((item) => item.start === start && item.end === end)) {
    return
  }

  highlights.push({ start, end })
  localStorage.setItem(
    `book-of-disquiet-highlights:${slug}`,
    JSON.stringify(highlights),
  )
}

function restoreHighlights(articleBody: Element, slug: string, query: string) {
  const originalBodyHtml = articleBody.getAttribute("data-original-html") || ""
  articleBody.innerHTML = originalBodyHtml

  const highlights = getStoredHighlightRanges(slug).sort(
    (left, right) => right.start - left.start,
  )
  for (const highlight of highlights) {
    wrapTextRange(articleBody, highlight.start, highlight.end)
  }

  applySearchHighlights(articleBody, query)
}

function getSelectionState(articleBody: Element) {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null
  }

  const range = selection.getRangeAt(0)
  if (!articleBody.contains(range.commonAncestorContainer)) {
    return null
  }

  const selectedText = range.toString().trim()
  const rect = range.getBoundingClientRect()
  if (!selectedText || rect.width === 0 || rect.height === 0) {
    return null
  }

  const preSelection = document.createRange()
  preSelection.selectNodeContents(articleBody)
  preSelection.setEnd(range.startContainer, range.startOffset)

  const start = preSelection.toString().length
  const end = start + range.toString().length
  if (end <= start) return null

  return { rect, start, end }
}

function hideTooltip(highlightTooltip: HTMLElement | null) {
  if (highlightTooltip) highlightTooltip.dataset.visible = "false"
}

function showTooltip(highlightTooltip: HTMLElement, rect: DOMRect) {
  highlightTooltip.dataset.visible = "true"
  highlightTooltip.style.left = `${rect.left + rect.width / 2}px`
  highlightTooltip.style.top = `${Math.max(24, rect.top)}px`
}

function navigateToChapter(href: string) {
  window.location.href = href
}

async function fetchJson<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, init)
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`)
  }

  return response.json() as Promise<T>
}

function hasActiveTextSelection() {
  const selection = window.getSelection()
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim())
}

function isInteractiveTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'a, button, input, textarea, select, summary, label, form, [role="button"], [contenteditable="true"], [data-reader-community]',
      ),
    )
  )
}

function setText(node: Element | null, text: string) {
  if (node) node.textContent = text
}

function createSummaryIcon(kind: "star" | "highlight" | "note") {
  const icon = document.createElement("span")
  icon.className = "inline-flex h-[0.95rem] w-[0.95rem] items-center justify-center"
  icon.setAttribute("aria-hidden", "true")
  icon.innerHTML = renderIcon(icons[kind], "h-[0.95rem] w-[0.95rem] stroke-[1.75]")
  return icon
}

function setStarButtonState(button: HTMLButtonElement | null, isStarred: boolean) {
  if (!button) return
  button.dataset.active = isStarred ? "true" : "false"
  button.setAttribute("aria-pressed", isStarred ? "true" : "false")
  button.setAttribute("aria-label", isStarred ? "Unstar fragment" : "Star fragment")
}

function setPageHeat(readerShell: HTMLElement | null, heat: number) {
  readerShell?.style.setProperty(
    "--page-heat",
    String(Math.max(0, Math.min(1, heat || 0))),
  )
}

function renderActivitySummary(
  container: HTMLElement | null,
  counts: Pick<ReaderState, "starCount" | "highlightCount" | "commentCount">,
) {
  if (!container) return
  container.innerHTML = ""

  const stats: Array<{ kind: "star" | "highlight" | "note"; count: number; label: string }> = [
    { kind: "star", count: counts.starCount, label: "stars" },
    { kind: "highlight", count: counts.highlightCount, label: "highlights" },
    { kind: "note", count: counts.commentCount, label: "notes" },
  ]

  for (const stat of stats) {
    const item = document.createElement("span")
    item.className = "inline-flex items-center gap-[0.35rem] text-[rgba(78,78,78,0.9)]"
    item.setAttribute("aria-label", `${stat.count} ${stat.label}`)

    const count = document.createElement("span")
    count.className = "text-[0.92rem]"
    count.textContent = String(stat.count)

    item.append(createSummaryIcon(stat.kind), count)
    container.append(item)
  }
}

function formatCommentDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp))
}

function firstSentence(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (!normalized) return ""

  const endIndex = normalized.indexOf(".")
  const sentence = endIndex === -1 ? normalized : normalized.slice(0, endIndex + 1)
  if (sentence.length <= 120) return sentence

  const shortened = sentence.slice(0, 117)
  const lastSpace = shortened.lastIndexOf(" ")
  return `${shortened.slice(0, lastSpace > 72 ? lastSpace : shortened.length).trim()}…`
}

function renderRelatedLinks(
  container: HTMLElement | null,
  related: ReaderRelated[],
  query: string,
) {
  if (!container) return
  container.innerHTML = ""

  if (related.length === 0) {
    const empty = document.createElement("li")
    empty.className = "m-0 text-[0.92rem] leading-6 text-[rgba(78,78,78,0.82)]"
    empty.textContent = "No related fragments yet."
    container.append(empty)
    return
  }

  for (const item of related) {
    const entry = document.createElement("li")
    entry.className = "border-t border-[rgba(128,128,128,0.12)] pt-3 first:border-t-0 first:pt-0"

    const sentence = firstSentence(item.preview_text)

    const link = document.createElement("a")
    link.className = "block text-ink no-underline transition-colors hover:text-[rgba(40,40,40,0.92)] focus-visible:text-[rgba(40,40,40,0.92)] focus-visible:outline-none"
    link.href = chapterHref(item.slug, query)
    link.textContent = sentence || item.title

    entry.append(link)
    if (sentence && sentence !== item.title) {
      const title = document.createElement("p")
      title.className = "mt-1 text-[0.82rem] text-[rgba(115,115,115,0.95)]"
      title.textContent = item.title
      entry.append(title)
    }
    container.append(entry)
  }
}

function renderComments(container: HTMLElement | null, comments: ReaderComment[]) {
  if (!container) return
  container.innerHTML = ""

  if (comments.length === 0) {
    const empty = document.createElement("li")
    empty.className = "m-0 text-[0.92rem] leading-6 text-[rgba(78,78,78,0.82)]"
    empty.textContent = "No notes yet."
    container.append(empty)
    return
  }

  for (const comment of comments) {
    const entry = document.createElement("li")
    entry.className = "border-t border-[rgba(128,128,128,0.12)] pt-3 first:border-t-0 first:pt-0"

    const body = document.createElement("p")
    body.className = "m-0 text-[0.92rem] leading-6 text-[rgba(78,78,78,0.82)]"
    body.textContent = comment.body

    const meta = document.createElement("p")
    meta.className = "mt-[0.3rem] text-[0.78rem] tracking-[0.01em] text-[rgba(78,78,78,0.82)]"
    meta.textContent = formatCommentDate(comment.created_at)

    entry.append(body, meta)
    container.append(entry)
  }
}

export function setupHomePage() {
  const startRandomLink = document.querySelector<HTMLAnchorElement>("#start-random")
  const searchForm = document.querySelector<HTMLFormElement>("#search-form")
  const searchInput = document.querySelector<HTMLInputElement>("#search-query")

  startRandomLink?.addEventListener("click", async (event) => {
    event.preventDefault()
    const slugs = await getAllSlugs()
    const order = shuffle(slugs)
    sessionStorage.setItem(orderStorageKey(""), JSON.stringify(order))
    window.location.href = chapterHref(order[0])
  })

  searchForm?.addEventListener("submit", async (event) => {
    event.preventDefault()

    const nextHref = await startSearchSession(searchInput?.value || "")
    if (nextHref) {
      window.location.href = nextHref
      return
    }

    if (searchInput) {
      searchInput.value = ""
      searchInput.placeholder = "No matches"
    }
  })
}

export function setupReaderPage() {
  let isNavigating = false
  const slug = document.querySelector<HTMLElement>("[data-reader-slug]")
    ?.dataset.readerSlug || ""
  const readerShell = document.querySelector<HTMLElement>("#reader-shell")
  const articleBody = document.querySelector<HTMLElement>(".book-page")
  const prevLink = document.querySelector<HTMLAnchorElement>("#prev-link")
  const nextLink = document.querySelector<HTMLAnchorElement>("#next-link")
  const starToggle = document.querySelector<HTMLButtonElement>("#star-toggle")
  const highlightTooltip = document.querySelector<HTMLElement>(
    "#highlight-tooltip",
  )
  const saveHighlightButton =
    document.querySelector<HTMLButtonElement>("#save-highlight")
  const searchSelectionButton = document.querySelector<HTMLButtonElement>(
    "#search-selection",
  )
  const searchForm = document.querySelector<HTMLFormElement>("#search-form")
  const searchInput = document.querySelector<HTMLInputElement>("#search-query")
  const activitySummary = document.querySelector<HTMLElement>(
    "#reader-activity-summary",
  )
  const relatedList = document.querySelector<HTMLElement>("#related-links-list")
  const commentForm = document.querySelector<HTMLFormElement>("#comment-form")
  const commentInput = document.querySelector<HTMLTextAreaElement>("#comment-body")
  const commentStatus = document.querySelector<HTMLElement>("#comment-status")
  const commentList = document.querySelector<HTMLElement>("#comment-list")
  const query = normalizeQuery(
    new URLSearchParams(window.location.search).get("q") || "",
  )

  if (articleBody) {
    articleBody.setAttribute("data-original-html", articleBody.innerHTML)
    restoreHighlights(articleBody, slug, query)
  }
  setStarButtonState(starToggle, hasStoredStar(slug))

  async function readOrder() {
    return query
      ? resolveSearchOrder(query, slug)
      : resolveSavedOrder()
  }

  async function updateNavigation() {
    const order = await readOrder()
    const currentIndex = Math.max(0, order.indexOf(slug))
    prevLink?.setAttribute(
      "href",
      chapterHref(order[(currentIndex - 1 + order.length) % order.length], query),
    )
    nextLink?.setAttribute(
      "href",
      chapterHref(order[(currentIndex + 1) % order.length], query),
    )
  }

  async function go(delta: number) {
    if (isNavigating) return
    isNavigating = true

    try {
      const order = await readOrder()
      const currentIndex = Math.max(0, order.indexOf(slug))
      navigateToChapter(
        chapterHref(
          order[(currentIndex + delta + order.length) % order.length],
          query,
        ),
      )
    } catch {
      isNavigating = false
    }
  }

  function renderReaderState(state: ReaderState) {
    setPageHeat(readerShell, state.heat)
    renderActivitySummary(
      activitySummary,
      state,
    )
    renderRelatedLinks(relatedList, state.related, query)
    renderComments(commentList, state.comments)
  }

  async function refreshReaderState() {
    try {
      const state = await fetchJson<ReaderState>(
        `${BASE_URL}api/reader-state?slug=${encodeURIComponent(slug)}`,
      )
      renderReaderState(state)
    } catch {
      setText(
        activitySummary,
        "Connect D1 to show shared highlights, notes, and related fragments.",
      )
    }
  }

  document.addEventListener("selectionchange", () => {
    if (!articleBody || !highlightTooltip) return

    const selectionState = getSelectionState(articleBody)
    if (!selectionState) {
      hideTooltip(highlightTooltip)
      return
    }

    showTooltip(highlightTooltip, selectionState.rect)
  })

  highlightTooltip?.addEventListener("mousedown", (event) => {
    event.preventDefault()
  })

  saveHighlightButton?.addEventListener("click", async () => {
    if (!articleBody || !highlightTooltip) return

    const selectionState = getSelectionState(articleBody)
    if (selectionState) {
      saveHighlightRange(slug, selectionState.start, selectionState.end)
      try {
        await fetchJson(`${BASE_URL}api/highlights`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            slug,
            startOffset: selectionState.start,
            endOffset: selectionState.end,
          }),
        })
      } catch {
        // Local highlights still work without the shared D1 backend.
      }
    }

    window.getSelection()?.removeAllRanges()
    hideTooltip(highlightTooltip)
    restoreHighlights(articleBody, slug, query)
    void refreshReaderState()
  })

  searchSelectionButton?.addEventListener("click", async () => {
    if (isNavigating) return
    if (!highlightTooltip) return

    const nextQuery = window.getSelection()?.toString() || ""
    window.getSelection()?.removeAllRanges()
    hideTooltip(highlightTooltip)

    const nextHref = await startSearchSession(nextQuery)
    if (nextHref) {
      isNavigating = true
      navigateToChapter(nextHref)
    }
  })

  searchForm?.addEventListener("submit", async (event) => {
    event.preventDefault()
    if (isNavigating) return

    const nextQuery = searchInput?.value || ""
    if (!normalizeQuery(nextQuery)) {
      isNavigating = true
      navigateToChapter(chapterHref(slug))
      return
    }

    const nextHref = await startSearchSession(nextQuery)
    if (nextHref) {
      isNavigating = true
      navigateToChapter(nextHref)
      return
    }

    if (searchInput) {
      searchInput.value = ""
      searchInput.placeholder = "none"
    }
  })

  commentForm?.addEventListener("submit", async (event) => {
    event.preventDefault()
    if (isNavigating || !commentInput) return

    const body = commentInput.value.trim()
    if (!body) {
      setText(commentStatus, "Write a note before posting.")
      return
    }

    commentInput.disabled = true
    setText(commentStatus, "Posting...")

    try {
      await fetchJson(`${BASE_URL}api/comments`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          slug,
          body,
        }),
      })

      commentInput.value = ""
      setText(commentStatus, "Posted.")
      await refreshReaderState()
    } catch {
      setText(
        commentStatus,
        "Could not post. Check the D1 binding or rate limit settings.",
      )
    } finally {
      commentInput.disabled = false
    }
  })

  starToggle?.addEventListener("click", async () => {
    const nextStarred = !hasStoredStar(slug)
    setStoredStar(slug, nextStarred)
    setStarButtonState(starToggle, nextStarred)

    try {
      if (nextStarred) {
        await fetchJson(`${BASE_URL}api/stars`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ slug }),
        })
      } else {
        await fetchJson(`${BASE_URL}api/stars?slug=${encodeURIComponent(slug)}`, {
          method: "DELETE",
        })
      }
      await refreshReaderState()
    } catch {
      setStoredStar(slug, !nextStarred)
      setStarButtonState(starToggle, !nextStarred)
    }
  })

  window.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "k") {
      event.preventDefault()
      void go(-1)
    }

    if (event.key === "ArrowRight" || event.key === "j") {
      event.preventDefault()
      void go(1)
    }

    if (event.key === "Escape") {
      window.getSelection()?.removeAllRanges()
      hideTooltip(highlightTooltip)
    }
  })

  prevLink?.addEventListener("click", (event) => {
    event.preventDefault()
    void go(-1)
  })

  nextLink?.addEventListener("click", (event) => {
    event.preventDefault()
    void go(1)
  })

  document.addEventListener("click", (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      hasActiveTextSelection() ||
      isInteractiveTarget(event.target)
    ) {
      return
    }

    event.preventDefault()
    void go(event.clientX < window.innerWidth / 2 ? -1 : 1)
  })

  void updateNavigation()
  void refreshReaderState()
}

export function setupStarsPage() {
  const starsList = document.querySelector<HTMLElement>("#stars-list")
  if (!starsList) return

  async function renderStars() {
    const starred = new Set(readStoredStars())
    if (starred.size === 0) {
      starsList.innerHTML = '<p class="m-0 text-[0.92rem] leading-6 text-[rgba(78,78,78,0.82)]">No starred passages yet.</p>'
      return
    }

    const fragments = await fragmentIndexPromise
    const entries = fragments
      .filter((fragment) => starred.has(fragment.slug))
      .sort((left, right) => left.canonicalOrder - right.canonicalOrder)

    if (entries.length === 0) {
      starsList.innerHTML = '<p class="m-0 text-[0.92rem] leading-6 text-[rgba(78,78,78,0.82)]">No starred passages yet.</p>'
      return
    }

    starsList.innerHTML = ""
    for (const fragment of entries) {
      const article = document.createElement("article")
      article.className = "border-t border-[rgba(128,128,128,0.14)] pt-6 first:border-t-0 first:pt-0"

      const header = document.createElement("div")
      header.className = "mb-4 flex items-baseline justify-between gap-4"

      const link = document.createElement("a")
      link.className = "text-ink no-underline transition-colors hover:text-[rgba(55,55,55,0.92)] focus-visible:text-[rgba(55,55,55,0.92)] focus-visible:outline-none"
      link.href = fragment.path
      link.textContent = `${fragment.chapterLabel} · ${fragment.title}`

      header.append(link)

      const body = document.createElement("div")
      body.className = "book-page"
      body.innerHTML = fragment.bodyHtml

      article.append(header, body)
      starsList.append(article)
    }
  }

  void renderStars()
}
