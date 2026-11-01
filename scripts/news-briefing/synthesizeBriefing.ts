import { Effect, Layer } from "effect"
import { synthesizeBriefingEffect } from "./synthesizeBriefingEffect.ts"
import {
  ClockService,
  FileSystemService,
  HttpService,
  LoggingService,
  CodexService,
} from "./runtimeServices.ts"
import type { SynthesizeBriefingArgs } from "./types.ts"

export { synthesizeBriefingEffect } from "./synthesizeBriefingEffect.ts"

/** Run codex in selection and synthesis stages, then write the final briefing JSON. */
export async function synthesizeBriefing(
  /** The synthesis-stage configuration and codex runner dependency. */
  args: SynthesizeBriefingArgs,
): Promise<string> {
  const services = Layer.mergeAll(
    FileSystemService.Live,
    CodexService.LiveFromRunner(args.runCodex),
    HttpService.LiveFromFetcher(args.fetchPageHtml),
    ClockService.LiveFromNow(args.now ?? Date.now),
    LoggingService.LiveFromLogger(args.log ?? (() => undefined)),
  )

  return synthesizeBriefingEffect({
    briefingDirectoryPath: args.briefingDirectoryPath,
    date: args.date,
    rawDirectoryPath: args.rawDirectoryPath,
  }).pipe(Effect.provide(services), Effect.runPromise)
}
