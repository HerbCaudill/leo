import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { Effect, Layer } from "effect"
import { describe, expect, test } from "vitest"
import { synthesizeBriefing, synthesizeBriefingEffect } from "../synthesizeBriefing.ts"
import {
  ClockService,
  FileSystemService,
  HttpService,
  LoggingService,
  PiService,
} from "../runtimeServices.ts"

describe("synthesizeBriefing", () => {
  test("rejects malformed raw briefing files with a schema error", async () => {
    const rootDirectoryPath = mkdtempSync(path.join(tmpdir(), "briefings-synthesize-"))
    const rawDirectoryPath = path.join(rootDirectoryPath, "briefings/raw")
    const briefingDirectoryPath = path.join(rootDirectoryPath, "briefings")

    mkdirSync(rawDirectoryPath, { recursive: true })
    writeFileSync(
      path.join(rawDirectoryPath, "2026-04-20.json"),
      JSON.stringify({ articles: [{ headline: "Missing required fields" }], date: "2026-04-20" }),
    )

    await expect(
      synthesizeBriefing({
        briefingDirectoryPath,
        date: "2026-04-20",
        fetchPageHtml: async () => "",
        rawDirectoryPath,
        runPi: async () => JSON.stringify({ stories: [] }),
      }),
    ).rejects.toThrow("Invalid raw briefing JSON")
  })

  test("rejects malformed pi selection output with a schema error", async () => {
    const rootDirectoryPath = mkdtempSync(path.join(tmpdir(), "briefings-synthesize-"))
    const rawDirectoryPath = path.join(rootDirectoryPath, "briefings/raw")
    const briefingDirectoryPath = path.join(rootDirectoryPath, "briefings")

    mkdirSync(rawDirectoryPath, { recursive: true })
    writeFileSync(
      path.join(rawDirectoryPath, "2026-04-20.json"),
      JSON.stringify({ articles: [], date: "2026-04-20" }),
    )

    await expect(
      synthesizeBriefing({
        briefingDirectoryPath,
        date: "2026-04-20",
        fetchPageHtml: async () => "",
        rawDirectoryPath,
        runPi: async () =>
          JSON.stringify({ stories: [{ headline: "Bad section", section: "Sports" }] }),
      }),
    ).rejects.toThrow("Invalid pi selection JSON")
  })

  test("rejects malformed pi synthesis output with a schema error", async () => {
    const rootDirectoryPath = mkdtempSync(path.join(tmpdir(), "briefings-synthesize-"))
    const rawDirectoryPath = path.join(rootDirectoryPath, "briefings/raw")
    const briefingDirectoryPath = path.join(rootDirectoryPath, "briefings")

    mkdirSync(rawDirectoryPath, { recursive: true })
    writeFileSync(
      path.join(rawDirectoryPath, "2026-04-20.json"),
      JSON.stringify({ articles: [], date: "2026-04-20" }),
    )

    let calls = 0

    await expect(
      synthesizeBriefing({
        briefingDirectoryPath,
        date: "2026-04-20",
        fetchPageHtml: async () => "",
        rawDirectoryPath,
        runPi: async () => {
          calls += 1

          return calls === 1
            ? JSON.stringify({ stories: [] })
            : JSON.stringify({ sections: [{ title: "Sports", stories: [] }] })
        },
      }),
    ).rejects.toThrow("Invalid pi synthesis JSON")
  })

  test("runs the synthesis Effect with injectable services", async () => {
    const rootDirectoryPath = mkdtempSync(path.join(tmpdir(), "briefings-synthesize-effect-"))
    const rawDirectoryPath = path.join(rootDirectoryPath, "briefings/raw")
    const briefingDirectoryPath = path.join(rootDirectoryPath, "briefings")

    mkdirSync(rawDirectoryPath, { recursive: true })
    writeFileSync(
      path.join(rawDirectoryPath, "2026-04-20.json"),
      JSON.stringify({
        articles: [
          {
            headline: "Selected story",
            region: "world",
            source: "Source",
            url: "https://source.example/selected",
          },
        ],
        date: "2026-04-20",
      }),
    )

    const calls: Array<{ prompt: string; rawBriefingPath: string }> = []
    const logMessages: string[] = []
    const timestamps = [0, 1000, 1000, 2500, 2500, 4500]
    const testServices = Layer.mergeAll(
      FileSystemService.Live,
      PiService.LiveFromRunner(async args => {
        calls.push(args)

        return calls.length === 1
          ? JSON.stringify({
              stories: [
                {
                  headline: "Selected story",
                  section: "World",
                  sourceUrls: ["https://source.example/selected"],
                },
              ],
            })
          : JSON.stringify({ sections: [{ title: "World", stories: [] }] })
      }),
      HttpService.LiveFromFetcher(
        async () =>
          `<article><p>Long selected article body fetched by the Effect service.</p></article>`,
      ),
      ClockService.LiveFromNow(() => timestamps.shift() ?? 4500),
      LoggingService.LiveFromLogger(message => logMessages.push(message)),
    )

    const briefingPath = await synthesizeBriefingEffect({
      briefingDirectoryPath,
      date: "2026-04-20",
      rawDirectoryPath,
    }).pipe(Effect.provide(testServices), Effect.runPromise)

    expect(briefingPath).toBe(path.join(briefingDirectoryPath, "2026-04-20.json"))
    expect(calls).toHaveLength(2)
    expect(calls[1].rawBriefingPath).toBe(path.join(rawDirectoryPath, "2026-04-20-selection.json"))
    expect(readFileSync(calls[1].rawBriefingPath, "utf8")).toContain(
      "Long selected article body fetched by the Effect service",
    )
    expect(logMessages).toContain("done (1s)")
    expect(logMessages).toContain("done (2s)")
  })

  test("includes the previous day's headlines in the selection prompt", async () => {
    const rootDirectoryPath = mkdtempSync(path.join(tmpdir(), "briefings-synthesize-previous-"))
    const rawDirectoryPath = path.join(rootDirectoryPath, "briefings/raw")
    const briefingDirectoryPath = path.join(rootDirectoryPath, "briefings")

    mkdirSync(rawDirectoryPath, { recursive: true })
    mkdirSync(briefingDirectoryPath, { recursive: true })

    writeFileSync(
      path.join(rawDirectoryPath, "2026-04-20.json"),
      JSON.stringify({ articles: [], date: "2026-04-20" }),
    )
    writeFileSync(
      path.join(briefingDirectoryPath, "2026-04-19.json"),
      JSON.stringify({
        sections: [
          {
            stories: [{ body: "Body", headline: "Yesterday's top story", sources: [] }],
            title: "World",
          },
        ],
      }),
    )

    const calls: Array<{ prompt: string; rawBriefingPath: string }> = []

    await synthesizeBriefing({
      briefingDirectoryPath,
      date: "2026-04-20",
      fetchPageHtml: async () => "",
      rawDirectoryPath,
      runPi: async args => {
        calls.push(args)

        return calls.length === 1
          ? JSON.stringify({ stories: [] })
          : JSON.stringify({ sections: [] })
      },
    })

    expect(calls[0].prompt).toContain("Yesterday's top story")
    expect(calls[0].prompt).toContain("yesterday's briefing")
  })

  test("selects stories from compact metadata, hydrates them, and writes the final briefing JSON", async () => {
    const rootDirectoryPath = mkdtempSync(path.join(tmpdir(), "briefings-synthesize-"))
    const rawDirectoryPath = path.join(rootDirectoryPath, "briefings/raw")
    const briefingDirectoryPath = path.join(rootDirectoryPath, "briefings")

    mkdirSync(rawDirectoryPath, { recursive: true })
    mkdirSync(briefingDirectoryPath, { recursive: true })

    writeFileSync(
      path.join(rawDirectoryPath, "2026-04-20.json"),
      JSON.stringify(
        {
          articles: [
            {
              headline: "Selected story",
              region: "world",
              source: "Source",
              url: "https://source.example/selected",
            },
            {
              headline: "Omitted story",
              region: "world",
              source: "Source",
              url: "https://source.example/omitted",
            },
          ],
          date: "2026-04-20",
        },
        null,
        2,
      ),
    )

    const calls: Array<{ prompt: string; rawBriefingPath: string }> = []

    const briefingPath = await synthesizeBriefing({
      briefingDirectoryPath,
      date: "2026-04-20",
      fetchPageHtml: async url => {
        if (url === "https://source.example/selected")
          return `<article><p>Long selected article body fetched after selection.</p></article>`

        throw new Error(`Unexpected article fetch: ${url}`)
      },
      rawDirectoryPath,
      runPi: async args => {
        calls.push(args)

        if (calls.length === 1) {
          const selectionInput = JSON.parse(readFileSync(args.rawBriefingPath, "utf8"))
          expect(args.rawBriefingPath).toBe(path.join(rawDirectoryPath, "2026-04-20.json"))
          expect(JSON.stringify(selectionInput)).not.toContain("Long selected article body")
          expect(JSON.stringify(selectionInput)).not.toContain("sightings")

          return JSON.stringify({
            stories: [
              {
                headline: "Selected story",
                section: "World",
                sourceUrls: ["https://source.example/selected"],
              },
            ],
          })
        }

        const hydratedInput = JSON.parse(readFileSync(args.rawBriefingPath, "utf8"))
        expect(JSON.stringify(hydratedInput)).toContain(
          "Long selected article body fetched after selection",
        )
        expect(JSON.stringify(hydratedInput)).not.toContain("https://source.example/omitted")

        return JSON.stringify({ sections: [{ title: "World", stories: [] }] }, null, 2)
      },
    })

    expect(calls).toHaveLength(2)
    expect(calls[0].prompt).toContain("Select the strongest stories")
    expect(calls[1].prompt).toContain("Use the selected hydrated stories")
    expect(calls[1].rawBriefingPath).toBe(path.join(rawDirectoryPath, "2026-04-20-selection.json"))
    expect(briefingPath).toBe(path.join(briefingDirectoryPath, "2026-04-20.json"))
    expect(JSON.parse(readFileSync(briefingPath, "utf8"))).toEqual({
      sections: [{ title: "World", stories: [] }],
    })
  })
})
