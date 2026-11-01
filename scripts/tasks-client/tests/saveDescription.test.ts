import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test, vi } from "vitest"
import { saveDescription } from "../saveDescription.ts"
import type { TasksClient } from "../types.ts"

test("replays the original description intention after a lost reply without overwriting later edits", async () => {
  const statePath = mkdtempSync(join(tmpdir(), "description-"))
  const record = {
    kind: "task" as const,
    id: "task",
    title: "Call",
    description: "Original",
    url: "url",
  }
  const client = {
    spaceId: "space",
    write: vi
      .fn()
      .mockRejectedValueOnce(new Error("lost reply"))
      .mockResolvedValue({ affectedIds: ["task"] }),
    get: vi.fn().mockResolvedValue({ ...record, description: "Human revision" }),
  } as unknown as TasksClient
  await expect(
    saveDescription({ record, text: "Original\nResearch", eventKey: "capture", statePath }, client),
  ).rejects.toThrow("lost reply")
  await saveDescription(
    {
      record: { ...record, description: "Human revision" },
      text: "Human revision\nResearch",
      eventKey: "capture",
      statePath,
    },
    client,
  )
  expect(vi.mocked(client.write).mock.calls[0]).toEqual(vi.mocked(client.write).mock.calls[1])
  await saveDescription({ record, text: "Other draft", eventKey: "capture", statePath }, client)
  expect(client.write).toHaveBeenCalledTimes(2)
})
