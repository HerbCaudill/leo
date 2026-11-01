#!/usr/bin/env -S node --experimental-strip-types

import { mkdirSync } from "node:fs"
import { execFile } from "node:child_process"
import { join } from "node:path"
import { promisify } from "node:util"

import {
  BRIEFINGS_REPOSITORY_PATH,
  MORNING_BRIEFING_STATE_DIRECTORY_PATH,
  NEWS_T3_WEBHOOK_URL_PATH,
} from "./constants.ts"
import { formatLocalDate, getLocalTimeZone } from "./date.ts"
import { describeMorningBriefingDryRun, runLiveMorningBriefing } from "./liveRuntime.ts"
import { acquireMorningBriefingRunLock } from "./runLock.ts"
import { runScheduledBriefings } from "./runScheduledBriefings.ts"
import { presentBriefingInT3 } from "./t3Presentation.ts"

/** Parse CLI arguments and run or describe the morning briefing pipeline. */
async function main(): Promise<void> {
  const arguments_ = process.argv.slice(2)
  const dryRun = arguments_.includes("--dry-run")
  const dateArgument = arguments_.find(argument => !argument.startsWith("--"))
  const timeZone = getLocalTimeZone()
  const date = dateArgument ?? formatLocalDate(new Date(), timeZone)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error(`Expected a YYYY-MM-DD date, received ${date}`)

  if (dryRun) {
    process.stdout.write(
      `${JSON.stringify(describeMorningBriefingDryRun({ date, timeZone }), null, 2)}\n`,
    )
    return
  }

  mkdirSync(MORNING_BRIEFING_STATE_DIRECTORY_PATH, { recursive: true })
  const releaseLock = acquireMorningBriefingRunLock(
    join(MORNING_BRIEFING_STATE_DIRECTORY_PATH, "run.lock"),
  )

  try {
    const briefing = await runScheduledBriefings({
      runMorning: () => runLiveMorningBriefing({ date, timeZone }),
      runNews: async () => {
        const { stdout, stderr } = await promisify(execFile)(
          process.execPath,
          [
            "--import",
            "tsx",
            join(BRIEFINGS_REPOSITORY_PATH, "scripts/news-briefing/run.ts"),
            date,
          ],
          {
            cwd: BRIEFINGS_REPOSITORY_PATH,
            maxBuffer: 10 * 1024 * 1024,
          },
        )
        process.stdout.write(stdout)
        process.stderr.write(stderr)
      },
      presentNews: () =>
        presentBriefingInT3({
          webhookUrlPath: NEWS_T3_WEBHOOK_URL_PATH,
          payload: {
            date,
            briefingPath: join(BRIEFINGS_REPOSITORY_PATH, "briefings", `${date}.json`),
          },
        }),
    })
    process.stdout.write(briefing)
  } finally {
    releaseLock()
  }
}

await main().catch(error => {
  console.error(`[morning-briefing] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
