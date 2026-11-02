import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { writeTextAtomically } from "../morning-briefing/atomicWrite.ts"
import { fetchBlueskyBookmarks } from "./fetchBlueskyBookmarks.ts"
import { processCapture } from "./processCapture.ts"
import { blueskyPostUrl, renderBlueskyBookmark } from "./renderBlueskyBookmark.ts"
import type { BlueskyBookmark, BlueskyBookmarks } from "./blueskyBookmarkTypes.ts"
import type { CaptureProcessor } from "./types.ts"

/** Archive bookmarks before routing new posts through the shared capture journal. */
export async function processBlueskyBookmarks(
  args: CaptureProcessor & {
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
    writeTextAtomically(journalPath, JSON.stringify(journal, null, 2))
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
  const handled = new Set([...journal.baselineIds, ...journal.completedIds])
  let processed = 0
  for (const { item } of archive.bookmarks.filter(({ item }) => !handled.has(item.uri))) {
    try {
      await processCapture(
        {
          id: captureId(item.uri),
          timestamp: args.date,
          raw: renderBlueskyBookmark(item),
          source: { kind: "bluesky", url: blueskyPostUrl(item.uri) },
        },
        { ...args, statePath: join(args.statePath, "captures") },
      )
      journal.completedIds.push(item.uri)
      writeTextAtomically(journalPath, JSON.stringify(journal, null, 2))
      processed++
    } catch (error) {
      failures.push(new Error(`Bluesky bookmark ${item.uri}: ${String(error)}`))
    }
  }
  if (failures.length) throw new Error(failures.map(String).join("\n"))
  return processed
}

/** Keep the first copy so fresh fields win, retaining bookmarks removed since. */
function merge(current: BlueskyBookmark[], previous: BlueskyBookmark[]): BlueskyBookmark[] {
  const entries = new Map<string, BlueskyBookmark>()
  for (const bookmark of [...current, ...previous])
    if (!entries.has(bookmark.item.uri)) entries.set(bookmark.item.uri, bookmark)
  return [...entries.values()]
}

/** Build a filename-safe identity; Windows rejects the colons and slashes in an AT URI. */
function captureId(
  /** Post AT URI. */
  uri: string,
): string {
  const [did, , rkey] = uri.replace("at://", "").split("/")
  return `bsky-${did}-${rkey}`.replace(/[^A-Za-z0-9._-]/g, "-")
}

/** Source discovery receipt; capture journals retain routing and transfer checkpoints. */
type BookmarkJournal = {
  /** Journal schema version. */
  version: 1
  /** Post URIs from the first fetch, excluded from classification. */
  baselineIds: string[]
  /** Fully archived and routed post URIs. */
  completedIds: string[]
}
