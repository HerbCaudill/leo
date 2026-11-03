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

test.each(["x", "bluesky"])(
  "preserves in-flight %s journals and research for interactive review",
  async kind => {
    const state = join(fixture.root, "state")
    mkdirSync(join(state, "captures"), { recursive: true })
    mkdirSync(join(state, "research"), { recursive: true })
    const capturePath = join(state, "captures", kind + ".json")
    const resultPath = join(state, "research", kind + ".json.pending")
    const record = JSON.stringify({
      version: 2,
      capture: { id: kind, source: { kind, url: "https://example.com/post" } },
      draft: { disposition: "research", title: "Essay", research: "Read essay" },
    })
    writeFileSync(capturePath, record)
    writeFileSync(resultPath, "In-flight result")
    await researchQueue()
    expect(readFileSync(capturePath, "utf8")).toBe(record)
    expect(readFileSync(resultPath, "utf8")).toBe("In-flight result")
    expect(existsSync(join(state, "research", kind + ".json.done"))).toBe(false)
    expect(runCodexAgent).not.toHaveBeenCalled()
    expect(fixture.client).not.toHaveBeenCalled()
  },
)
