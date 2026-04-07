type SearchEntry = {
  slug: string
  text: string
}

type HighlightRange = {
  start: number
  end: number
}

const ORDER_STORAGE_KEY = "book-of-disquiet-order"
const BASE_URL = import.meta.env.BASE_URL
const SEARCH_INDEX_URL = `${BASE_URL}search-index.json`
const searchIndexPromise = fetch(SEARCH_INDEX_URL).then(
  (response) => response.json() as Promise<SearchEntry[]>,
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
  const articleBody = document.querySelector<HTMLElement>(".book-page")
  const prevLink = document.querySelector<HTMLAnchorElement>("#prev-link")
  const nextLink = document.querySelector<HTMLAnchorElement>("#next-link")
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
  const query = normalizeQuery(
    new URLSearchParams(window.location.search).get("q") || "",
  )

  if (articleBody) {
    articleBody.setAttribute("data-original-html", articleBody.innerHTML)
    restoreHighlights(articleBody, slug, query)
  }

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

  saveHighlightButton?.addEventListener("click", () => {
    if (!articleBody || !highlightTooltip) return

    const selectionState = getSelectionState(articleBody)
    if (selectionState) {
      saveHighlightRange(slug, selectionState.start, selectionState.end)
    }

    window.getSelection()?.removeAllRanges()
    hideTooltip(highlightTooltip)
    restoreHighlights(articleBody, slug, query)
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

  void updateNavigation()
}
