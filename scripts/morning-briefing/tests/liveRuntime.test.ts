import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test, vi } from "vitest"

import { presentMorningBriefingInT3 } from "../t3Presentation.ts"
import { publishDailyBriefingToNote } from "../dailyNote.ts"
import { runLiveMorningBriefing } from "../liveRuntime.ts"
import { syncMorningBriefingToObsidian } from "../obsidian.ts"
import { getMorningBriefingRunPaths } from "../runPaths.ts"

vi.mock("../../inbox/runInboxIntake.ts", () => ({ runInboxIntake: vi.fn() }))
vi.mock("../../inbox/startInboxResearch.ts", () => ({ startInboxResearch: vi.fn() }))
vi.mock("../gatherMorningBriefingLane.ts", () => ({
  gatherMorningBriefingLane: vi
    .fn()
    .mockResolvedValue({ coverage: [], lane: "schedule", report: "" }),
}))
vi.mock("../synthesizeMorningBriefing.ts", () => ({
  synthesizeMorningBriefing: vi
    .fn()
    .mockResolvedValue({ markdown: "## Daily briefing\n", newTasks: [] }),
}))
vi.mock("../createInboxTasks.ts", () => ({
  createInboxTasks: vi.fn().mockResolvedValue({ created: [], deferred: [] }),
}))
vi.mock("../readLocalMessages.ts", () => ({ readLocalMessages: vi.fn().mockResolvedValue([]) }))
vi.mock("../finalizeBriefing.ts", () => ({
  finalizeMorningBriefing: vi.fn((markdown: string) => markdown),
}))
vi.mock("../reviewBriefingSessions.ts", () => ({
  createLiveSessionReviewDependencies: vi.fn(() => ({})),
  reviewBriefingSessions: vi
    .fn()
    .mockResolvedValue("## Herb's updates from recent briefing sessions\n"),
}))
vi.mock("../t3Presentation.ts", () => ({ presentMorningBriefingInT3: vi.fn() }))
vi.mock("../obsidian.ts", () => ({ syncMorningBriefingToObsidian: vi.fn() }))
vi.mock("../dailyNote.ts", async importOriginal => ({
  ...(await importOriginal<typeof import("../dailyNote.ts")>()),
  publishDailyBriefingToNote: vi.fn(
    (await importOriginal<typeof import("../dailyNote.ts")>()).publishDailyBriefingToNote,
  ),
}))

const directories: string[] = []

afterEach(() => {
  directories.forEach(directory => rmSync(directory, { recursive: true, force: true }))
  directories.length = 0
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

test.each(["Obsidian Sync did not finish after 30 status checks", "Obsidian CLI unavailable"])(
  "delivers the saved briefing and records a sync failure: %s",
  async message => {
    const args = createRunArgs()
    vi.mocked(syncMorningBriefingToObsidian).mockRejectedValueOnce(new Error(message))
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {})

    const markdown = await runLiveMorningBriefing(args)

    expect(readFileSync(join(args.dailyNotesDirectoryPath, `${args.date}.md`), "utf8")).toBe(
      markdown,
    )
    expect(presentMorningBriefingInT3).toHaveBeenCalledWith({
      dailyNotePath: join(args.dailyNotesDirectoryPath, `${args.date}.md`),
      date: args.date,
    })
    expect(warning).toHaveBeenCalledWith(expect.stringContaining(message))
    const paths = getMorningBriefingRunPaths(args)
    expect(JSON.parse(readFileSync(paths.manifestPath, "utf8"))).toMatchObject({
      status: "complete",
      stages: {
        obsidian: { status: "complete" },
        "obsidian-sync": { status: "failed", error: message },
        "t3-presentation": { status: "complete" },
      },
    })
  },
)

test("rewrites the briefing when Obsidian Sync replaces the daily note with an older copy", async () => {
  const args = createRunArgs()
  const notePath = join(args.dailyNotesDirectoryPath, `${args.date}.md`)
  vi.mocked(syncMorningBriefingToObsidian).mockImplementationOnce(async () => {
    writeFileSync(notePath, "")
  })

  const markdown = await runLiveMorningBriefing(args)

  expect(readFileSync(notePath, "utf8")).toBe(markdown)
  expect(syncMorningBriefingToObsidian).toHaveBeenCalledTimes(2)
  const paths = getMorningBriefingRunPaths(args)
  expect(JSON.parse(readFileSync(paths.manifestPath, "utf8"))).toMatchObject({
    stages: { "obsidian-sync": { status: "complete" } },
  })
})

test("adds the recent briefing session review to the carryover artifact", async () => {
  const args = createRunArgs()

  await runLiveMorningBriefing(args)

  const paths = getMorningBriefingRunPaths(args)
  const carryover = readFileSync(paths.carryoverPath, "utf8")
  expect(carryover).toMatch(/^# Carryover checklist/)
  expect(carryover).toContain("## Herb's updates from recent briefing sessions")
})

test("still fails when the daily note cannot be saved", async () => {
  const args = createRunArgs()
  vi.mocked(publishDailyBriefingToNote).mockImplementationOnce(() => {
    throw new Error("disk full")
  })

  await expect(runLiveMorningBriefing(args)).rejects.toThrow("disk full")
  expect(presentMorningBriefingInT3).not.toHaveBeenCalled()
})

/** Keep all run artifacts and notes in an isolated temporary directory. */
function createRunArgs() {
  const root = mkdtempSync(join(tmpdir(), "morning-briefing-sync-"))
  directories.push(root)
  mkdirSync(join(root, "daily"))
  return {
    date: "2026-09-15",
    now: new Date("2026-09-15T05:00:00Z"),
    timeZone: "Europe/Madrid",
    stateDirectoryPath: join(root, "state"),
    dailyNotesDirectoryPath: join(root, "daily"),
  }
}
