import { json, searchFragments } from "../../cloudflare/reader-data.js"

export async function onRequestGet(context) {
  const query = new URL(context.request.url).searchParams.get("q") || ""
  const results = await searchFragments(context.env.DB, query)
  return json({
    query,
    results,
  })
}
