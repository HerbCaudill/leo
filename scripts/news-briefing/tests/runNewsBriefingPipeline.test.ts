import { Effect, Layer } from "effect"
import { describe, expect, test } from "vitest"
import {
  PipelineStageService,
  runNewsBriefingPipeline,
  runNewsBriefingPipelineEffect,
} from "../runNewsBriefingPipeline.ts"
import { ClockService, LoggingService } from "../runtimeServices.ts"

describe("runNewsBriefingPipeline", () => {
  test("runs the top-level pipeline as an Effect with injectable stage services", async () => {
    const events: string[] = []
    const messages: string[] = []
    const times = [0, 0, 1000, 1000, 3000, 7000]
    const services = Layer.mergeAll(
      PipelineStageService.LiveFromRunners({
        clearExistingBriefingFiles: date =>
          Effect.sync(() => {
            events.push(`clear:${date}`)
          }),
        commitAndPushGeneratedBriefings: dates =>
          Effect.sync(() => {
            events.push(`commit:${dates.join(",")}`)
          }),
        listMissingBriefingDates: Effect.succeed(["2026-04-18", "2026-04-20"]),
        runFetchStage: date =>
          Effect.sync(() => {
            events.push(`fetch:${date}`)

            return { articles: [], date }
          }),
        runSynthesisStage: date =>
          Effect.sync(() => {
            events.push(`synthesize:${date}`)

            return `briefings/${date}.json`
          }),
      }),
      ClockService.LiveFromNow(() => times.shift() ?? 7000),
      LoggingService.LiveFromLogger(message => messages.push(message)),
    )

    await runNewsBriefingPipelineEffect({ date: "2026-04-20" }).pipe(
      Effect.provide(services),
      Effect.runPromise,
    )

    expect(events).toEqual([
      "clear:2026-04-20",
      "fetch:2026-04-20",
      "synthesize:2026-04-18",
      "synthesize:2026-04-20",
      "commit:2026-04-18,2026-04-20",
    ])
    expect(messages).toContain("Briefing complete (7s)")
  })

  test("clears the requested date, fetches it, synthesizes every missing briefing date, and commits generated files", async () => {
    const events: string[] = []

    await runNewsBriefingPipeline({
      clearExistingBriefingFiles: async date => {
        events.push(`clear:${date}`)
      },
      commitAndPushGeneratedBriefings: async dates => {
        events.push(`commit:${dates.join(",")}`)
      },
      date: "2026-04-20",
      listMissingBriefingDates: () => ["2026-04-18", "2026-04-20"],
      runFetchStage: async date => {
        events.push(`fetch:${date}`)
        return { articles: [], date }
      },
      runSynthesisStage: async date => {
        events.push(`synthesize:${date}`)
        return `briefings/${date}.json`
      },
    })

    expect(events).toEqual([
      "clear:2026-04-20",
      "fetch:2026-04-20",
      "synthesize:2026-04-18",
      "synthesize:2026-04-20",
      "commit:2026-04-18,2026-04-20",
    ])
  })

  test("logs concise timed stages around the pipeline", async () => {
    const messages: string[] = []
    const times = [0, 0, 1000, 1000, 3000, 7000]

    await runNewsBriefingPipeline({
      clearExistingBriefingFiles: async () => {},
      commitAndPushGeneratedBriefings: async () => {},
      date: "2026-04-20",
      listMissingBriefingDates: () => ["2026-04-20"],
      log: message => messages.push(message),
      now: () => times.shift() ?? 7000,
      runFetchStage: async date => ({
        articles: [
          {
            headline: "Story",
            region: "world",
            source: "Source",
            url: "https://source.example/story",
          },
        ],
        date,
      }),
      runSynthesisStage: async () => "briefings/2026-04-20.json",
    })

    expect(messages).toEqual([
      "Clearing existing briefing files for 2026-04-20...",
      "done (1s)",
      "",
      "Fetching candidates...",
      "",
      "-------------------------",
      "   Total candidates               1",
      "",
      "done (2s)",
      "",
      "Briefing complete (7s)",
    ])
  })
})
