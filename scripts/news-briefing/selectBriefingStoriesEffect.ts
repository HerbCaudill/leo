import { Effect } from "effect"
import { getRawBriefingPath, getSelectionBriefingPath } from "./briefingPaths.ts"
import { SELECTION_PROMPT } from "./constants.ts"
import { decodeJsonWithSchema } from "./decodeJsonWithSchema.ts"
import { formatPreviousHeadlinesBlock } from "./formatPreviousHeadlinesBlock.ts"
import { readPreviousBriefingHeadlinesEffect } from "./readPreviousBriefingHeadlinesEffect.ts"
import { FileSystemService, PiService, toError } from "./runtimeServices.ts"
import { BriefingSelectionSchema } from "./schemas.ts"
import type { BriefingSelection } from "./types.ts"

/** Ask pi to select briefing stories and persist the raw selection output. */
export function selectBriefingStoriesEffect(
  /** The directory where final briefings are written. */
  briefingDirectoryPath: string,
  /** The raw briefing directory path. */
  rawDirectoryPath: string,
  /** The briefing date being synthesized. */
  date: string,
): Effect.Effect<BriefingSelection, Error, FileSystemService | PiService> {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystemService
    const pi = yield* PiService
    const rawBriefingPath = getRawBriefingPath(rawDirectoryPath, date)
    const selectionPath = getSelectionBriefingPath(rawDirectoryPath, date)
    const previousHeadlines = yield* readPreviousBriefingHeadlinesEffect(
      briefingDirectoryPath,
      date,
    )
    const previousHeadlinesBlock = formatPreviousHeadlinesBlock(previousHeadlines)
    const selectionPrompt = `${SELECTION_PROMPT}\n\nRaw briefing date: ${date}${previousHeadlinesBlock}`
    const selectionOutput = yield* pi.run({ prompt: selectionPrompt, rawBriefingPath })

    yield* fileSystem.writeText(selectionPath, `${selectionOutput.trim()}\n`)

    const decodedSelection = yield* Effect.try({
      catch: error => toError(error),
      try: () => decodeJsonWithSchema(BriefingSelectionSchema, selectionOutput, "pi selection"),
    })

    return {
      stories: decodedSelection.stories.map(story => ({
        headline: story.headline,
        section: story.section,
        sourceUrls: [...story.sourceUrls],
      })),
    }
  })
}
