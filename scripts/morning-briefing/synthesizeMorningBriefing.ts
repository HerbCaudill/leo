import { readFileSync } from "node:fs"
import { join } from "node:path"

import { writeTextAtomically } from "./atomicWrite.ts"
import { decodeSynthesisResult } from "./decodeAgentOutput.ts"
import { readMorningBriefingContext } from "./readMorningBriefingContext.ts"
import { readMorningBriefingPrompt } from "./readPromptFile.ts"
import { runLlmRole, type LlmRoleRequest } from "./runLlmRole.ts"
import type { MorningBriefingGatherResult, MorningBriefingSynthesisResult } from "./types.ts"
import { isWeekendDate } from "./date.ts"
import { validateSynthesizedBriefingMarkdown } from "./validateBriefing.ts"

const MAX_AGENT_ATTEMPTS = 2

/** Persist merged gather results and synthesize one validated canonical briefing. */
export async function synthesizeMorningBriefing(
  /** Gather results, run paths, and the model role. */
  args: SynthesizeMorningBriefingArgs,
): Promise<MorningBriefingSynthesisResult> {
  const merged = `${JSON.stringify(
    { date: args.date, gatherResults: args.gatherResults, timeZone: args.timeZone },
    null,
    2,
  )}\n`
  writeTextAtomically(args.mergedPath, merged)
  const runRole = args.runRole ?? runLlmRole

  const prompt = `${readMorningBriefingPrompt("synthesis.prompt.md")}

## Standing context

Apply this Herb-maintained guidance when deciding what belongs in the briefing or Tasks Inbox:

${readMorningBriefingContext()}

## Run context

- Local date: ${args.date}
- Proposed standup: ${isWeekendDate(args.date) ? "omit (weekend)" : "include"}
- Local time zone: ${args.timeZone}

## Carryover artifact

<carryover>
${readFileSync(args.carryoverPath, "utf8")}
</carryover>

## Merged gather artifact

<merged>
${merged}</merged>
`
  let lastError: Error | undefined

  for (let attempt = 1; attempt <= MAX_AGENT_ATTEMPTS; attempt += 1) {
    const outputPath = join(args.synthesisDirectoryPath, `attempt-${attempt}.json`)

    try {
      writeTextAtomically(
        outputPath,
        await runRole({ prompt, role: args.role, schemaPath: args.schemaPath }),
      )
      const result = decodeSynthesisResult(outputPath)
      return {
        ...result,
        markdown: validateSynthesizedBriefingMarkdown(result.markdown, args.date),
      }
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
  /** Target local date. */
  date: string
  /** Schema-checked gather results. */
  gatherResults: MorningBriefingGatherResult[]
  /** Combined gather artifact path. */
  mergedPath: string
  /** Model role from the roles table in the global AGENTS.md. */
  role: string
  /** Run the role; tests replace the `llm` CLI here. */
  runRole?: (request: LlmRoleRequest) => Promise<string>
  /** Synthesis output JSON Schema path. */
  schemaPath: string
  /** Directory for synthesis attempts and event logs. */
  synthesisDirectoryPath: string
  /** IANA time zone used to interpret the target date. */
  timeZone: string
}
