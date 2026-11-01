import { describe, expect, it } from "vitest"

import {
  findBriefingThread,
  findQuietSessions,
  hasWatchedWork,
  sessionKey,
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

describe("findBriefingThread", () => {
  const threads = [
    { threadId: "news", title: "News briefing – 2026-10-31", createdAt: "2026-10-31T07:10:00Z" },
    { threadId: "old", title: "Morning briefing – 2026-10-30", createdAt: "2026-10-30T07:10:00Z" },
    {
      threadId: "first",
      title: "Morning briefing – 2026-10-31",
      createdAt: "2026-10-31T07:05:00Z",
    },
    {
      threadId: "rerun",
      title: "Morning briefing – 2026-10-31",
      createdAt: "2026-10-31T08:00:00Z",
    },
  ]

  it("picks the newest morning briefing for the date", () => {
    expect(findBriefingThread({ threads, date: "2026-10-31" })?.threadId).toBe("rerun")
  })

  it("returns nothing when the date has no briefing", () => {
    expect(findBriefingThread({ threads, date: "2026-11-01" })).toBeUndefined()
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
