import { Effect } from "effect"
import { hydrateBriefingSelectionEffect } from "./hydrateBriefingSelectionEffect.ts"
import { logBlankLineEffect } from "./logBlankLineEffect.ts"
import { logMessageEffect } from "./logMessageEffect.ts"
import { readRawBriefingEffect } from "./readRawBriefingEffect.ts"
import { runTimedEffect } from "./runTimedEffect.ts"
import { selectBriefingStoriesEffect } from "./selectBriefingStoriesEffect.ts"
import {
  ClockService,
  FileSystemService,
  HttpService,
  LoggingService,
  CodexService,
} from "./runtimeServices.ts"
import { writeSynthesizedBriefingEffect } from "./writeSynthesizedBriefingEffect.ts"

/** Run selection, source hydration, and final synthesis as composable Effects. */
export function synthesizeBriefingEffect(
  /** The synthesis-stage paths and date. */
  args: SynthesizeBriefingEffectArgs,
): Effect.Effect<
  string,
  Error,
  FileSystemService | CodexService | HttpService | ClockService | LoggingService
> {
  return Effect.gen(function* () {
    const rawBriefing = yield* readRawBriefingEffect(args.rawDirectoryPath, args.date)

    yield* logMessageEffect("Selecting stories...")
    const selection = yield* runTimedEffect(
      selectBriefingStoriesEffect(args.briefingDirectoryPath, args.rawDirectoryPath, args.date),
    )
    yield* logBlankLineEffect()

    yield* logMessageEffect("Fetching sources...")
    yield* logBlankLineEffect()
    yield* runTimedEffect(
      hydrateBriefingSelectionEffect(args.rawDirectoryPath, rawBriefing, selection),
    )
    yield* logBlankLineEffect()

    yield* logMessageEffect("Writing briefing...")
    const briefingPath = yield* runTimedEffect(
      writeSynthesizedBriefingEffect(args.briefingDirectoryPath, args.rawDirectoryPath, args.date),
    )
    yield* logBlankLineEffect()

    return briefingPath
  })
}

/** Paths and date needed to synthesize one briefing. */
export type SynthesizeBriefingEffectArgs = {
  /** The directory where final briefings are written. */
  briefingDirectoryPath: string
  /** The briefing date to synthesize. */
  date: string
  /** The directory containing raw briefing files. */
  rawDirectoryPath: string
}
