import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { expect, test, vi } from "vitest"
import { runCodexAgent } from "../../morning-briefing/codexAgent.ts"
import { researchQueue } from "../researchQueue.ts"

const fixture = vi.hoisted(() => ({
  root: `/tmp/inbox-research-test-${Date.now()}-${Math.random()}`,
  get: vi.fn(),
  write: vi.fn(),
}))
vi.mock("../constants.ts", () => ({
  INBOX_STATE_PATH: `${fixture.root}/state`,
  VAULT_PATH: `${fixture.root}/vault`,
}))
vi.mock("../../morning-briefing/codexAgent.ts", () => ({ runCodexAgent: vi.fn() }))
vi.mock("../../tasks-client/createTasksClient.ts", () => ({
  createTasksClient: () => ({ spaceId: "space", get: fixture.get, write: fixture.write }),
}))
vi.mock("../../tasks-client/saveDescription.ts", () => ({
  saveDescription: async (args: unknown) => fixture.write(args),
}))

test("reuses verified research after a publication failure and refreshes human edits", async () => {
  const state = join(fixture.root, "state")
  const vault = join(fixture.root, "vault")
  mkdirSync(join(state, "captures"), { recursive: true })
  mkdirSync(vault, { recursive: true })
  writeFileSync(
    join(state, "captures/hash.json"),
    JSON.stringify({
      version: 2,
      capture: { id: "hash", timestamp: "2026-09-05T10:00:00+02:00", raw: "Research renewal" },
      draft: { title: "Renew card", research: "Find requirements", question: "", duplicate: null },
      target: {
        kind: "project",
        spaceId: "space",
        id: "project",
        title: "Renew card",
        url: "https://tasks/?project=project",
      },
      date: "2026-09-05",
    }),
  )
  let description = "Preserve this context."
  fixture.get.mockImplementation(async () => ({
    kind: "project",
    id: "project",
    title: "Renew card",
    description,
    availability: "available",
    status: "active",
  }))
  vi.mocked(runCodexAgent).mockImplementation(async args => {
    mkdirSync(join(state, "research"), { recursive: true })
    writeFileSync(join(vault, "Residence renewal.md"), "Verified findings and sources.")
    writeFileSync(
      args.outputPath,
      JSON.stringify({
        notePath: "Residence renewal.md",
        nextSteps: ["Review requirements", "Book appointment"],
        question: "Which card?",
      }),
    )
    description = "New human context."
  })
  fixture.write.mockRejectedValueOnce(new Error("lost reply")).mockResolvedValue(undefined)
  await expect(researchQueue()).rejects.toThrow("need retry")
  expect(existsSync(join(state, "research/hash.json.done"))).toBe(false)
  await researchQueue()
  expect(runCodexAgent).toHaveBeenCalledTimes(1)
  expect(fixture.write.mock.calls[1][0]).toMatchObject({
    record: { kind: "project", description: "New human context." },
    text: expect.stringContaining("New human context."),
  })
  expect(fixture.write.mock.calls[1][0].text).toContain("1. Review requirements")
  expect(readFileSync(join(state, "research/hash.json.done"), "utf8")).toBeTruthy()
})

test("does not mark a missing target complete or rerun old completion receipts", async () => {
  const state = join(fixture.root, "state")
  const record = JSON.parse(readFileSync(join(state, "captures/hash.json"), "utf8"))
  record.capture.id = "missing"
  writeFileSync(join(state, "captures/missing.json"), JSON.stringify(record))
  fixture.get.mockRejectedValue(new Error("Tasks target unknown"))
  vi.mocked(runCodexAgent).mockClear()
  await expect(researchQueue()).rejects.toThrow("need retry")
  expect(existsSync(join(state, "research/missing.json.done"))).toBe(false)
  expect(runCodexAgent).not.toHaveBeenCalled()
})
