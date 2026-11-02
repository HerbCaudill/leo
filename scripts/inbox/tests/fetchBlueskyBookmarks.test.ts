import { expect, test, vi } from "vitest"
import { fetchBlueskyBookmarks } from "../fetchBlueskyBookmarks.ts"

/** Build a bookmark as the API returns it. */
const bookmark = (rkey: string) => ({
  subject: { uri: `at://did:plc:a/app.bsky.feed.post/${rkey}`, cid: "cid" },
  item: {
    $type: "app.bsky.feed.defs#postView",
    uri: `at://did:plc:a/app.bsky.feed.post/${rkey}`,
    author: { did: "did:plc:a", handle: "a.test" },
    record: { text: rkey },
  },
})

test("follows every page and keeps only readable posts", async () => {
  const get = vi
    .fn()
    .mockResolvedValueOnce({ bookmarks: [bookmark("one")], cursor: "next" })
    .mockResolvedValueOnce({
      bookmarks: [
        bookmark("two"),
        {
          subject: { uri: "at://did:plc:a/app.bsky.feed.post/gone", cid: "cid" },
          item: { $type: "app.bsky.feed.defs#notFoundPost", uri: "gone", notFound: true },
        },
      ],
    })
  const result = await fetchBlueskyBookmarks(get)
  expect(result.bookmarks.map(({ item }) => item.record.text)).toEqual(["one", "two"])
  expect(get.mock.calls[1][0]).toBe("next")
})

test("rejects malformed pages and repeated cursors rather than accepting a partial list", async () => {
  await expect(fetchBlueskyBookmarks(async () => ({}))).rejects.toThrow("Invalid")
  await expect(
    fetchBlueskyBookmarks(async () => ({
      bookmarks: [{ item: { $type: "app.bsky.feed.defs#postView", uri: "missing record" } }],
    })),
  ).rejects.toThrow("Invalid")
  await expect(
    fetchBlueskyBookmarks(async () => ({ bookmarks: [], cursor: "same" })),
  ).rejects.toThrow("Repeated")
})
