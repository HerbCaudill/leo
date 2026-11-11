import { describe, expect, it } from "vitest"

import {
  findE2eSignals,
  findQuietSessions,
  hasWatchedWork,
  isE2eInvestigationDue,
  parseCoverageHistory,
  planHerbAsk,
  readE2eTarget,
  sessionKey,
  settleE2eResult,
  shouldNotifyHerb,
  type SessionThread,
} from "../heartbeat.ts"

describe("hasWatchedWork", () => {
  it("is true when the checklist has an entry", () => {
    expect(hasWatchedWork("# Watching\n\nIntro.\n\n## DevResults e2e parity\n\n- Item\n")).toBe(
      true,
    )
  })

  it("is false when the checklist has only its introduction", () => {
    expect(hasWatchedWork("# Watching\n\nWork the heartbeat keeps an eye on.\n")).toBe(false)
  })
})

describe("planHerbAsk", () => {
  const result = {
    outcome: "needs_herb" as const,
    summary: "Coordinator paused; lanes idle.",
    blockerKey: "coordinator-hold",
    question: "The parity coordinator has been paused since 08:30. Resume it?",
    title: "Resume parity coordination?",
    ownerThreadId: null,
    ownerMachine: null,
  }

  it("asks Herb in the thread that owns the decision", () => {
    const ask = planHerbAsk({ ...result, ownerThreadId: "parity", ownerMachine: "mac" })
    expect(ask).toMatchObject({ kind: "owner", machine: "mac", threadId: "parity" })
    expect(ask.message).toContain(result.question)
  })

  it("starts a thread for a decision no thread owns", () => {
    const ask = planHerbAsk(result)
    expect(ask).toMatchObject({ kind: "new", title: "Resume parity coordination?" })
    expect(ask.message).toContain(result.question)
  })
})

describe("shouldNotifyHerb", () => {
  it("notifies about a new blocker", () => {
    expect(shouldNotifyHerb({ blockerKey: "disk-full", notifiedBlockerKeys: ["other"] })).toBe(true)
  })

  it("reports a repeated blocker only once", () => {
    expect(shouldNotifyHerb({ blockerKey: "disk-full", notifiedBlockerKeys: ["disk-full"] })).toBe(
      false,
    )
  })
})

describe("findQuietSessions", () => {
  const now = new Date("2026-11-01T12:00:00Z")
  const thread = (overrides: Partial<SessionThread> = {}): SessionThread => ({
    threadId: "t1",
    title: "Work",
    status: "completed",
    latestRunId: "run-1",
    settled: false,
    snoozed: false,
    parentThreadId: null,
    updatedAt: "2026-11-01T11:00:00Z",
    ...overrides,
  })
  const ids = (threads: SessionThread[], reviewedKeys: string[] = []) =>
    findQuietSessions({ threads, now, reviewedKeys }).map(session => session.threadId)

  it("finds an open session whose run ended a while ago", () => {
    expect(ids([thread()])).toEqual(["t1"])
    expect(ids([thread({ status: "failed" })])).toEqual(["t1"])
    expect(ids([thread({ status: "interrupted" })])).toEqual(["t1"])
  })

  it("ignores a session Herb could still be talking to", () => {
    expect(ids([thread({ updatedAt: "2026-11-01T11:50:00Z" })])).toEqual([])
  })

  it("ignores settled, snoozed, delegated, waiting and long-abandoned sessions", () => {
    expect(ids([thread({ settled: true })])).toEqual([])
    expect(ids([thread({ snoozed: true })])).toEqual([])
    expect(ids([thread({ parentThreadId: "parent" })])).toEqual([])
    expect(ids([thread({ status: "waiting" })])).toEqual([])
    expect(ids([thread({ updatedAt: "2026-10-25T11:00:00Z" })])).toEqual([])
  })

  it("reviews a finished run once, and again after a new run", () => {
    const reviewed = [sessionKey(thread())]
    expect(ids([thread()], reviewed)).toEqual([])
    expect(ids([thread({ latestRunId: "run-2" })], reviewed)).toEqual(["t1"])
  })

  it("keeps flagging a running session with no recent activity", () => {
    const running = thread({ status: "running" })
    expect(ids([running], [sessionKey(running)])).toEqual(["t1"])
    expect(ids([thread({ status: "running", updatedAt: "2026-11-01T11:45:00Z" })])).toEqual([])
  })
})

describe("findE2eSignals", () => {
  const target = { metric: "routeCheckPassing", since: new Date("2026-11-02T00:00:00Z") }
  const entry = (hour: string, routeCheckPassing: number) => ({
    hour,
    claims: { routeCheckPassing },
  })

  it("flags a target that hasn't moved for four hours", () => {
    const history = [entry("2026-11-02T01", 100), entry("2026-11-02T02", 150)]
    expect(findE2eSignals({ history, target, now: new Date("2026-11-02T06:30:00Z") })).toEqual([
      "routeCheckPassing hasn't moved in 4 hours (still 150).",
    ])
  })

  it("stays quiet when the target moved recently", () => {
    const history = [entry("2026-11-02T01", 100), entry("2026-11-02T05", 150)]
    expect(findE2eSignals({ history, target, now: new Date("2026-11-02T06:30:00Z") })).toEqual([])
  })

  it("starts the clock when the target was set, not at the last change", () => {
    const history = [entry("2026-10-28T19", 100), entry("2026-11-01T10", 100)]
    expect(findE2eSignals({ history, target, now: new Date("2026-11-02T03:00:00Z") })).toEqual([])
    expect(findE2eSignals({ history, target, now: new Date("2026-11-02T04:00:00Z") })).toEqual([
      "routeCheckPassing hasn't moved in 4 hours (still 100).",
    ])
  })

  it("flags a daily rate that halved two days running", () => {
    const history = [
      entry("2026-11-01T23", 0),
      entry("2026-11-02T23", 400),
      entry("2026-11-03T23", 600),
      entry("2026-11-04T23", 700),
      entry("2026-11-05T01", 800),
    ]
    expect(findE2eSignals({ history, target, now: new Date("2026-11-05T02:00:00Z") })).toEqual([
      "routeCheckPassing's daily gain is falling fast: 400, then 200, then 100.",
    ])
  })

  it("ignores days before the target was set and entries without counts", () => {
    const history = [
      { hour: "2026-10-30T23", claims: null },
      entry("2026-10-31T23", 0),
      entry("2026-11-01T23", 400),
      entry("2026-11-02T23", 500),
      entry("2026-11-03T23", 550),
      entry("2026-11-04T01", 600),
    ]
    expect(findE2eSignals({ history, target, now: new Date("2026-11-04T02:00:00Z") })).toEqual([])
  })
})

describe("readE2eTarget", () => {
  it("reads the metric and start time from the checklist", () => {
    expect(
      readE2eTarget("- **Target:** `routeCheckPassing` since 2026-11-02T11:30Z. Why.\n"),
    ).toEqual({ metric: "routeCheckPassing", since: new Date("2026-11-02T11:30:00Z") })
  })

  it("is undefined when the checklist names no target", () => {
    expect(readE2eTarget("## DevResults e2e parity\n")).toBeUndefined()
  })
})

describe("parseCoverageHistory", () => {
  it("reads the history embedded in the coverage report", () => {
    const html = `<script id="data" type="application/json">{}</script><script id="history" type="application/json">
      [{"hour":"2026-11-02T01","claims":{"routeCheckPassing":5}}]
    </script>`
    expect(parseCoverageHistory(html)).toEqual([
      { hour: "2026-11-02T01", claims: { routeCheckPassing: 5 } },
    ])
  })

  it("throws when the report has no history", () => {
    expect(() => parseCoverageHistory("<html></html>")).toThrow()
  })
})

describe("isE2eInvestigationDue", () => {
  const now = new Date("2026-11-02T12:00:00Z")

  it("is due on the first signal and after two hours", () => {
    expect(isE2eInvestigationDue({ now })).toBe(true)
    expect(isE2eInvestigationDue({ lastInvestigatedAt: "2026-11-02T10:00:00Z", now })).toBe(true)
  })

  it("isn't due again within two hours", () => {
    expect(isE2eInvestigationDue({ lastInvestigatedAt: "2026-11-02T10:30:00Z", now })).toBe(false)
  })
})

describe("settleE2eResult", () => {
  const noAsk = {
    blockerKey: null,
    question: null,
    title: null,
    ownerThreadId: null,
    ownerMachine: null,
  }

  it("turns a quiet result into a blocker for Herb while results are stalled", () => {
    expect(
      settleE2eResult({
        result: { ...noAsk, outcome: "quiet", summary: "Memory is holding checks." },
        signals: ["routeCheckPassing hasn't moved in 4 hours (still 150)."],
      }),
    ).toEqual({
      ...noAsk,
      outcome: "needs_herb",
      summary: "routeCheckPassing hasn't moved in 4 hours (still 150). Memory is holding checks.",
      blockerKey: "e2e-no-progress",
    })
  })

  it("leaves other results alone", () => {
    const acted = { ...noAsk, outcome: "acted" as const, summary: "Refilled." }
    expect(settleE2eResult({ result: acted, signals: ["stalled"] })).toEqual(acted)
    const quiet = { ...noAsk, outcome: "quiet" as const, summary: "Fine." }
    expect(settleE2eResult({ result: quiet, signals: [] })).toEqual(quiet)
  })
})
