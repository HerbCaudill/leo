import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { createTasksClient } from "../tasks-client/createTasksClient.ts"
import { saveDescription } from "../tasks-client/saveDescription.ts"
import { journalFileName } from "../tasks-client/journalFileName.ts"
import type { BoardRecord, TasksClient } from "../tasks-client/types.ts"
import { writeTextAtomically } from "./atomicWrite.ts"
import type {
  CreatedMorningBriefingTask,
  MorningBriefingTaskDraft,
  MorningBriefingTaskOutcome,
} from "./types.ts"

/**
 * Capture deduplicated briefing actions with durable intentions for every publication phase.
 * The first Tasks failure defers the remaining drafts, so an unavailable board never blocks the briefing.
 */
export async function createInboxTasks(args: {
  /** Proposed actions from synthesis. */
  tasks: readonly MorningBriefingTaskDraft[]
  /** Stable local briefing date, also retained on reruns. */
  date?: string
  /** Optional isolated client. */
  client?: TasksClient
  /** Optional private test directory. */
  statePath?: string
}): Promise<MorningBriefingTaskOutcome> {
  if (!args.tasks.length) return { created: [], deferred: [] }
  const client = args.client ?? createTasksClient()
  const statePath = args.statePath ?? join(homedir(), ".local/state/tasks-client/captures")
  if (!args.date) throw new Error("Briefing date is required for stable capture identity")
  const created: CreatedMorningBriefingTask[] = []
  let titles: Set<string>
  try {
    const existing = [...(await client.list("task")), ...(await client.list("project"))]
    titles = new Set(existing.map(task => normalizeTitle(task.title)))
  } catch (error) {
    return { created, deferred: args.tasks, error: errorMessage(error) }
  }
  const seen = new Set<string>()
  for (const [index, draft] of args.tasks.entries()) {
    try {
      await createTask(draft)
    } catch (error) {
      return { created, deferred: args.tasks.slice(index), error: errorMessage(error) }
    }
  }
  return { created, deferred: [] }

  /** Capture one draft, resuming its journal; skip duplicates. */
  async function createTask(draft: MorningBriefingTaskDraft): Promise<void> {
    const title = normalizeTitle(draft.title)
    if (!title || seen.has(title)) return
    seen.add(title)
    const eventKey = `briefing:${args.date}:${createHash("sha256").update(title).digest("hex")}`
    const path = join(statePath, journalFileName(eventKey))
    if (!existsSync(path) && titles.has(title)) return
    const intent: {
      spaceId: string
      draft: MorningBriefingTaskDraft
      record?: BoardRecord
      saved: boolean
    } = existsSync(path)
      ? JSON.parse(readFileSync(path, "utf8"))
      : { spaceId: client.spaceId, draft: { ...draft, title: draft.title.trim() }, saved: false }
    if (intent.spaceId !== client.spaceId) throw new Error("Briefing capture space mismatch")
    writeTextAtomically(path, JSON.stringify(intent))
    if (!intent.record) {
      const result = await client.write(
        "capture",
        { title: intent.draft.title, eventKey },
        eventKey,
      )
      intent.record = result.records?.find(
        record =>
          record.creationKey === `capture:${eventKey}` && result.createdIds?.includes(record.id),
      )
      if (!intent.record) throw new Error("Briefing capture identity was not established")
      writeTextAtomically(path, JSON.stringify(intent))
    }
    if (!intent.saved && intent.draft.notes)
      await saveDescription(
        {
          record: intent.record,
          text: intent.draft.notes,
          eventKey,
          statePath: join(statePath, "descriptions"),
        },
        client,
      )
    const current = await client.get("task", intent.record.id)
    intent.saved = true
    writeTextAtomically(path, JSON.stringify(intent))
    created.push({ ...intent.draft, title: current.title, url: current.url })
    titles.add(title)
  }
}

/** Compact a failure for the briefing. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Conservative exact-title comparison across open and completed records. */
function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US")
}
