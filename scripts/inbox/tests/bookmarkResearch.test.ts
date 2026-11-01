import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { expect, test, vi } from "vitest"
import { runCodexAgent } from "../../morning-briefing/codexAgent.ts"
import { researchQueue } from "../researchQueue.ts"

const fixture = vi.hoisted(() => ({
  root: `${process.env.TEMP ?? "/tmp"}/bookmark-research-${Date.now()}-${Math.random()}`,
  client: vi.fn(),
}))
vi.mock("../constants.ts", () => ({
  INBOX_STATE_PATH: `${fixture.root}/state`,
  VAULT_PATH: `${fixture.root}/vault`,
}))
vi.mock("../../morning-briefing/codexAgent.ts", () => ({ runCodexAgent: vi.fn() }))
vi.mock("../../tasks-client/createTasksClient.ts", () => ({ createTasksClient: fixture.client }))

test("researches a queued bookmark without a Tasks target and retries until its note is verified", async () => {
  const state = join(fixture.root, "state")
  const vault = join(fixture.root, "vault")
  mkdirSync(join(state, "captures"), { recursive: true })
  mkdirSync(join(state, "research"), { recursive: true })
  mkdirSync(vault, { recursive: true })
  writeFileSync(
    join(state, "captures/x-123.json"),
    JSON.stringify({
      version: 2,
      date: "2026-10-25",
      capture: {
        id: "x-123",
        timestamp: "2026-10-25",
        raw: "Essay https://example.com/essay",
        source: { kind: "x", url: "https://x.com/i/status/123" },
      },
      draft: {
        disposition: "research",
        title: "Read essay",
        research: "Read and summarize the essay",
        question: "",
        duplicate: null,
      },
    }),
  )
  vi.mocked(runCodexAgent).mockImplementation(async args => {
    writeFileSync(
      args.outputPath,
      JSON.stringify({ notePath: "Essay.md", nextSteps: [], question: "" }),
    )
  })
  await expect(researchQueue()).rejects.toThrow("need retry")
  expect(existsSync(join(state, "research/x-123.json.done"))).toBe(false)
  writeFileSync(join(vault, "Essay.md"), "Useful summary with the post and essay links.")
  await researchQueue()
  expect(readFileSync(join(state, "research/x-123.json"), "utf8")).toContain("Essay.md")
  expect(existsSync(join(state, "research/x-123.json.done"))).toBe(true)
  expect(runCodexAgent).toHaveBeenLastCalledWith(
    expect.objectContaining({
      persistent: true,
      timeoutMs: null,
      prompt: expect.stringContaining("https://x.com/i/status/123"),
    }),
  )
  expect(fixture.client).not.toHaveBeenCalled()
  await researchQueue()
  expect(runCodexAgent).toHaveBeenCalledTimes(2)
})
