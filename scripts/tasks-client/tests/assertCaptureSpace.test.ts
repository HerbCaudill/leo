import { expect, test } from "vitest"
import type { CaptureRecord } from "../../inbox/types.ts"
import { assertCaptureSpace } from "../assertCaptureSpace.ts"

test("rejects a journal whose target belongs to another space", () => {
  const record = { target: { spaceId: "other" } } as CaptureRecord
  expect(() => assertCaptureSpace(record, "other")).not.toThrow()
  expect(() => assertCaptureSpace(record, "space")).toThrow("Capture journal space mismatch")
})
