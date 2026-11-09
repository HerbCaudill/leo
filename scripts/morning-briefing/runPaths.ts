import { join } from "node:path"

import { formatRunId } from "./date.ts"

/** Build every private artifact path for one timestamped run. */
export function getMorningBriefingRunPaths(
  /** State root, target date, and run instant. */
  args: GetMorningBriefingRunPathsArgs,
): MorningBriefingRunPaths {
  const runId = formatRunId(args.now)
  const root = join(args.stateDirectoryPath, args.date, runId)

  return {
    carryoverPath: join(root, "carryover.md"),
    finalPath: join(root, "final.md"),
    gatherDirectoryPath: join(root, "gather"),
    localMessagesPath: join(root, "local-messages.json"),
    manifestPath: join(root, "manifest.json"),
    mergedPath: join(root, "merged.json"),
    newTasksPath: join(root, "new-tasks.json"),
    root,
    runId,
    sessionReviewDirectoryPath: join(root, "session-review"),
    synthesisDirectoryPath: join(root, "synthesis"),
  }
}

export type MorningBriefingRunPaths = {
  /** Carryover checklist from prior daily notes. */
  carryoverPath: string
  /** Canonical validated briefing Markdown. */
  finalPath: string
  /** Directory containing per-lane JSON and JSONL artifacts. */
  gatherDirectoryPath: string
  /** Signal and Apple Messages transcripts read from local databases. */
  localMessagesPath: string
  /** Run status and artifact index. */
  manifestPath: string
  /** Combined schema-checked gather results. */
  mergedPath: string
  /** Tasks created in Inbox during the run. */
  newTasksPath: string
  /** Unique private directory for this run. */
  root: string
  /** Filesystem-safe timestamp. */
  runId: string
  /** Transcripts and summaries of recent briefing sessions. */
  sessionReviewDirectoryPath: string
  /** Directory containing synthesis output and events. */
  synthesisDirectoryPath: string
}

type GetMorningBriefingRunPathsArgs = {
  /** Target local date. */
  date: string
  /** Run instant used to produce a unique directory. */
  now: Date
  /** Private morning briefing state root. */
  stateDirectoryPath: string
}
