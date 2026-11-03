import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { writeTextAtomically } from "../morning-briefing/atomicWrite.ts"
import { fetchBlueskyBookmarks } from "./fetchBlueskyBookmarks.ts"
import { renderBlueskyBookmark } from "./renderBlueskyBookmark.ts"
import type { BlueskyBookmark, BlueskyBookmarks } from "./blueskyBookmarkTypes.ts"
import type { CaptureProcessor } from "./types.ts"

/** Refresh the accumulating archive for interactive bookmark review. */
export async function processBlueskyBookmarks(
  args: Pick<CaptureProcessor, "statePath"> & {
    /** Accumulating JSON archive, also retaining pending bookmark content. */
    jsonPath: string
    /** Human-readable archive in Obsidian. */
    markdownPath: string
    /** Injectable complete API fetch. */
    fetch?: () => Promise<BlueskyBookmarks>
  },
): Promise<number> {
  const journalPath = join(args.statePath, "bluesky-bookmarks.json")
  mkdirSync(args.statePath, { recursive: true })
  mkdirSync(dirname(args.jsonPath), { recursive: true })
  mkdirSync(dirname(args.markdownPath), { recursive: true })
  const failures: unknown[] = []
  let archive: BlueskyBookmarks = existsSync(args.jsonPath)
    ? JSON.parse(readFileSync(args.jsonPath, "utf8"))
    : { bookmarks: [] }
  let journal: BookmarkJournal | undefined = existsSync(journalPath)
    ? JSON.parse(readFileSync(journalPath, "utf8"))
    : undefined
  if (journal && (journal.version !== 1 || !Array.isArray(journal.completedIds)))
    throw new Error("Invalid Bluesky bookmarks journal")
  try {
    const current = await (args.fetch ?? (() => fetchBlueskyBookmarks()))()
    // Save the baseline before the archive, so a crash cannot baseline later bookmarks.
    journal ??= {
      version: 1,
      baselineIds: current.bookmarks.map(({ item }) => item.uri),
      completedIds: [],
    }
    if (!existsSync(journalPath)) writeTextAtomically(journalPath, JSON.stringify(journal, null, 2))
    archive = { ...current, bookmarks: merge(current.bookmarks, archive.bookmarks) }
    writeTextAtomically(args.jsonPath, JSON.stringify(archive, null, 2))
  } catch (error) {
    failures.push(error)
  }
  if (!journal) throw failures[0]
  const markdown =
    [
      `# Bluesky bookmarks\n\n${archive.bookmarks.length} archived bookmarks, newest fetched bookmarks first. Raw data: \`bluesky-bookmarks/bookmarks.json\`.`,
      ...archive.bookmarks.map(({ item }) => renderBlueskyBookmark(item)),
    ].join("\n\n") + "\n"
  writeTextAtomically(args.markdownPath, markdown)
  if (failures.length) throw new Error(failures.map(String).join("\n"))
  return 0
}

/** Keep the first copy so fresh fields win, retaining bookmarks removed since. */
function merge(current: BlueskyBookmark[], previous: BlueskyBookmark[]): BlueskyBookmark[] {
  const entries = new Map<string, BlueskyBookmark>()
  for (const bookmark of [...current, ...previous])
    if (!entries.has(bookmark.item.uri)) entries.set(bookmark.item.uri, bookmark)
  return [...entries.values()]
}

/** Source discovery receipt; capture journals retain routing and transfer checkpoints. */
type BookmarkJournal = {
  /** Journal schema version. */
  version: 1
  /** Post URIs from the first fetch, retained from the former routing policy. */
  baselineIds: string[]
  /** Fully archived and routed post URIs. */
  completedIds: string[]
}
