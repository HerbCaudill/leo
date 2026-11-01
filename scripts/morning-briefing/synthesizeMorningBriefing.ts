import { join } from "node:path"

import { writeTextAtomically } from "./atomicWrite.ts"
import { runCodexAgent } from "./codexAgent.ts"
import { decodeSynthesisResult } from "./decodeAgentOutput.ts"
import { readMorningBriefingContext } from "./readMorningBriefingContext.ts"
import { readMorningBriefingPrompt } from "./readPromptFile.ts"
import type { MorningBriefingGatherResult, MorningBriefingSynthesisResult } from "./types.ts"
import { validateSynthesizedBriefingMarkdown } from "./validateBriefing.ts"

const MAX_AGENT_ATTEMPTS = 2

/** Persist merged gather results and synthesize one validated canonical briefing. */
export async function synthesizeMorningBriefing(
  /** Gather results, run paths, and Codex settings. */
  args: SynthesizeMorningBriefingArgs,
): Promise<MorningBriefingSynthesisResult> {
  writeTextAtomically(
    args.mergedPath,
    `${JSON.stringify(
      { date: args.date, gatherResults: args.gatherResults, timeZone: args.timeZone },
      null,
      2,
    )}\n`,
  )

  const prompt = `${readMorningBriefingPrompt("synthesis.prompt.md")}

## Standing context

Apply this Herb-maintained guidance when deciding what belongs in the briefing or Tasks Inbox:

${readMorningBriefingContext()}

## Run context

- Local date: ${args.date}
- Local time zone: ${args.timeZone}
- Carryover artifact: ${args.carryoverPath}
- Merged gather artifact: ${args.mergedPath}
`
  let lastError: Error | undefined

  for (let attempt = 1; attempt <= MAX_AGENT_ATTEMPTS; attempt += 1) {
    const outputPath = join(args.synthesisDirectoryPath, `attempt-${attempt}.json`)
    const eventsPath = join(args.synthesisDirectoryPath, `attempt-${attempt}.events.jsonl`)

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
        threadSource: "morning-briefing-synthesis",
      })
      const result = decodeSynthesisResult(outputPath)
      return { ...result, markdown: validateSynthesizedBriefingMarkdown(result.markdown) }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  throw new Error(
    `Morning briefing synthesis failed after ${MAX_AGENT_ATTEMPTS} attempts: ${lastError?.message ?? "Unknown error"}`,
  )
}

type SynthesizeMorningBriefingArgs = {
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
  /** Schema-checked gather results. */
  gatherResults: MorningBriefingGatherResult[]
  /** Combined gather artifact path. */
  mergedPath: string
  /** Required intelligence level from 0 to 100. */
  level: number
  /** Synthesis output JSON Schema path. */
  schemaPath: string
  /** Directory for synthesis attempts and event logs. */
  synthesisDirectoryPath: string
  /** IANA time zone used to interpret the target date. */
  timeZone: string
}
