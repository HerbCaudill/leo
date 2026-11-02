import { expect, test, vi } from "vitest"
import { runCaptureSources } from "../runCaptureSources.ts"

test("runs every source, then reports all failures", async () => {
  const last = vi.fn(async () => 2)
  await expect(
    runCaptureSources([
      async () => {
        throw new Error("X offline")
      },
      last,
    ]),
  ).rejects.toThrow("X offline")
  expect(last).toHaveBeenCalled()
})

test("adds up the items each source processed", async () => {
  expect(await runCaptureSources([async () => 1, async () => 2])).toBe(3)
})
