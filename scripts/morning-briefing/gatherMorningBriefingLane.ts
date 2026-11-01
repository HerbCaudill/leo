import { join } from "node:path"

import { writeTextAtomically } from "./atomicWrite.ts"
import { runCodexAgent } from "./codexAgent.ts"
import { decodeGatherResult } from "./decodeAgentOutput.ts"
import { readMorningBriefingContext } from "./readMorningBriefingContext.ts"
import { readMorningBriefingPrompt } from "./readPromptFile.ts"
import type { MorningBriefingGatherResult, MorningBriefingLane } from "./types.ts"

const MAX_AGENT_ATTEMPTS = 2

/** Run one source lane with retry, validation, and an honest fallback artifact. */
export async function gatherMorningBriefingLane(
  /** Lane, run paths, and Codex settings. */
  args: GatherMorningBriefingLaneArgs,
): Promise<MorningBriefingGatherResult> {
  const canonicalResultPath = join(args.gatherDirectoryPath, `${args.lane.key}.json`)
  const prompt = buildGatherPrompt(args)
  let lastError: Error | undefined

  for (let attempt = 1; attempt <= MAX_AGENT_ATTEMPTS; attempt += 1) {
    const outputPath = join(args.gatherDirectoryPath, `${args.lane.key}.attempt-${attempt}.json`)
    const eventsPath = join(
      args.gatherDirectoryPath,
      `${args.lane.key}.attempt-${attempt}.events.jsonl`,
    )

    try {
      await runCodexAgent({
        codexCommand: args.codexCommand,
        cwd: args.cwd,
        environment: args.environment,
        eventsPath,
        level: args.level,
        outputPath,
        prompt,
        schemaPath: args.schemaPath,
        threadSource: `morning-briefing-${args.lane.key}`,
      })
      const result = decodeGatherResult(outputPath)
      validateGatherResult(result, args.lane)
      writeTextAtomically(canonicalResultPath, `${JSON.stringify(result, null, 2)}\n`)
      return result
    } catch (error) {
      lastError = toError(error)
    }
  }

  const failure = createFailureResult(args.lane, lastError)
  writeTextAtomically(canonicalResultPath, `${JSON.stringify(failure, null, 2)}\n`)
  return failure
}

/** Add run-specific paths to the versioned gather prompts. */
function buildGatherPrompt(args: GatherMorningBriefingLaneArgs): string {
  return `${readMorningBriefingPrompt("gather-common.prompt.md")}

${readMorningBriefingPrompt(args.lane.promptFileName)}

## Standing context

Apply this Herb-maintained guidance when deciding what needs his attention:

${readMorningBriefingContext()}

## Run context

- Local date: ${args.date}
- Local time zone: ${args.timeZone}
- Carryover artifact: ${args.carryoverPath}
${args.localMessagesPath ? `- Local messages artifact: ${args.localMessagesPath}\n` : ""}`
}

/** Require every assigned source exactly once and reject cross-lane output. */
function validateGatherResult(
  result: MorningBriefingGatherResult,
  lane: MorningBriefingLane,
): void {
  if (result.lane !== lane.key)
    throw new Error(`Expected lane ${lane.key}, received ${result.lane || "an empty lane"}`)

  const returnedSources = result.coverage.map(item => item.source)
  if (
    returnedSources.length !== lane.sources.length ||
    lane.sources.some((source, index) => returnedSources[index] !== source)
  ) {
    throw new Error(`Lane ${lane.key} returned an incomplete or reordered coverage list`)
  }
}

/** Build a valid artifact when the whole lane process failed twice. */
function createFailureResult(
  lane: MorningBriefingLane,
  error: Error | undefined,
): MorningBriefingGatherResult {
  const detail = `Lane process failed after ${MAX_AGENT_ATTEMPTS} attempts: ${compactError(error)}`
  return {
    coverage: lane.sources.map(source => ({ detail, source, status: "incomplete" })),
    lane: lane.key,
    report: "No source findings were available from this lane.",
  }
}

/** Keep manifest and coverage errors compact. */
function compactError(error: Error | undefined): string {
  return (error?.message ?? "Unknown error").replaceAll(/\s+/g, " ").slice(0, 500)
}

/** Convert an unknown caught value to Error. */
function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

type GatherMorningBriefingLaneArgs = {
  /** Carryover artifact path. */
  carryoverPath: string
  /** Codex executable path. */
  codexCommand: string
  /** Working repository path. */
  cwd: string
  /** Target local date. */
  date: string
  /** Environment inherited by Codex. */
  environment: NodeJS.ProcessEnv
  /** Signal and Apple Messages transcripts, for lanes that review them. */
  localMessagesPath?: string
  /** Per-lane artifact directory. */
  gatherDirectoryPath: string
  /** Source lane to gather. */
  lane: MorningBriefingLane
  /** Required intelligence level from 0 to 100. */
  level: number
  /** Gather output JSON Schema path. */
  schemaPath: string
  /** IANA time zone used to interpret the target date. */
  timeZone: string
}
