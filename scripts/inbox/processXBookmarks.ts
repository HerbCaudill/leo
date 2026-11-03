import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { writeTextAtomically } from "../morning-briefing/atomicWrite.ts"
import { fetchXBookmarks } from "./fetchXBookmarks.ts"
import { mergeXBookmarks } from "./mergeXBookmarks.ts"
import { renderXBookmark } from "./renderXBookmark.ts"
import type { CaptureProcessor } from "./types.ts"
import type { XBookmarks } from "./xBookmarkTypes.ts"

/** Refresh the accumulating archive for interactive bookmark review. */
export async function processXBookmarks(
  args: Pick<CaptureProcessor, "statePath"> & {
    /** Existing exported JSON, also retaining pending bookmark content. */
    jsonPath: string
    /** Human-readable archive in Obsidian. */
    markdownPath: string
    /** Injectable complete API fetch. */
    fetch?: () => Promise<XBookmarks>
  },
): Promise<number> {
  const journalPath = join(args.statePath, "x-bookmarks.json")
  const original: XBookmarks = JSON.parse(readFileSync(args.jsonPath, "utf8"))
  if (
    !Array.isArray(original.data) ||
    original.data.some(post => !post.id || typeof post.text !== "string")
  )
    throw new Error("Invalid X bookmarks baseline export")
  const journal: BookmarkJournal = existsSync(journalPath)
    ? JSON.parse(readFileSync(journalPath, "utf8"))
    : { version: 1, baselineIds: original.data.map(post => post.id), completedIds: [] }
  if (
    journal.version !== 1 ||
    !Array.isArray(journal.baselineIds) ||
    !Array.isArray(journal.completedIds)
  )
    throw new Error("Invalid X bookmarks journal")
  // Save the baseline before replacing the export, so a crash cannot baseline new bookmarks.
  if (!existsSync(journalPath)) writeTextAtomically(journalPath, JSON.stringify(journal, null, 2))
  const failures: unknown[] = []
  let archive = original
  try {
    const next = mergeXBookmarks(await (args.fetch ?? fetchXBookmarks)(), original)
    writeTextAtomically(args.jsonPath, JSON.stringify(next, null, 2))
    archive = next
  } catch (error) {
    failures.push(error)
  }
  const markdown =
    [
      `# X bookmarks\n\n${archive.data.length} archived bookmarks, newest fetched bookmarks first. Raw data: \`x-bookmarks/bookmarks.json\`.`,
      ...archive.data.map(post => renderXBookmark(post, archive)),
    ].join("\n\n") + "\n"
  writeTextAtomically(args.markdownPath, markdown)
  if (failures.length) throw new Error(failures.map(String).join("\n"))
  return 0
}

/** Source discovery receipt; capture journals retain routing and transfer checkpoints. */
type BookmarkJournal = {
  /** Journal schema version. */
  version: 1
  /** Original export IDs retained from the former routing policy. */
  baselineIds: string[]
  /** Fully archived and routed IDs. */
  completedIds: string[]
}
