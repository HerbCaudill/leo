import { readFileSync } from "node:fs"
import { join } from "node:path"
import { writeTextAtomically } from "../morning-briefing/atomicWrite.ts"
import { runCodexAgent } from "../morning-briefing/codexAgent.ts"
import {
  BRIEFINGS_REPOSITORY_PATH,
  CODEX_COMMAND_PATH,
  MORNING_BRIEFING_MODEL,
} from "../morning-briefing/constants.ts"
import { loadTasks } from "../tasks/loadTasks.ts"
import { INBOX_STATE_PATH } from "./constants.ts"
import type { Capture, CaptureDraft } from "./types.ts"

/** Read-only bookmark classification against a current task snapshot. */
export async function classifyCapture(capture: Capture, date: string): Promise<CaptureDraft> {
  const snapshotPath = join(INBOX_STATE_PATH, "tasks.json")
  writeTextAtomically(snapshotPath, JSON.stringify(await loadTasks()))
  const outputPath = join(INBOX_STATE_PATH, "agents", `${capture.id}.classification.json`)
  await runCodexAgent({
    codexCommand: CODEX_COMMAND_PATH,
    cwd: BRIEFINGS_REPOSITORY_PATH,
    environment: process.env,
    eventsPath: `${outputPath}.events.jsonl`,
    model: MORNING_BRIEFING_MODEL,
    outputPath,
    schemaPath: join(import.meta.dirname, "schemas/bookmark-classification.schema.json"),
    sandbox: "read-only",
    threadSource: "inbox-classification",
    prompt: `${readFileSync(join(import.meta.dirname, "prompts/classify-bookmark.prompt.md"), "utf8")}\n\nRun context:\n${JSON.stringify({ capture, date, snapshotPath })}`,
  })
  const draft = JSON.parse(readFileSync(outputPath, "utf8")) as CaptureDraft
  if (
    !draft.title?.trim() ||
    typeof draft.question !== "string" ||
    typeof draft.research !== "string" ||
    (draft.duplicate !== null &&
      (!draft.duplicate?.id || !["task", "project"].includes(draft.duplicate.kind))) ||
    !draft.disposition ||
    !["task", "research", "archive"].includes(draft.disposition) ||
    (draft.disposition === "research" && !draft.research.trim())
  )
    throw new Error("Invalid capture classification")
  return draft
}
