import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { expect, test, vi } from "vitest"
import { runCodexAgent } from "../../morning-briefing/codexAgent.ts"
import { classifyCapture } from "../classifyCapture.ts"

const fixture = vi.hoisted(() => ({
  root: `${process.env.TEMP ?? "/tmp"}/bookmark-classification-${Date.now()}-${Math.random()}`,
}))
vi.mock("../constants.ts", () => ({ INBOX_STATE_PATH: fixture.root }))
vi.mock("../../morning-briefing/codexAgent.ts", () => ({ runCodexAgent: vi.fn() }))
vi.mock("../../tasks-client/loadTasks.ts", () => ({ loadTasks: async () => [] }))

test("requires valid routing and a research scope before accepting a bookmark classification", async () => {
  const capture = {
    id: "x-123",
    timestamp: "2026-10-25",
    raw: "An essay",
    source: { kind: "x" as const, url: "https://x.com/i/status/123" },
  }
  const draft = {
    title: "An essay",
    question: "",
    research: "Read the essay",
    disposition: "research",
    duplicate: null,
  }
  vi.mocked(runCodexAgent).mockImplementation(async args => {
    mkdirSync(dirname(args.outputPath), { recursive: true })
    writeFileSync(args.outputPath, JSON.stringify(draft))
  })
  expect(await classifyCapture(capture, "2026-10-25")).toEqual(draft)
  draft.research = ""
  await expect(classifyCapture(capture, "2026-10-25")).rejects.toThrow(
    "Invalid capture classification",
  )
  draft.disposition = "unknown"
  await expect(classifyCapture(capture, "2026-10-25")).rejects.toThrow(
    "Invalid capture classification",
  )
})
