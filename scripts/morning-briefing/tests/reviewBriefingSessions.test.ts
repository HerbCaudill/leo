import { describe, expect, test, vi } from "vitest"

import { reviewBriefingSessions } from "../reviewBriefingSessions.ts"
import type { T3ThreadSummary } from "../reviewBriefingSessions.ts"

describe("reviewBriefingSessions", () => {
  test("summarizes the three latest prior briefing sessions, newest first", async () => {
    const summarize = vi.fn(
      async ({ date }: { date: string; transcript: string }) => `Summary for ${date}`,
    )

    const markdown = await reviewBriefingSessions({
      date: "2026-11-09",
      listThreads: async () => [
        thread("today", "Morning briefing – 2026-11-09"),
        thread("news", "News briefing – 2026-11-08"),
        thread("d08", "Morning briefing – 2026-11-08"),
        thread("d05", "Morning briefing – 2026-11-05"),
        thread("d07", "Morning briefing – 2026-11-07"),
        thread("d06", "Morning briefing – 2026-11-06"),
      ],
      showThread: async threadId => [
        { role: "user", text: `Question in ${threadId}` },
        { role: "assistant", text: `Answer in ${threadId}` },
      ],
      summarize,
    })

    expect(summarize.mock.calls.map(([call]) => call.date)).toEqual([
      "2026-11-08",
      "2026-11-07",
      "2026-11-06",
    ])
    expect(summarize.mock.calls[0]?.[0].transcript).toContain("Question in d08")
    expect(summarize.mock.calls[0]?.[0].transcript).toContain("Answer in d08")
    expect(markdown).toContain("Summary for 2026-11-08")
    expect(markdown.indexOf("2026-11-08")).toBeLessThan(markdown.indexOf("2026-11-06"))
    expect(markdown).not.toContain("2026-11-05")
    expect(markdown).not.toContain("2026-11-09")
  })

  test("reports unavailable sessions instead of failing the briefing", async () => {
    const listingFailure = await reviewBriefingSessions({
      date: "2026-11-09",
      listThreads: async () => {
        throw new Error("T3 server is not running")
      },
      showThread: async () => [],
      summarize: async () => "",
    })
    expect(listingFailure).toContain("T3 server is not running")

    const summaryFailure = await reviewBriefingSessions({
      date: "2026-11-09",
      listThreads: async () => [
        thread("d08", "Morning briefing – 2026-11-08"),
        thread("d07", "Morning briefing – 2026-11-07"),
      ],
      showThread: async () => [{ role: "user", text: "Hi" }],
      summarize: async ({ date }) => {
        if (date === "2026-11-08") throw new Error("Codex timed out")
        return "Endesa is resolved."
      },
    })
    expect(summaryFailure).toContain("Codex timed out")
    expect(summaryFailure).toContain("Endesa is resolved.")
  })
})

function thread(threadId: string, title: string): T3ThreadSummary {
  return { threadId, title }
}
