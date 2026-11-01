/** Original dictated capture with a stable identity for retry recovery. */
export type Capture = {
  /** Hash of the original timestamp and wording. */
  id: string
  /** Original timestamp. */
  timestamp: string
  /** Original text, without surrounding line breaks. */
  raw: string
  /** Bookmark provenance; absent on older journal records. */
  source?: { kind: "x"; url: string }
}

/** Classification only; external actions are performed by the processor. */
export type CaptureDraft = {
  /** Bookmark routing; existing captures always become tasks. */
  disposition?: "task" | "research" | "archive"
  /** Concise action or outcome. */
  title: string
  /** Unresolved question to surface during review. */
  question: string
  /** Research scope, or empty when no research is useful. */
  research: string
  /** An existing incomplete task for the same action, if unambiguous. */
  duplicate: { id: string; kind: "task" | "project" } | null
}

/** Shared journal and verified transfer boundaries for any capture source. */
export type CaptureProcessor = {
  /** Private capture journal directory, also read by the research worker. */
  statePath: string
  /** Local processing date. */
  date: string
  /** Read-only source classifier. */
  classify: (capture: Capture) => Promise<CaptureDraft>
  /** Check the journal's space and verify any existing target. */
  prepareRecord?: (record: CaptureRecord) => Promise<CaptureRecord>
  /** Idempotent transfer with write-ahead checkpoints. */
  transfer: (
    capture: Capture,
    draft: CaptureDraft,
    recovery: {
      /** Previously acknowledged destination. */
      candidate?: CaptureTarget
      /** Whether insertion may already have happened. */
      insertionAttempted?: boolean
      /** Persist the insertion intent or acknowledged destination. */
      checkpoint: (candidate?: CaptureTarget) => void
    },
  ) => Promise<CaptureTarget>
}

/** Verified typed Tasks destination. */
export type CaptureTarget = {
  /** Task identifier. */
  id: string
  /** Object kind, including promoted projects. */
  kind: "task" | "project"
  /** Bound peer space. */
  spaceId: string
  /** Current title. */
  title: string
  /** Link to the task. */
  url: string
}

/** Durable transfer journal, also used as the research queue. */
export type CaptureRecord = {
  /** Journal version; older records have none and are only kept as receipts. */
  version?: 2
  /** Source capture. */
  capture: Capture
  /** Classification saved before creating a task. */
  draft: CaptureDraft
  /** Insertion intent persisted before the remote write. */
  insertionAttempted?: boolean
  /** Returned destination persisted before read-back verification. */
  candidate?: CaptureTarget
  /** Destination recorded only after read-back verification. */
  target?: CaptureTarget
  /** Local processing date for the archive heading. */
  date: string
}
