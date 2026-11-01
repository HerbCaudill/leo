import { Effect } from "effect"
import { getFinalBriefingPath, getSelectionBriefingPath } from "./briefingPaths.ts"
import { SYNTHESIS_PROMPT } from "./constants.ts"
import { decodeJsonWithSchema } from "./decodeJsonWithSchema.ts"
import { FileSystemService, CodexService, toError } from "./runtimeServices.ts"
import { FinalBriefingSchema } from "./schemas.ts"

/** Ask codex to synthesize the hydrated selection and write the final briefing file. */
export function writeSynthesizedBriefingEffect(
  /** The final briefing directory path. */
  briefingDirectoryPath: string,
  /** The raw briefing directory path. */
  rawDirectoryPath: string,
  /** The briefing date being synthesized. */
  date: string,
): Effect.Effect<string, Error, FileSystemService | CodexService> {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystemService
    const codex = yield* CodexService
    const selectionPath = getSelectionBriefingPath(rawDirectoryPath, date)
    const briefingPath = getFinalBriefingPath(briefingDirectoryPath, date)
    const synthesisPrompt = `${SYNTHESIS_PROMPT}\n\nRaw briefing date: ${date}`
    const synthesis = yield* codex.run({ prompt: synthesisPrompt, rawBriefingPath: selectionPath })
    const finalBriefing = yield* Effect.try({
      catch: error => toError(error),
      try: () => decodeJsonWithSchema(FinalBriefingSchema, synthesis, "codex synthesis"),
    })

    yield* fileSystem.makeDirectory(briefingDirectoryPath)
    yield* fileSystem.writeText(briefingPath, `${JSON.stringify(finalBriefing, null, 2)}\n`)

    return briefingPath
  })
}
