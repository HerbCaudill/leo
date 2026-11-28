import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test, vi } from "vitest"

import {
  presentBriefingInT3,
  presentMorningBriefingInT3,
  type StartT3ThreadRequest,
} from "../t3Presentation.ts"

const directories: string[] = []

afterEach(() => {
  directories.forEach(directory => rmSync(directory, { recursive: true, force: true }))
  directories.length = 0
})

test("starts the morning thread on the writer role's model with the saved briefing location", async () => {
  const calls: string[] = []
  const startThread = vi.fn(async (_request: StartT3ThreadRequest) => {
    void _request
    calls.push("start")
  })

  await presentMorningBriefingInT3({
    dailyNotePath: "/notes/daily/2026-10-09.md",
    date: "2026-10-09",
    openT3: async () => {
      calls.push("open")
    },
    resolveRole: role => ({ effort: "high", harness: "antigravity", model: `${role}-model` }),
    startThread,
  })

  expect(calls).toEqual(["open", "start"])
  const request = startThread.mock.calls[0]![0]
  expect(request.provider).toBe("antigravity")
  expect(request.model).toBe("writer-model")
  expect(request.message).toContain("for 2026-10-09 from /notes/daily/2026-10-09.md")
  expect(request.message).not.toContain("{{")
})

test("retries starting the thread while T3 is still starting up", async () => {
  const startThread = vi
    .fn<(request: StartT3ThreadRequest) => Promise<void>>()
    .mockRejectedValueOnce(new Error("server not running"))
    .mockResolvedValueOnce()

  await presentMorningBriefingInT3({
    dailyNotePath: "/notes/daily/2026-10-09.md",
    date: "2026-10-09",
    openT3: async () => {},
    resolveRole: () => ({ effort: "high", harness: "claude", model: "claude-model" }),
    retryDelayMs: 0,
    startThread,
  })

  expect(startThread).toHaveBeenCalledTimes(2)
  expect(startThread.mock.calls[1]![0].provider).toBe("claudeAgent")
})

test("fails clearly when the role's harness has no T3 provider", async () => {
  await expect(
    presentMorningBriefingInT3({
      dailyNotePath: "/notes/daily/2026-10-09.md",
      date: "2026-10-09",
      openT3: async () => {},
      resolveRole: () => ({ effort: "high", harness: "pi", model: "pi-model" }),
      startThread: vi.fn(),
    }),
  ).rejects.toThrow("pi")
})

/** Write a webhook URL file in an isolated temporary directory. */
function writeWebhookUrl(content: string): string {
  const root = mkdtempSync(join(tmpdir(), "t3-presentation-"))
  directories.push(root)
  const path = join(root, "t3-webhook-url")
  writeFileSync(path, content)
  return path
}

test("sends the saved news JSON path to its own webhook", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 202 }))
  await presentBriefingInT3({
    payload: { date: "2026-10-14", briefingPath: "/briefings/briefings/2026-10-14.json" },
    webhookUrlPath: writeWebhookUrl("https://relay.example/news"),
    fetch,
    openT3: async () => {},
  })
  expect(fetch).toHaveBeenCalledWith(
    "https://relay.example/news",
    expect.objectContaining({
      body: JSON.stringify({
        date: "2026-10-14",
        briefingPath: "/briefings/briefings/2026-10-14.json",
      }),
      method: "POST",
    }),
  )
})
