import { createBlueskySession } from "./createBlueskySession.ts"
import type { BlueskyBookmark, BlueskyBookmarks } from "./blueskyBookmarkTypes.ts"

/** Read every bookmark, skipping deleted or blocked posts that have no content to archive. */
export async function fetchBlueskyBookmarks(
  /** Injectable boundary returning one API page for a cursor. */
  injected?: (cursor?: string) => Promise<unknown>,
): Promise<BlueskyBookmarks> {
  const get = injected ?? (await createBlueskySession()).listBookmarks
  const bookmarks: BlueskyBookmark[] = []
  const cursors = new Set<string>()
  let cursor: string | undefined
  do {
    const page = (await get(cursor)) as BlueskyPage
    if (!Array.isArray(page?.bookmarks)) throw new Error("Invalid Bluesky bookmarks response")
    const posts = page.bookmarks.filter(bookmark => bookmark.item?.$type === POST_VIEW)
    if (posts.some(({ item }) => !item.uri || typeof item.record?.text !== "string"))
      throw new Error("Invalid Bluesky bookmark post")
    bookmarks.push(...posts)
    cursor = page.cursor
    if (cursor && cursors.has(cursor)) throw new Error("Repeated Bluesky bookmarks cursor")
    if (cursor) cursors.add(cursor)
  } while (cursor)
  return { bookmarks, exportedAt: new Date().toISOString() }
}

/** Bookmark item type carrying readable post content. */
const POST_VIEW = "app.bsky.feed.defs#postView"

/** One page of the bookmarks response. */
type BlueskyPage = {
  /** Bookmarks, including unreadable placeholders. */
  bookmarks?: (BlueskyBookmark & { item: { $type?: string } })[]
  /** Next page, absent on the last one. */
  cursor?: string
}
