import type { CaptureTarget } from "../inbox/types.ts"
import type { BoardRecord } from "./types.ts"

/** Retain the typed destination and space instead of an obsolete list identity. */
export function targetFromRecord(record: BoardRecord, spaceId: string): CaptureTarget {
  if (
    !["task", "project"].includes(record.kind) ||
    !record.id ||
    !record.url ||
    record.deleted ||
    record.availability !== "available"
  )
    throw new Error("Invalid Tasks destination")
  return {
    kind: record.kind as "task" | "project",
    spaceId,
    id: record.id,
    title: record.title,
    url: record.url,
  }
}
