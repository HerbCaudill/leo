import { describe, expect, test } from "vitest"
import { makeNewsBriefingRuntime } from "../liveRuntime.ts"
import type { RawBriefing } from "../types.ts"

describe("live runtime wiring", () => {
  test("creates shared CLI args for fetch, synthesize, and full pipeline entrypoints", async () => {
    const events: string[] = []
    const rawBriefing: RawBriefing = { articles: [], date: "2026-04-20" }
    const runtime = makeNewsBriefingRuntime({
      briefingDirectoryPath: "briefings",
      buildRawBriefing: async args => {
        events.push(`build:${args.date}:${args.rawDirectoryPath}:${args.sourceConfigs.length}`)
        return rawBriefing
      },
      clearExistingBriefingFiles: async args => {
        events.push(`clear:${args.date}:${args.briefingDirectoryPath}:${args.rawDirectoryPath}`)
      },
      commitAndPushGeneratedBriefings: async args => {
        events.push(`commit:${args.dates.join(",")}`)
      },
      fetchPageHtml: async url => `<html>${url}</html>`,
      listMissingBriefingDates: args => {
        events.push(`list:${args.briefingDirectoryPath}:${args.rawDirectoryPath}`)
        return ["2026-04-19", "2026-04-20"]
      },
      log: message => events.push(`log:${message}`),
      rawDirectoryPath: "raw",
      runCodex: async args => `codex:${args.rawBriefingPath}:${args.prompt}`,
      sourceConfigs: [
        {
          homepageUrl: "https://source.example",
          key: "source",
          name: "Source",
          region: "world",
        },
      ],
      synthesizeBriefing: async args => {
        events.push(
          `synthesize:${args.date}:${args.briefingDirectoryPath}:${args.rawDirectoryPath}`,
        )
        return `briefings/${args.date}.json`
      },
    })

    const fetchArgs = runtime.createFetchArgs("2026-04-20")
    const synthesizeArgs = runtime.createSynthesizeArgs("2026-04-20")
    const pipelineArgs = runtime.createPipelineArgs("2026-04-20")

    expect(await fetchArgs.fetchPageHtml("https://example.com")).toBe(
      "<html>https://example.com</html>",
    )
    expect(
      await synthesizeArgs.runCodex({ prompt: "Prompt", rawBriefingPath: "raw/file.json" }),
    ).toBe("codex:raw/file.json:Prompt")
    expect(runtime.listSynthesisDates()).toEqual(["2026-04-19", "2026-04-20"])
    expect(runtime.listSynthesisDates("2026-04-18")).toEqual(["2026-04-18"])

    await pipelineArgs.clearExistingBriefingFiles("2026-04-20")
    await pipelineArgs.runFetchStage("2026-04-20")
    await pipelineArgs.runSynthesisStage("2026-04-19")
    pipelineArgs.listMissingBriefingDates()
    await pipelineArgs.commitAndPushGeneratedBriefings(["2026-04-19"])

    expect(events).toEqual([
      "list:briefings:raw",
      "clear:2026-04-20:briefings:raw",
      "build:2026-04-20:raw:1",
      "synthesize:2026-04-19:briefings:raw",
      "list:briefings:raw",
      "commit:2026-04-19",
    ])
  })
})
