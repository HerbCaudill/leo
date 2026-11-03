import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { setTimeout } from "node:timers/promises"
import { acquireMorningBriefingRunLock } from "../morning-briefing/runLock.ts"
import { INBOX_STATE_PATH, VAULT_PATH } from "./constants.ts"
import { importReminders } from "./importReminders.ts"
import { processBlueskyBookmarks } from "./processBlueskyBookmarks.ts"
import { processXBookmarks } from "./processXBookmarks.ts"
import { runCaptureSources } from "./runCaptureSources.ts"

/** Process reminders, X bookmarks, and Bluesky bookmarks under one shared lock, including the pre-briefing pass. */
export async function runInboxIntake(): Promise<number> {
  mkdirSync(INBOX_STATE_PATH, { recursive: true, mode: 0o700 })
  let release: (() => void) | undefined
  while (!release) {
    try {
      release = acquireMorningBriefingRunLock(join(INBOX_STATE_PATH, "intake.lock"))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      await setTimeout(1_000)
    }
  }
  try {
    if (process.platform !== "win32") return await importReminders()
    return await runCaptureSources([
      () =>
        processXBookmarks({
          statePath: INBOX_STATE_PATH,
          jsonPath: join(VAULT_PATH, "documents/x-bookmarks/bookmarks.json"),
          markdownPath: join(VAULT_PATH, "documents/X bookmarks.md"),
        }),
      () =>
        processBlueskyBookmarks({
          statePath: INBOX_STATE_PATH,
          jsonPath: join(VAULT_PATH, "documents/bluesky-bookmarks/bookmarks.json"),
          markdownPath: join(VAULT_PATH, "documents/Bluesky bookmarks.md"),
        }),
    ])
  } finally {
    release()
  }
}
