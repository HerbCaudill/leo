import { describe, expect, test } from "vitest"

import { SELECTION_PROMPT, SYNTHESIS_PROMPT } from "../constants.ts"

describe("SELECTION_PROMPT", () => {
  test("asks for English output", () => {
    expect(SELECTION_PROMPT).toMatch(/English/i)
  })

  test("tells the model to exclude stale stories", () => {
    expect(SELECTION_PROMPT).toMatch(/more than 2 days before the briefing date/i)
    expect(SELECTION_PROMPT).toMatch(/`date` field/i)
  })
})

describe("SYNTHESIS_PROMPT", () => {
  test("asks for English output", () => {
    expect(SYNTHESIS_PROMPT).toMatch(/English/i)
  })
})
