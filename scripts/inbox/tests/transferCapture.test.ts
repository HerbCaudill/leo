import { expect, test, vi } from "vitest"
import { transferCapture } from "../transferCapture.ts"
import type { TasksClient } from "../../tasks/types.ts"
import { saveDescription } from "../../tasks/saveDescription.ts"

vi.mock("../../tasks/saveDescription.ts", () => ({ saveDescription: vi.fn() }))

vi.mock("../runGoogleTasks.ts", () => ({
  runGoogleTasks: vi.fn().mockRejectedValue(new Error("Legacy provider invoked")),
}))

const capture = { id: "hash", timestamp: "2026-09-30T10:00:00Z", raw: "Call plumber" }
const draft = { title: "Call plumber", question: "", research: "", duplicate: null }
const record = {
  kind: "task" as const,
  id: "new",
  title: "Call plumber",
  url: "https://tasks/?task=new",
  availability: "available",
  creationKey: "capture:siri:hash",
}

test("reuses the same creation request after a lost reply and keeps later human edits", async () => {
  const client = {
    spaceId: "space",
    list: vi.fn().mockResolvedValue([]),
    write: vi
      .fn()
      .mockRejectedValueOnce(new Error("lost reply"))
      .mockResolvedValue({ createdIds: ["new"], records: [record] }),
    get: vi.fn().mockResolvedValue({ ...record, title: "Call our plumber" }),
  } as unknown as TasksClient
  await expect(transferCapture({ capture, draft, client })).rejects.toThrow("lost reply")
  expect(await transferCapture({ capture, draft, client, insertionAttempted: true })).toMatchObject(
    { id: "new", kind: "task", spaceId: "space", title: "Call our plumber" },
  )
  expect(vi.mocked(client.write).mock.calls[0]).toEqual(vi.mocked(client.write).mock.calls[1])
})

test("does not replace an unavailable journaled target with a matching title", async () => {
  const client = {
    spaceId: "space",
    get: vi.fn().mockRejectedValue(new Error("deleted")),
    list: vi.fn(),
    write: vi.fn(),
  } as unknown as TasksClient
  await expect(
    transferCapture({
      capture,
      draft,
      client,
      candidate: { kind: "task", spaceId: "space", id: "old", title: "Call plumber", url: "url" },
    }),
  ).rejects.toThrow("deleted")
  expect(client.write).not.toHaveBeenCalled()
})

test("retains a bookmark source link on an existing duplicate and propagates publication failures", async () => {
  const client = {
    spaceId: "space",
    get: vi.fn().mockResolvedValue({ ...record, description: "Human context" }),
    list: vi.fn(),
    write: vi.fn(),
  } as unknown as TasksClient
  const bookmark = {
    ...capture,
    id: "x-123",
    source: { kind: "x" as const, url: "https://x.com/i/status/123" },
  }
  const classification = { ...draft, duplicate: { kind: "task" as const, id: "new" } }
  vi.mocked(saveDescription).mockRejectedValueOnce(new Error("description unavailable"))
  await expect(
    transferCapture({ capture: bookmark, draft: classification, client }),
  ).rejects.toThrow("description unavailable")
  await transferCapture({ capture: bookmark, draft: classification, client })
  expect(saveDescription).toHaveBeenLastCalledWith(
    expect.objectContaining({
      text: "Human context\n\nSource: https://x.com/i/status/123",
      eventKey: "capture-source:x-123",
    }),
    client,
  )
  expect(client.write).not.toHaveBeenCalled()
})

test("uses an X event key and reuses acknowledged targets on retries", async () => {
  const client = {
    spaceId: "space",
    list: vi.fn().mockResolvedValue([]),
    write: vi.fn().mockResolvedValue({
      createdIds: ["new"],
      records: [{ ...record, creationKey: "capture:x:x-123" }],
    }),
    get: vi.fn().mockResolvedValue(record),
  } as unknown as TasksClient
  const bookmark = {
    ...capture,
    id: "x-123",
    source: { kind: "x" as const, url: "https://x.com/i/status/123" },
  }
  const target = await transferCapture({ capture: bookmark, draft, client })
  expect(client.write).toHaveBeenCalledWith(
    "capture",
    { title: draft.title, eventKey: "x:x-123" },
    "x:x-123",
  )
  await transferCapture({
    capture: bookmark,
    draft,
    client,
    candidate: target,
    insertionAttempted: true,
  })
  expect(client.write).toHaveBeenCalledTimes(1)
})
