import { getReaderState, json, normalizeSlug } from "../../cloudflare/reader-data.js"

export async function onRequestGet(context) {
  const slug = normalizeSlug(new URL(context.request.url).searchParams.get("slug"))
  if (!slug) {
    return json({ error: "Missing or invalid slug." }, { status: 400 })
  }

  const state = await getReaderState(context.env.DB, slug)
  if (!state) {
    return json({ error: "Fragment not found in D1." }, { status: 404 })
  }

  return json(state)
}
