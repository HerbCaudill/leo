#!/usr/bin/env -S node --experimental-strip-types

import { createBlueskySession } from "./createBlueskySession.ts"
import { fetchBlueskyBookmarks } from "./fetchBlueskyBookmarks.ts"

/** Read the live bookmark list, or remove one bookmark and verify it is gone, for reviews. */
async function main(): Promise<void> {
  const [command, uri] = process.argv.slice(2)
  const session = await createBlueskySession()
  const list = () => fetchBlueskyBookmarks(session.listBookmarks)
  if (command === "list") return console.log(JSON.stringify(await list(), null, 2))
  if (command !== "remove" || !uri)
    throw new Error("Usage: bluesky:bookmarks list | remove <post-at-uri>")
  await session.deleteBookmark(uri)
  const { bookmarks } = await list()
  if (bookmarks.some(({ item }) => item.uri === uri))
    throw new Error(`Bookmark is still present: ${uri}`)
  console.log(`Verified absent: ${uri}`)
}

await main().catch(error => {
  console.error(String(error))
  process.exitCode = 1
})
