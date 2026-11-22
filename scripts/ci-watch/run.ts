import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { acquireMorningBriefingRunLock } from "../morning-briefing/runLock.ts"
import { STATE_DIRECTORY_PATH } from "./constants.ts"
import { decideEpisode } from "./decideEpisode.ts"
import { listRuns, markTimeouts, readRun } from "./github.ts"
import { planWake } from "./planWake.ts"
import type { Episode } from "./types.ts"
import { wakeThread } from "./wakeThread.ts"

/*
 * One look at main's CI. launchd runs it every two minutes. No model is involved: it compares run
 * results, and only a change from green to red touches a T3 thread.
 *
 * `--replay <run ID>` prints whom a past failure would wake and the message, and sends nothing.
 */

/** Look once. */
async function main(): Promise<void> {
  mkdirSync(STATE_DIRECTORY_PATH, { recursive: true })
  const [flag, id] = process.argv.slice(2)
  if (flag === "--replay") {
    const { threadId, message } = await planWake(await readRun(Number(id)))
    console.log(`Would wake: ${threadId ?? "a new thread"}\n\n${message}`)
    return
  }

  const release = acquireMorningBriefingRunLock(join(STATE_DIRECTORY_PATH, "watch.lock"))
  try {
    const { episode } = readState()
    const decision = decideEpisode(await markTimeouts(await listRuns()), episode)
    const checkedAt = new Date().toISOString()

    if (decision.kind === "wake") {
      const { run } = decision
      const plan = await planWake(run)
      // Saved only once it's delivered, so a T3 stall means a retry on the next look.
      const threadId = await wakeThread(run, plan.threadId, plan.message)
      writeState({ checkedAt, episode: { runId: run.id, createdAt: run.createdAt, threadId } })
      console.log(`${checkedAt} main is red (${run.id}); woke ${threadId}`)
    } else if (decision.kind === "close") {
      writeState({ checkedAt })
      console.log(`${checkedAt} main is green again`)
    } else {
      writeState({ checkedAt, episode })
    }
  } finally {
    release()
  }
}

/** Read the watcher's memory between looks. */
function readState(): WatcherState {
  const path = join(STATE_DIRECTORY_PATH, "state.json")
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {}
}

/** Save it whole, so a killed look can't leave half a file. */
function writeState(
  /** The new state. */
  state: WatcherState,
): void {
  const path = join(STATE_DIRECTORY_PATH, "state.json")
  writeFileSync(`${path}.tmp`, `${JSON.stringify(state)}\n`)
  renameSync(`${path}.tmp`, path)
}

/** What's saved between looks. */
type WatcherState = {
  /** When main was last looked at successfully. */
  checkedAt?: string
  /** The open red episode. */
  episode?: Episode
}

// launchd won't start another look while one hangs.
setTimeout(
  () => {
    console.log(`${new Date().toISOString()} gave up after 10 minutes`)
    process.exit(1)
  },
  10 * 60 * 1_000,
).unref()

main().catch(error => {
  console.log(`${new Date().toISOString()} look failed: ${error}`)
  process.exitCode = 1
})
