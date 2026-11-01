import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test, vi } from "vitest"

import { presentBriefingInT3, presentMorningBriefingInT3 } from "../t3Presentation.ts"

const directories: string[] = []

afterEach(() => {
  directories.forEach(directory => rmSync(directory, { recursive: true, force: true }))
  directories.length = 0
})

test("opens T3 Code, then sends the date and daily note path to the webhook", async () => {
  const calls: string[] = []
  const openT3 = vi.fn(async () => {
    calls.push("open")
  })
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => {
    void _url
    void _init
    calls.push("post")
    return new Response(null, { status: 202 })
  })

  await presentMorningBriefingInT3({
    dailyNotePath: "/notes/daily/2026-10-09.md",
    date: "2026-10-09",
    fetch,
    openT3,
    webhookUrlPath: writeWebhookUrl("https://relay.example/hook/secret\n"),
  })

  expect(calls).toEqual(["open", "post"])
  const [url, init] = fetch.mock.calls[0]!
  expect(url).toBe("https://relay.example/hook/secret")
  expect(init.method).toBe("POST")
  expect(JSON.parse(String(init.body))).toEqual({
    dailyNotePath: "/notes/daily/2026-10-09.md",
    date: "2026-10-09",
  })
})

test("fails when the webhook rejects the request", async () => {
  await expect(
    presentMorningBriefingInT3({
      dailyNotePath: "/notes/daily/2026-10-09.md",
      date: "2026-10-09",
      fetch: async () => new Response("gone", { status: 404 }),
      openT3: async () => {},
      webhookUrlPath: writeWebhookUrl("https://relay.example/hook/secret"),
    }),
  ).rejects.toThrow("T3 webhook returned 404")
})

test("fails clearly when the webhook URL file is missing", async () => {
  await expect(
    presentMorningBriefingInT3({
      dailyNotePath: "/notes/daily/2026-10-09.md",
      date: "2026-10-09",
      fetch: vi.fn(),
      openT3: async () => {},
      webhookUrlPath: "/nonexistent/t3-webhook-url",
    }),
  ).rejects.toThrow("/nonexistent/t3-webhook-url")
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
