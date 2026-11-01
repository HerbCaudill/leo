/** A board object returned by the managed peer. */
export type BoardRecord = {
  /** Stable object kind. */
  kind: "task" | "project" | "tag" | "bin"
  /** Stable ECHO identifier. */
  id: string
  /** Display title. */
  title: string
  /** Full current description. */
  description?: string
  /** Task or project lifecycle. */
  status?: string
  /** Explicit tag attached to a task. */
  tagId?: string | null
  /** Tag inherited from a project when no explicit tag is set. */
  effectiveTag?: { id: string; name: string } | null
  /** Source identity retained through import and promotion. */
  sourceId?: string | null
  /** Creation receipt identity. */
  creationKey?: string | null
  /** Explicit promotion destination retained on a task tombstone. */
  promotedToProjectId?: string | null
  /** Whether this is a tombstone. */
  deleted?: boolean
  /** Reference availability. */
  availability?: string
  /** Canonical application URL. */
  url: string
}

/** Managed CLI envelope. */
export type TasksResponse = {
  /** Protocol outcome. */
  status: string
  /** Current serving context. */
  metadata?: { spaceId: string; timezone: string; observedAt: string }
  /** Contract read or write result. */
  result?: {
    status?: string
    items?: BoardRecord[]
    continuation?: string | null
    resolution?: string
    records?: BoardRecord[]
    createdIds?: string[]
    affectedIds?: string[]
  }
}

/** Injectable transport; writes always include their original request identity. */
export type TasksRunner = (
  command: string,
  input: Record<string, unknown>,
  requestId?: string,
) => Promise<TasksResponse>

/** Board client interface shared by the workflows. */
export type TasksClient = {
  /** Explicit enrolled space. */
  spaceId: string
  /** Enumerate every page of a record kind. */
  list: (kind: BoardRecord["kind"]) => Promise<BoardRecord[]>
  /** Get a current exact target. */
  get: (kind: "task" | "project", id: string) => Promise<BoardRecord>
  /** Send a durable write with immutable identity. */
  write: (
    command: string,
    input: Record<string, unknown>,
    requestId: string,
  ) => Promise<NonNullable<TasksResponse["result"]>>
}
