import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs"
import { isAbsolute, join, relative, resolve } from "node:path"
import { writeTextAtomically } from "../morning-briefing/atomicWrite.ts"
import { runCodexAgent } from "../morning-briefing/codexAgent.ts"
import {
  BRIEFINGS_REPOSITORY_PATH,
  CODEX_COMMAND_PATH,
  MORNING_BRIEFING_MODEL,
} from "../morning-briefing/constants.ts"
import { acquireMorningBriefingRunLock } from "../morning-briefing/runLock.ts"
import { INBOX_STATE_PATH, VAULT_PATH } from "./constants.ts"
import { createTasksClient } from "../tasks-client/createTasksClient.ts"
import { assertCaptureSpace } from "../tasks-client/assertCaptureSpace.ts"
import { publishResearch } from "./publishResearch.ts"
import type { CaptureRecord } from "./types.ts"

/** Finish queued research independently of capture intake, one canonical note at a time. */
export async function researchQueue(): Promise<void> {
  mkdirSync(INBOX_STATE_PATH, { recursive: true, mode: 0o700 })
  let release: () => void
  try {
    release = acquireMorningBriefingRunLock(join(INBOX_STATE_PATH, "research.lock"))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return
    throw error
  }
  try {
    const capturesPath = join(INBOX_STATE_PATH, "captures")
    if (!existsSync(capturesPath)) return
    const failures: unknown[] = []
    for (const file of readdirSync(capturesPath)
      .filter(file => file.endsWith(".json"))
      .sort()) {
      const record = JSON.parse(readFileSync(join(capturesPath, file), "utf8")) as CaptureRecord
      const resultPath = join(INBOX_STATE_PATH, "research", `${record.capture.id}.json`)
      const donePath = `${resultPath}.done`
      const noteOnly =
        record.capture.source?.kind === "x" && record.draft.disposition === "research"
      if ((!record.target && !noteOnly) || !record.draft.research || existsSync(donePath)) continue
      try {
        if (!noteOnly) assertCaptureSpace(record, createTasksClient().spaceId)
        const current = noteOnly ? undefined : await findTask(record)
        if (current?.status === "done") {
          writeTextAtomically(donePath, "Task already completed.\n")
          continue
        }
        if (!existsSync(resultPath)) {
          console.log(`[inbox-research] Researching: ${current?.title ?? record.draft.title}`)
          const pendingPath = `${resultPath}.pending`
          await runCodexAgent({
            codexCommand: CODEX_COMMAND_PATH,
            cwd: BRIEFINGS_REPOSITORY_PATH,
            environment: { ...process.env, CODEX_INTERNAL_ORIGINATOR_OVERRIDE: "Codex Desktop" },
            eventsPath: `${resultPath}.events.jsonl`,
            model: MORNING_BRIEFING_MODEL,
            outputPath: pendingPath,
            schemaPath: join(import.meta.dirname, "schemas/research.schema.json"),
            persistent: true,
            threadSource: `inbox-research:${record.capture.id}`,
            timeoutMs: null,
            prompt: `${readFileSync(join(import.meta.dirname, noteOnly ? "prompts/research-bookmark.prompt.md" : "prompts/research.prompt.md"), "utf8")}\n\nRun context:\n${JSON.stringify({ capture: record.capture, research: record.draft.research, task: current, taskUrl: record.target?.url, vaultPath: VAULT_PATH })}`,
          })
          const validated = readResearchResult(pendingPath)
          if (noteOnly && !validated.notePath)
            throw new Error("Bookmark research needs a verified note; leaving queued for retry")
          writeTextAtomically(resultPath, JSON.stringify(validated))
        }
        const result = readResearchResult(resultPath)
        if (noteOnly) {
          if (!result.notePath)
            throw new Error("Bookmark research needs a verified note; leaving queued for retry")
          writeTextAtomically(donePath, `${new Date().toISOString()}\n`)
          console.log(`[inbox-research] Saved: ${result.notePath}`)
          continue
        }
        // Reload after research: the human may have moved, edited, or completed the task.
        const latest = await findTask(record)
        if (latest.status === "done") {
          writeTextAtomically(donePath, "Research saved; task completed during research.\n")
          continue
        }
        await publishResearch(
          latest,
          result.notePath,
          result.nextSteps,
          createTasksClient(),
          `research:${record.capture.id}`,
        )
        writeTextAtomically(donePath, `${new Date().toISOString()}\n`)
        console.log(`[inbox-research] Ready for review: ${latest.title}`)
      } catch (error) {
        failures.push(error)
        console.error(
          `[inbox-research] ${record.target?.title ?? record.draft.title}: ${String(error)}`,
        )
      }
    }
    if (failures.length) throw new Error(`${failures.length} research item(s) need retry; see log`)
  } finally {
    release()
  }
}

/** Read the typed target; missing or deleted targets remain actionable failures. */
async function findTask(record: CaptureRecord) {
  return createTasksClient().get(record.target!.kind, record.target!.id)
}

/** Validate the result and confirm any promised note is inside the vault and nonempty. */
function readResearchResult(path: string): ResearchResult {
  const result = JSON.parse(readFileSync(path, "utf8")) as ResearchResult
  if (
    typeof result.notePath !== "string" ||
    !Array.isArray(result.nextSteps) ||
    result.nextSteps.some(step => typeof step !== "string" || !step.trim() || step.length > 1024) ||
    typeof result.question !== "string"
  )
    throw new Error("Invalid research result")
  if (result.notePath) {
    const notePath = resolve(VAULT_PATH, result.notePath)
    if (
      isAbsolute(result.notePath) ||
      relative(VAULT_PATH, notePath).startsWith("..") ||
      !notePath.endsWith(".md") ||
      !readFileSync(notePath, "utf8").trim()
    )
      throw new Error("Research context note verification failed")
  } else if (!result.question.trim())
    throw new Error("Research returned neither a note nor a blocker")
  return result
}

type ResearchResult = {
  /** Vault-relative durable note. */
  notePath: string
  /** Concrete execution steps, in order. */
  nextSteps: string[]
  /** Missing information or decision. */
  question: string
}
