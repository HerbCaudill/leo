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

/** Read the e2e target from the checklist, such as "**Target:** `routeCheckPassing` since 2026-11-02T11:30Z". */
export function readE2eTarget(
  /** Contents of the Watching checklist. */
  markdown: string,
): E2eTarget | undefined {
  const match = markdown.match(/\*\*Target:\*\* `(\w+)` since (\d{4}-\d{2}-\d{2}T\d{2}:\d{2})Z/)
  return match ? { metric: match[1], since: new Date(`${match[2]}:00Z`) } : undefined
}

/** Read the hourly history embedded in the coverage report's HTML. */
export function parseCoverageHistory(
  /** The coverage report page. */
  html: string,
): CoverageHistoryEntry[] {
  const match = html.match(/<script id="history"[^>]*>([\s\S]*?)<\/script>/)
  if (!match) throw new Error("The coverage report has no history")
  return JSON.parse(match[1])
}

/** Find what a script can see is wrong with e2e's results, so that no explanation can talk a check out of it. */
export function findE2eSignals(
  /** Coverage history, the target and the current time. */
  args: FindE2eSignalsArgs,
): string[] {
  const { metric, since } = args.target
  const samples = args.history.flatMap(({ hour, claims }) => {
    const value = claims?.[metric]
    return value === undefined ? [] : [{ hour, value }]
  })
  const latest = samples.at(-1)
  if (!latest) return []

  const signals: string[] = []
  const lastChange = samples.findLast((sample, index) => sample.value !== samples[index - 1]?.value)
  const clockStart = Math.max(hourToTime(lastChange?.hour ?? latest.hour), since.getTime())
  const stalledHours = Math.floor((args.now.getTime() - clockStart) / HOUR_MS)
  if (stalledHours >= STALL_HOURS)
    signals.push(`${metric} hasn't moved in ${stalledHours} hours (still ${latest.value}).`)

  // The end of the day before the target was set is the baseline for its first full day.
  const firstDate = new Date(since.getTime() - DAY_MS).toISOString().slice(0, 10)
  const today = args.now.toISOString().slice(0, 10)
  const dayEnds = new Map(samples.map(({ hour, value }) => [hour.slice(0, 10), value] as const))
  const completeDays = [...dayEnds].filter(([date]) => date >= firstDate && date < today)
  const values = completeDays.slice(-4).map(([, value]) => value)
  if (values.length === 4) {
    const [first, second, third] = values.slice(1).map((value, index) => value - values[index])
    if (first > 0 && second * 2 <= first && third * 2 <= second)
      signals.push(
        `${metric}'s daily gain is falling fast: ${first}, then ${second}, then ${third}.`,
      )
  }
  return signals
}

/** Look into a stalled result at most every two hours, which is how long an explanation lasts. */
export function isE2eInvestigationDue(
  /** When this was last looked into, and the current time. */
  args: IsE2eInvestigationDueArgs,
): boolean {
  if (!args.lastInvestigatedAt) return true
  return args.now.getTime() - new Date(args.lastInvestigatedAt).getTime() >= 2 * HOUR_MS
}

/** Don't let an investigation go quiet about a stalled result: if it took no action, Herb hears about it. */
export function settleE2eResult(
  /** The investigation's result and the signals that triggered it. */
  args: SettleE2eResultArgs,
): HeartbeatResult {
  if (args.result.outcome !== "quiet" || !args.signals.length) return args.result
  return {
    outcome: "needs_herb",
    summary: `${args.signals.join(" ")} ${args.result.summary}`,
    blockerKey: "e2e-no-progress",
  }
}

/** Convert a coverage history hour such as 2026-11-02T10 to a time. */
function hourToTime(hour: string): number {
  return new Date(`${hour}:00:00Z`).getTime()
}

const MINUTE_MS = 60 * 1_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const STALL_HOURS = 4
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

export type E2eTarget = {
  /** Coverage claim count that shows progress, such as routeCheckPassing. */
  metric: string
  /** When Herb set this target. */
  since: Date
}

export type CoverageHistoryEntry = {
  /** UTC hour, such as 2026-11-02T10. */
  hour: string
  /** Claim counts by name, if recorded for this hour. */
  claims: Record<string, number> | null
}

export type FindE2eSignalsArgs = {
  /** Hourly coverage history, oldest first. */
  history: CoverageHistoryEntry[]
  /** The result being watched. */
  target: E2eTarget
  /** Current time. */
  now: Date
}

export type IsE2eInvestigationDueArgs = {
  /** ISO time of the last look, if any. */
  lastInvestigatedAt?: string
  /** Current time. */
  now: Date
}

export type HeartbeatResult = {
  /** What the investigation did. */
  outcome: "quiet" | "acted" | "needs_herb"
  /** One short paragraph in plain English. */
  summary: string
  /** Stable name for a blocker, if there is one. */
  blockerKey: string | null
}

export type SettleE2eResultArgs = {
  /** The investigation's result. */
  result: HeartbeatResult
  /** Signals that triggered the investigation. */
  signals: string[]
}
