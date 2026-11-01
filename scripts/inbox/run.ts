#!/usr/bin/env -S node --experimental-strip-types

import { join } from "node:path"
import { INBOX_STATE_PATH, VAULT_PATH } from "./constants.ts"
import { researchQueue } from "./researchQueue.ts"
import { runInboxIntake } from "./runInboxIntake.ts"
import { startInboxResearch } from "./startInboxResearch.ts"

/** Run scheduled intake, inspect its source, or drain the independent research queue. */
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.includes("--dry-run")) {
    console.log(
      JSON.stringify(
        {
          state: INBOX_STATE_PATH,
          destination: "Tasks: Inbox",
          xBookmarks: {
            enabled: process.platform === "win32",
            source: join(VAULT_PATH, "documents/x-bookmarks/bookmarks.json"),
            archive: join(VAULT_PATH, "documents/X bookmarks.md"),
            journal: join(INBOX_STATE_PATH, "x-bookmarks.json"),
          },
        },
        null,
        2,
      ),
    )
    return
  }
  if (args.includes("--research-worker")) return researchQueue()
  try {
    console.log(`[inbox-processing] Processed ${await runInboxIntake()} inbox item(s)`)
  } finally {
    await startInboxResearch()
  }
}

await main().catch(error => {
  console.error(`[inbox-processing] ${String(error)}`)
  process.exitCode = 1
})
