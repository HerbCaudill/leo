import { createTasksClient } from "../tasks-client/createTasksClient.ts"
import { targetFromRecord } from "../tasks-client/targetFromRecord.ts"
import { saveDescription } from "../tasks-client/saveDescription.ts"
import type { TasksClient } from "../tasks-client/types.ts"
import type { Capture, CaptureDraft, CaptureTarget } from "./types.ts"

/** Recover the original capture identity and verify the current destination before archiving. */
export async function transferCapture(args: {
  /** Original immutable capture. */
  capture: Capture
  /** Persisted classification. */
  draft: CaptureDraft
  /** Previously acknowledged target. */
  candidate?: CaptureTarget
  /** Whether the original request may have been dispatched. */
  insertionAttempted?: boolean
  /** Save intent and identity before another phase. */
  checkpoint?: (candidate?: CaptureTarget) => void
  /** Injectable board client. */
  client?: TasksClient
}): Promise<CaptureTarget> {
  const client = args.client ?? createTasksClient()
  const target = await findDestination(args, client)
  if (args.capture.source) {
    // Checkpoint duplicates too, before a description write can fail.
    args.checkpoint?.(target)
    const record = await client.get(target.kind, target.id)
    const base = record.description ?? ""
    await saveDescription(
      {
        record,
        text: base.includes(args.capture.source.url)
          ? base
          : [base, `Source: ${args.capture.source.url}`].filter(Boolean).join("\n\n"),
        eventKey: `capture-source:${args.capture.id}`,
      },
      client,
    )
  }
  return target
}

/** Recover an acknowledged destination or perform the original idempotent insertion. */
async function findDestination(
  args: Parameters<typeof transferCapture>[0],
  client: TasksClient,
): Promise<CaptureTarget> {
  if (args.candidate) {
    if (args.candidate.spaceId !== client.spaceId) throw new Error("Capture space mismatch")
    return targetFromRecord(
      await client.get(args.candidate.kind, args.candidate.id),
      client.spaceId,
    )
  }
  if (!args.insertionAttempted) {
    const duplicate = args.draft.duplicate
    if (duplicate) {
      const record = await client.get(duplicate.kind, duplicate.id)
      if (record.status === "done")
        throw new Error("Classified duplicate is already complete; review capture")
      return targetFromRecord(record, client.spaceId)
    }
    const matching = (await client.list("task")).filter(
      task =>
        task.status !== "done" &&
        task.title.trim().replace(/\s+/g, " ").toLowerCase() ===
          args.draft.title.trim().replace(/\s+/g, " ").toLowerCase(),
    )
    if (matching.length > 1) throw new Error("Ambiguous capture title; review duplicates")
    if (matching.length === 1) return targetFromRecord(matching[0]!, client.spaceId)
  }
  const eventKey = `${args.capture.source?.kind ?? "siri"}:${args.capture.id}`
  args.checkpoint?.()
  const result = await client.write("capture", { title: args.draft.title, eventKey }, eventKey)
  const created = result.records?.find(
    record =>
      record.kind === "task" &&
      record.creationKey === `capture:${eventKey}` &&
      result.createdIds?.includes(record.id),
  )
  if (!created) throw new Error("Capture identity was not established")
  args.checkpoint?.(targetFromRecord(created, client.spaceId))
  return targetFromRecord(await client.get("task", created.id), client.spaceId)
}
