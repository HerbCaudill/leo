import type { CaptureRecord } from "../inbox/types.ts"

/** Refuse a journal whose destinations belong to a different Tasks space. */
export function assertCaptureSpace(
  /** The capture journal to check. */
  record: CaptureRecord,
  /** The enrolled space. */
  spaceId: string,
): void {
  for (const target of [record.target, record.candidate])
    if (target && target.spaceId !== spaceId) throw new Error("Capture journal space mismatch")
}
