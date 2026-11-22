import { runT3 } from "../heartbeat/runT3.ts"
import { resolveModelRole } from "./resolveModelRole.ts"
import { CHECKOUT_PATH } from "./constants.ts"
import type { CiRun } from "./types.ts"

/** Deliver the message to the responsible thread, or to a new one when there is none. */
export async function wakeThread(
  /** The red run. */
  run: CiRun,
  /** The responsible thread, if there is one. */
  threadId: string | undefined,
  /** The message. */
  message: string,
): Promise<string> {
  if (threadId) {
    await runT3(["thread", "send", threadId, "-", "--json", "--log-level", "error"], message)
    return threadId
  }
  const { model } = await resolveModelRole()
  const output = await runT3(
    [
      "thread",
      "start",
      CHECKOUT_PATH,
      "-",
      "--title",
      "Fix red main",
      "--provider",
      "claudeAgent",
      "--model",
      model,
      "--worktree",
      "origin/main",
      "--branch",
      `fix-red-main-${run.id}`,
      "--json",
      "--log-level",
      "error",
    ],
    message,
  )
  return String(JSON.parse(output).threadId)
}
