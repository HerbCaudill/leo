import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test, vi } from "vitest"
import { processXBookmarks } from "../processXBookmarks.ts"
import * as atomic from "../../morning-briefing/atomicWrite.ts"

/** Isolate the baseline, note, and private journals. */
function setup() {
  const root = mkdtempSync(join(tmpdir(), "x-bookmarks-"))
  const jsonPath = join(root, "bookmarks.json")
  writeFileSync(jsonPath, JSON.stringify({ data: [{ id: "old", text: "Baseline" }], includes: {} }))
  return {
    jsonPath,
    markdownPath: join(root, "X bookmarks.md"),
    statePath: join(root, "state"),
    date: "2026-10-25",
    classify: vi.fn(async () => ({
      title: "Try tool",
      question: "",
      research: "",
      duplicate: null,
      disposition: "task" as const,
    })),
    transfer: vi.fn(async () => ({
      id: "task",
      kind: "task" as const,
      spaceId: "space",
      title: "Try tool",
      url: "https://tasks/?task=task",
    })),
  }
}

test("archives new and historical bookmarks for interactive review", async () => {
  const args = setup()
  mkdirSync(join(args.statePath, "captures"), { recursive: true })
  const journalPath = join(args.statePath, "x-bookmarks.json")
  const journal = JSON.stringify({ version: 1, baselineIds: [], completedIds: ["handled"] })
  const capturePath = join(args.statePath, "captures", "pending.json")
  writeFileSync(journalPath, journal)
  writeFileSync(capturePath, "Pending transfer checkpoint")

  expect(
    await processXBookmarks({
      ...args,
      fetch: async () => ({ data: [{ id: "new", text: "New essay" }], includes: {} }),
    }),
  ).toBe(0)
  expect(readFileSync(args.markdownPath, "utf8")).toContain("New essay")
  expect(readFileSync(args.markdownPath, "utf8")).toContain("Baseline")
  expect(readFileSync(journalPath, "utf8")).toBe(journal)
  expect(readFileSync(capturePath, "utf8")).toBe("Pending transfer checkpoint")
  expect(args.classify).not.toHaveBeenCalled()
  expect(args.transfer).not.toHaveBeenCalled()
})

test("keeps quoted posts, media, and Article metadata in the note", async () => {
  const args = setup()
  await processXBookmarks({
    ...args,
    fetch: async () => ({
      data: [
        {
          id: "new",
          text: "An essay",
          article: { id: "article", title: "Article title" },
          referenced_tweets: [{ id: "quote", type: "quoted" }],
          attachments: { media_keys: ["photo"] },
        },
      ],
      includes: {
        tweets: [{ id: "quote", text: "Original insight", author_id: "author" }],
        users: [{ id: "author", username: "author", name: "Author Name" }],
        media: [
          {
            media_key: "photo",
            type: "photo",
            url: "https://example.com/photo",
            alt_text: "A diagram",
          },
        ],
      },
    }),
  })
  const markdown = readFileSync(args.markdownPath, "utf8")
  expect(markdown).toContain("Article title")
  expect(markdown).toContain("Original insight")
  expect(markdown).toContain("Author Name")
  expect(markdown).toContain("https://example.com/photo")
  expect(markdown).toContain("A diagram")
})

test("does not route newly fetched content until the JSON cache is durable", async () => {
  const args = setup()
  const write = atomic.writeTextAtomically
  const mock = vi.spyOn(atomic, "writeTextAtomically").mockImplementation((path, contents) => {
    if (path === args.jsonPath) throw new Error("cache write failed")
    write(path, contents)
  })
  try {
    await expect(
      processXBookmarks({
        ...args,
        fetch: async () => ({ data: [{ id: "new", text: "Try tool" }] }),
      }),
    ).rejects.toThrow("cache write failed")
    expect(args.transfer).not.toHaveBeenCalled()
    expect(args.classify).not.toHaveBeenCalled()
  } finally {
    mock.mockRestore()
  }
})
