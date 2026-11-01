import path from "node:path"
import { describe, expect, test } from "vitest"
import {
  getBriefingDateFromFileName,
  getFinalBriefingPath,
  getGeneratedBriefingGitPaths,
  getRawBriefingPath,
  getSelectionBriefingPath,
  isDatedBriefingJsonFileName,
} from "../briefingPaths.ts"

describe("briefingPaths", () => {
  test("builds the raw, selection, and final briefing file paths for a date", () => {
    expect(getRawBriefingPath("briefings/raw", "2026-04-20")).toBe(
      path.join("briefings/raw", "2026-04-20.json"),
    )
    expect(getSelectionBriefingPath("briefings/raw", "2026-04-20")).toBe(
      path.join("briefings/raw", "2026-04-20-selection.json"),
    )
    expect(getFinalBriefingPath("briefings", "2026-04-20")).toBe(
      path.join("briefings", "2026-04-20.json"),
    )
  })

  test("builds generated briefing git paths for each date", () => {
    expect(getGeneratedBriefingGitPaths(["2026-04-18", "2026-04-20"])).toEqual([
      "briefings/2026-04-18.json",
      "briefings/raw/2026-04-18.json",
      "briefings/raw/2026-04-18-selection.json",
      "briefings/2026-04-20.json",
      "briefings/raw/2026-04-20.json",
      "briefings/raw/2026-04-20-selection.json",
    ])
  })

  test("recognizes dated briefing JSON file names and extracts their dates", () => {
    expect(isDatedBriefingJsonFileName("2026-04-20.json")).toBe(true)
    expect(isDatedBriefingJsonFileName("2026-04-20-selection.json")).toBe(false)
    expect(isDatedBriefingJsonFileName("index.json")).toBe(false)

    expect(getBriefingDateFromFileName("2026-04-20.json")).toBe("2026-04-20")
  })
})
