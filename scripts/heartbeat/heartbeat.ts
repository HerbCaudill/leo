/** Check that the checklist has at least one entry, so an empty one costs no agent run. */
export function hasWatchedWork(
  /** Contents of the Watching checklist. */
  markdown: string,
): boolean {
  return /^## /m.test(markdown)
}

/** Find the newest morning briefing thread for a date, which is where Herb is told about blockers. */
export function findBriefingThread<T extends BriefingThread>(
  /** Candidate threads and the local date. */
  args: FindBriefingThreadArgs<T>,
): T | undefined {
  return args.threads
    .filter(thread => thread.title === `Morning briefing – ${args.date}`)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
}

/** Report each blocker once, so a repeated blocker stays quiet. */
export function shouldNotifyHerb(
  /** Current blocker and the blockers Herb has already heard about. */
  args: ShouldNotifyHerbArgs,
): boolean {
  return !args.notifiedBlockerKeys.includes(args.blockerKey)
}

/** Identify a session's latest run, so each finished run is reviewed only once. */
export function sessionKey(
  /** Session to identify. */
  thread: SessionThread,
): string {
  return `${thread.threadId}:${thread.latestRunId}`
}

/** Find open top-level sessions that have gone quiet and may have stopped for no reason. */
export function findQuietSessions<T extends SessionThread>(
  /** Candidate threads, the current time and the runs already reviewed. */
  args: FindQuietSessionsArgs<T>,
): T[] {
  return args.threads.filter(thread => {
    if (thread.parentThreadId || thread.settled || thread.snoozed) return false
    const quietMs = args.now.getTime() - new Date(thread.updatedAt).getTime()
    if (quietMs > MAX_SESSION_AGE_MS) return false
    if (thread.status === "running") return quietMs >= HUNG_AFTER_MS
    return (
      ENDED_STATUSES.includes(thread.status) &&
      quietMs >= QUIET_AFTER_MS &&
      !args.reviewedKeys.includes(sessionKey(thread))
    )
  })
}

const MINUTE_MS = 60 * 1_000
const QUIET_AFTER_MS = 15 * MINUTE_MS
const HUNG_AFTER_MS = 30 * MINUTE_MS
const MAX_SESSION_AGE_MS = 3 * 24 * 60 * MINUTE_MS
const ENDED_STATUSES = ["completed", "interrupted", "failed"]

export type SessionThread = {
  /** T3 thread ID. */
  threadId: string
  /** Thread title. */
  title: string
  /** Thread status. */
  status: string
  /** Latest run ID, if the thread has run. */
  latestRunId: string | null
  /** Whether Herb has settled the thread. */
  settled: boolean
  /** Whether Herb has snoozed the thread. */
  snoozed: boolean
  /** Parent thread ID, for delegated threads. */
  parentThreadId: string | null
  /** ISO time of the last activity. */
  updatedAt: string
}

export type FindQuietSessionsArgs<T extends SessionThread> = {
  /** Candidate threads. */
  threads: T[]
  /** Current time. */
  now: Date
  /** Keys of runs already reviewed. */
  reviewedKeys: string[]
}

export type BriefingThread = {
  /** T3 thread ID. */
  threadId: string
  /** Thread title. */
  title: string
  /** ISO creation time. */
  createdAt: string
}

export type FindBriefingThreadArgs<T extends BriefingThread> = {
  /** Candidate threads. */
  threads: T[]
  /** Local date as YYYY-MM-DD. */
  date: string
}

export type ShouldNotifyHerbArgs = {
  /** Stable name for the current blocker. */
  blockerKey: string
  /** Blockers already reported. */
  notifiedBlockerKeys: string[]
}
