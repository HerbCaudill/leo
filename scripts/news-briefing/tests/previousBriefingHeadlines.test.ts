import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { Effect } from "effect"
import { describe, expect, test } from "vitest"
import { formatPreviousHeadlinesBlock } from "../formatPreviousHeadlinesBlock.ts"
import { getPreviousDate } from "../getPreviousDate.ts"
import { readPreviousBriefingHeadlinesEffect } from "../readPreviousBriefingHeadlinesEffect.ts"
import { FileSystemService } from "../runtimeServices.ts"

const runWithFileSystem = <A>(effect: Effect.Effect<A, never, FileSystemService>): Promise<A> =>
  effect.pipe(Effect.provide(FileSystemService.Live), Effect.runPromise)

describe("getPreviousDate", () => {
  test("returns the prior calendar day", () => {
    expect(getPreviousDate("2026-04-20")).toBe("2026-04-19")
  })

  test("rolls back across month and year boundaries", () => {
    expect(getPreviousDate("2026-03-01")).toBe("2026-02-28")
    expect(getPreviousDate("2026-01-01")).toBe("2025-12-31")
  })
})

describe("formatPreviousHeadlinesBlock", () => {
  test("returns an empty string when there are no previous headlines", () => {
    expect(formatPreviousHeadlinesBlock([])).toBe("")
  })

  test("lists previous headlines as bullet points", () => {
    const block = formatPreviousHeadlinesBlock(["First headline", "Second headline"])

    expect(block).toContain("yesterday's briefing")
    expect(block).toContain("- First headline")
    expect(block).toContain("- Second headline")
  })
})

describe("readPreviousBriefingHeadlinesEffect", () => {
  test("returns an empty list when the previous briefing is missing", async () => {
    const rootDirectoryPath = mkdtempSync(path.join(tmpdir(), "briefings-previous-"))
    const briefingDirectoryPath = path.join(rootDirectoryPath, "briefings")

    mkdirSync(briefingDirectoryPath, { recursive: true })

    const headlines = await runWithFileSystem(
      readPreviousBriefingHeadlinesEffect(briefingDirectoryPath, "2026-04-20"),
    )

    expect(headlines).toEqual([])
  })

  test("collects headlines across sections from the previous day's briefing", async () => {
    const rootDirectoryPath = mkdtempSync(path.join(tmpdir(), "briefings-previous-"))
    const briefingDirectoryPath = path.join(rootDirectoryPath, "briefings")

    mkdirSync(briefingDirectoryPath, { recursive: true })
    writeFileSync(
      path.join(briefingDirectoryPath, "2026-04-19.json"),
      JSON.stringify({
        sections: [
          {
            stories: [
              { body: "Body", headline: "World headline", sources: [] },
              { body: "Body", headline: "Another world headline", sources: [] },
            ],
            title: "World",
          },
          {
            stories: [{ body: "Body", headline: "US headline", sources: [] }],
            title: "US",
          },
        ],
      }),
    )

    const headlines = await runWithFileSystem(
      readPreviousBriefingHeadlinesEffect(briefingDirectoryPath, "2026-04-20"),
    )

    expect(headlines).toEqual(["World headline", "Another world headline", "US headline"])
  })

  test("returns an empty list when the previous briefing is malformed", async () => {
    const rootDirectoryPath = mkdtempSync(path.join(tmpdir(), "briefings-previous-"))
    const briefingDirectoryPath = path.join(rootDirectoryPath, "briefings")

    mkdirSync(briefingDirectoryPath, { recursive: true })
    writeFileSync(path.join(briefingDirectoryPath, "2026-04-19.json"), "{ not valid json")

    const headlines = await runWithFileSystem(
      readPreviousBriefingHeadlinesEffect(briefingDirectoryPath, "2026-04-20"),
    )

    expect(headlines).toEqual([])
  })
})
