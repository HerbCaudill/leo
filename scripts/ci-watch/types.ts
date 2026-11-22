/** How a workflow run ended. */
export type Conclusion =
  | "success"
  | "failure"
  | "timed_out"
  | "startup_failure"
  | "cancelled"
  | "skipped"
  | "action_required"
  | "neutral"
  | "stale"

/** A finished CI run on main. */
export type CiRun = {
  /** GitHub's ID for the run. */
  id: number
  /** The commit it checked. */
  sha: string
  /** How it ended. */
  conclusion: Conclusion
  /** When it was queued, which is the order main moved in. */
  createdAt: string
  /** When it last changed. */
  updatedAt: string
  /** Its page on GitHub. */
  url: string
}

/** A stretch of red main that someone has been woken for. */
export type Episode = {
  /** The run that opened it. */
  runId: number
  /** When that run was queued. */
  createdAt: string
  /** The thread that was woken. */
  threadId?: string
}

/** A commit that could have turned main red. */
export type Commit = {
  /** Its full SHA. */
  sha: string
  /** Its subject. */
  subject: string
  /** The files it changed. */
  files: string[]
  /** Its diff. */
  patch: string
}

/** Where commits came from, for finding the thread that pushed one. */
export type CommitSources = {
  /** What the pre-push hook recorded, oldest first. */
  pushes: Array<{ threadId: string; commits: string[] }>
  /** Each linked worktree's HEAD reflog. */
  reflogs: Array<{ worktree: string; text: string }>
  /** The newest top-level thread in each worktree. */
  threadsByWorktree: Map<string, string>
  /** The thread linked to each pull request. */
  threadsByPullRequest: Map<number, string>
  /** Threads that can be woken. */
  liveThreads: Set<string>
}
