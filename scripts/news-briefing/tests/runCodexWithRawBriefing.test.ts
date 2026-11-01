import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test, vi } from "vitest"
import { runCodexAgent } from "../../morning-briefing/codexAgent.ts"
import { runCodexWithRawBriefing } from "../runCodexWithRawBriefing.ts"

vi.mock("../../morning-briefing/codexAgent.ts", () => ({ runCodexAgent: vi.fn() }))

test("gives a read-only Codex agent the file contents and returns its final message", async () => {
  const rawBriefingPath = join(mkdtempSync(join(tmpdir(), "raw-briefing-")), "news.json")
  writeFileSync(rawBriefingPath, '{"articles":[]}')
  vi.mocked(runCodexAgent).mockImplementation(async args => {
    writeFileSync(args.outputPath, '{"stories":[]}')
  })

  await expect(
    runCodexWithRawBriefing({ prompt: "Select stories", rawBriefingPath }),
  ).resolves.toBe('{"stories":[]}')

  const args = vi.mocked(runCodexAgent).mock.calls[0]![0]
  expect(args).toMatchObject({ level: 55, sandbox: "read-only" })
  expect(args.prompt).toContain('{"articles":[]}')
  expect(args.prompt).toContain("Select stories")
})
