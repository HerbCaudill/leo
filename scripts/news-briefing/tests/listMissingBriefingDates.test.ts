import { mkdirSync, writeFileSync } from "node:fs"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { listMissingBriefingDates } from "../listMissingBriefingDates.ts"

describe("listMissingBriefingDates", () => {
  test("returns raw dates that do not yet have final briefing JSON", () => {
    const rootDirectoryPath = mkdtempSync(path.join(tmpdir(), "briefings-missing-"))
    const rawDirectoryPath = path.join(rootDirectoryPath, "briefings/raw")
    const briefingDirectoryPath = path.join(rootDirectoryPath, "briefings")

    mkdirSync(rawDirectoryPath, { recursive: true })
    mkdirSync(briefingDirectoryPath, { recursive: true })

    writeFileSync(path.join(rawDirectoryPath, "2026-04-19.json"), "{}")
    writeFileSync(path.join(rawDirectoryPath, "2026-04-20.json"), "{}")
    writeFileSync(path.join(rawDirectoryPath, "2026-04-21-selection.json"), "{}")
    writeFileSync(path.join(briefingDirectoryPath, "2026-04-19.json"), "{}")
    writeFileSync(path.join(briefingDirectoryPath, "index.json"), "[]")

    expect(
      listMissingBriefingDates({
        briefingDirectoryPath,
        rawDirectoryPath,
      }),
    ).toEqual(["2026-04-20"])
  })

  test("returns an empty list when the raw directory does not exist", () => {
    const rootDirectoryPath = mkdtempSync(path.join(tmpdir(), "briefings-missing-"))

    expect(
      listMissingBriefingDates({
        briefingDirectoryPath: path.join(rootDirectoryPath, "briefings"),
        rawDirectoryPath: path.join(rootDirectoryPath, "briefings/raw"),
      }),
    ).toEqual([])
  })
})
