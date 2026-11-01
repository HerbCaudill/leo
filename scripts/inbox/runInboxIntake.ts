import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { setTimeout } from "node:timers/promises"
import { formatLocalDate } from "../morning-briefing/date.ts"
import { acquireMorningBriefingRunLock } from "../morning-briefing/runLock.ts"
import { INBOX_STATE_PATH, VAULT_PATH } from "./constants.ts"
import { importReminders } from "./importReminders.ts"
import { createTasksClient } from "../tasks-client/createTasksClient.ts"
import { targetFromRecord } from "../tasks-client/targetFromRecord.ts"
import { assertCaptureSpace } from "../tasks-client/assertCaptureSpace.ts"
import { transferCapture } from "./transferCapture.ts"
import { classifyCapture } from "./classifyCapture.ts"
import { processXBookmarks } from "./processXBookmarks.ts"
import type { CaptureProcessor } from "./types.ts"

/** Process reminders and X bookmarks under one shared lock, including the pre-briefing pass. */
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
    return await processXBookmarks({
      ...captureProcessor(),
      statePath: INBOX_STATE_PATH,
      jsonPath: join(VAULT_PATH, "documents/x-bookmarks/bookmarks.json"),
      markdownPath: join(VAULT_PATH, "documents/X bookmarks.md"),
    })
  } finally {
    release()
  }
}

/** Shared classifier, identity recovery, and Tasks write boundary. */
function captureProcessor(): CaptureProcessor {
  const date = formatLocalDate(new Date(), "Europe/Madrid")
  return {
    statePath: join(INBOX_STATE_PATH, "captures"),
    date,
    prepareRecord: async record => {
      const client = createTasksClient()
      assertCaptureSpace(record, client.spaceId)
      if (!record.target) return record
      return {
        ...record,
        target: targetFromRecord(
          await client.get(record.target.kind, record.target.id),
          client.spaceId,
        ),
      }
    },
    transfer: (capture, draft, recovery) => transferCapture({ capture, draft, ...recovery }),
    classify: capture => classifyCapture(capture, date),
  }
}
