import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test, vi } from "vitest"
import { processBlueskyBookmarks } from "../processBlueskyBookmarks.ts"
import type { BlueskyBookmark, BlueskyPost } from "../blueskyBookmarkTypes.ts"

/** Isolate the archive and private journals. */
function setup() {
  const root = mkdtempSync(join(tmpdir(), "bluesky-bookmarks-"))
  return {
    jsonPath: join(root, "documents/bluesky-bookmarks/bookmarks.json"),
    markdownPath: join(root, "documents/Bluesky bookmarks.md"),
    statePath: join(root, "state"),
    date: "2026-11-02",
    classify: vi.fn(async () => ({
      title: "Read essay",
      question: "",
      research: "Read the essay",
      duplicate: null,
      disposition: "research" as const,
    })),
    transfer: vi.fn(),
  }
}

/** Build a bookmarked post. */
const bookmark = (rkey: string, overrides: Partial<BlueskyPost> = {}): BlueskyBookmark => ({
  item: {
    uri: `at://did:plc:a/app.bsky.feed.post/${rkey}`,
    author: { did: "did:plc:a", handle: "a.test", displayName: "Author Name" },
    record: { text: `Post ${rkey}`, createdAt: "2026-10-30T12:00:00.000Z" },
    ...overrides,
  },
})

/** Wrap bookmarks in a fetch result. */
const fetched =
  (...bookmarks: BlueskyBookmark[]) =>
  async () => ({ bookmarks })

test("baselines the first fetch, then routes only bookmarks added later", async () => {
  const args = setup()
  await processBlueskyBookmarks({ ...args, fetch: fetched(bookmark("old")) })
  expect(args.classify).not.toHaveBeenCalled()
  expect(readFileSync(args.markdownPath, "utf8")).toContain("Post old")

  await processBlueskyBookmarks({ ...args, fetch: fetched(bookmark("new"), bookmark("old")) })
  expect(args.classify).toHaveBeenCalledTimes(1)
  expect(args.classify.mock.calls[0]).toEqual([
    expect.objectContaining({
      // Windows filenames cannot contain the colons and slashes in an AT URI.
      id: "bsky-did-plc-a-new",
      source: {
        kind: "bluesky",
        url: "https://bsky.app/profile/did:plc:a/post/new",
      },
    }),
  ])
  expect(existsSync(join(args.statePath, "captures/bsky-did-plc-a-new.json"))).toBe(true)
})

test("does not baseline anything when the first fetch fails", async () => {
  const args = setup()
  await expect(
    processBlueskyBookmarks({
      ...args,
      fetch: async () => {
        throw new Error("Bluesky offline")
      },
    }),
  ).rejects.toThrow("Bluesky offline")
  await processBlueskyBookmarks({ ...args, fetch: fetched(bookmark("first")) })
  expect(args.classify).not.toHaveBeenCalled()
  expect(JSON.parse(readFileSync(args.jsonPath, "utf8")).bookmarks).toHaveLength(1)
})

test("retains removed bookmarks and retries cached work when a fetch fails", async () => {
  const args = setup()
  await processBlueskyBookmarks({ ...args, fetch: fetched(bookmark("old")) })
  args.classify.mockRejectedValueOnce(new Error("classifier unavailable"))
  await expect(
    processBlueskyBookmarks({ ...args, fetch: fetched(bookmark("new")) }),
  ).rejects.toThrow("classifier unavailable")
  const markdown = readFileSync(args.markdownPath, "utf8")
  expect(markdown).toContain("Post old")
  expect(markdown).toContain("Post new")

  await expect(
    processBlueskyBookmarks({
      ...args,
      fetch: async () => {
        throw new Error("Bluesky offline")
      },
    }),
  ).rejects.toThrow("Bluesky offline")
  expect(args.classify).toHaveBeenCalledTimes(2)

  await processBlueskyBookmarks({ ...args, fetch: fetched() })
  expect(args.classify).toHaveBeenCalledTimes(2)
})

test("keeps full links, images, video, and quoted posts for the classifier and archive", async () => {
  const args = setup()
  await processBlueskyBookmarks({ ...args, fetch: fetched() })
  await processBlueskyBookmarks({
    ...args,
    fetch: fetched(
      bookmark("new", {
        record: {
          text: "See example.com/ess...",
          facets: [
            {
              features: [
                { $type: "app.bsky.richtext.facet#link", uri: "https://example.com/essay" },
              ],
            },
          ],
        },
        embed: {
          $type: "app.bsky.embed.recordWithMedia#view",
          media: {
            $type: "app.bsky.embed.images#view",
            images: [{ fullsize: "https://cdn.test/photo", alt: "A diagram" }],
          },
          record: {
            record: {
              $type: "app.bsky.embed.record#viewRecord",
              uri: "at://did:plc:b/app.bsky.feed.post/quote",
              author: { did: "did:plc:b", handle: "b.test" },
              value: { text: "Original insight" },
              embeds: [
                {
                  $type: "app.bsky.embed.external#view",
                  external: { uri: "https://example.com/talk", title: "A talk" },
                },
                { $type: "app.bsky.embed.video#view", playlist: "https://cdn.test/video.m3u8" },
              ],
            },
          },
        },
      }),
    ),
  })
  const markdown = readFileSync(args.markdownPath, "utf8")
  for (const expected of [
    "Author Name (@a.test)",
    "https://example.com/essay",
    "https://cdn.test/photo",
    "A diagram",
    "Original insight",
    "https://example.com/talk",
    "https://cdn.test/video.m3u8",
  ])
    expect(markdown).toContain(expected)
  expect(args.classify.mock.calls[0]).toEqual([
    expect.objectContaining({ raw: expect.stringContaining("https://example.com/essay") }),
  ])
})
