import { fillPrompt } from "./fillPrompt.ts"
import { findPushingThread } from "./findPushingThread.ts"
import { getLogExcerpt } from "./getLogExcerpt.ts"
import { listRuns, readFailedLog, readFailedSteps } from "./github.ts"
import { rankCommits } from "./rankCommits.ts"
import { readCommits } from "./readCommits.ts"
import { readCommitSources } from "./readCommitSources.ts"
import type { CiRun } from "./types.ts"

/** Work out whom to wake for a red run and what to tell them. */
export async function planWake(
  /** The red run. */
  run: CiRun,
): Promise<WakePlan> {
  const green = (await listRuns("success"))
    .filter(candidate => candidate.createdAt < run.createdAt)
    .reduce<CiRun | undefined>(
      (latest, candidate) =>
        latest && latest.createdAt >= candidate.createdAt ? latest : candidate,
      undefined,
    )
  const [steps, log, commits, sources] = await Promise.all([
    readFailedSteps(run.id),
    readFailedLog(run.id),
    readCommits(green?.sha, run.sha),
    readCommitSources(),
  ])

  const ranked = rankCommits(commits, log)
  const likeliest = ranked[0]
  // With several commits and no evidence, waking any one of their threads would be a guess.
  const culprit = likeliest && (likeliest.score > 0 || ranked.length === 1) ? likeliest : undefined
  const threadId = culprit && findPushingThread(culprit, sources)

  let reason = "nothing in the log points to one commit, so this thread was started to find it."
  if (culprit)
    reason = threadId
      ? `the failure points to ${culprit.sha.slice(0, 9)} ("${culprit.subject}"), which came from here.`
      : `the failure points to ${culprit.sha.slice(0, 9)} ("${culprit.subject}"), and no thread on this Mac is known to have pushed it, so this one was started.`

  const candidates = ranked.slice(0, MAX_CANDIDATES).map(commit => {
    const thread = findPushingThread(commit, sources)
    return `- ${commit.sha.slice(0, 9)} ${commit.subject} – ${thread ? `thread \`${thread}\`` : "thread unknown"}`
  })

  return {
    threadId,
    message: fillPrompt({
      reason,
      runUrl: run.url,
      runSha: run.sha.slice(0, 9),
      greenSha: green?.sha.slice(0, 9) ?? "unknown",
      steps,
      excerpt: getLogExcerpt(log),
      candidates: candidates.join("\n") || "- none found",
    }),
  }
}

const MAX_CANDIDATES = 6

/** Whom to wake, and the message. */
type WakePlan = {
  /** The responsible thread, or undefined to start one. */
  threadId: string | undefined
  /** What to send. */
  message: string
}
