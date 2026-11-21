import { describe, expect, test } from "vitest"

import { MORNING_BRIEFING_LANES } from "../constants.ts"
import { validateFinalBriefingMarkdown } from "../validateBriefing.ts"

const sourceChecklist = MORNING_BRIEFING_LANES.flatMap(lane => lane.sources)
  .map(source => `- [x] ${source}`)
  .join("\n")

const validBriefing = `## Daily briefing

### Sources

${sourceChecklist}

### Calendar

Clear.

### Other calendars

Clear.

### Open issues

None.

### Yesterday

- Work.

### Proposed standup

\`\`\`text
✅ Yesterday
- DevResults Next: worked

🎯 Today
- DevResults Next: continue
\`\`\`

### New tasks

- None.
`

const weekendBriefing = validBriefing.replace(
  /### Proposed standup\n\n```text\n[\s\S]*?```\n\n/,
  "",
)

const friday = "2026-11-20"
const saturday = "2026-11-21"
const sunday = "2026-11-22"

describe("validateFinalBriefingMarkdown", () => {
  test("normalizes a complete briefing to one trailing newline", () => {
    expect(validateFinalBriefingMarkdown(`${validBriefing}\n`, friday)).toBe(validBriefing)
  })

  test("rejects missing or reordered sections", () => {
    expect(() =>
      validateFinalBriefingMarkdown(validBriefing.replace("### Sources", "### Missing"), friday),
    ).toThrow("missing ### Sources")
    expect(() =>
      validateFinalBriefingMarkdown(
        validBriefing
          .replace("### Calendar", "### Temporary")
          .replace("### Sources", "### Calendar"),
        friday,
      ),
    ).toThrow("missing ### Sources")
  })

  test("accepts a standup whose first section names a different period", () => {
    const mondayBriefing = validBriefing.replace("✅ Yesterday", "✅ Friday & weekend")
    expect(validateFinalBriefingMarkdown(mondayBriefing, "2026-11-23")).toBe(mondayBriefing)
  })

  test("rejects missing source coverage and an incomplete standup block", () => {
    expect(() =>
      validateFinalBriefingMarkdown(validBriefing.replace("- [x] Gmail\n", ""), friday),
    ).toThrow("coverage entry for Gmail")
    expect(() =>
      validateFinalBriefingMarkdown(validBriefing.replace("🎯 Today", "Today"), friday),
    ).toThrow("copy-ready standup block")
  })

  test("leaves out the proposed standup on weekends", () => {
    expect(validateFinalBriefingMarkdown(weekendBriefing, saturday)).toBe(weekendBriefing)
    expect(validateFinalBriefingMarkdown(weekendBriefing, sunday)).toBe(weekendBriefing)
    expect(() => validateFinalBriefingMarkdown(validBriefing, saturday)).toThrow(
      "no proposed standup on weekends",
    )
    expect(() => validateFinalBriefingMarkdown(weekendBriefing, friday)).toThrow(
      "missing ### Proposed standup",
    )
  })

  test("requires New tasks to be the final section", () => {
    expect(() =>
      validateFinalBriefingMarkdown(
        validBriefing.replace("### New tasks", "### New tasks\n\n- None.\n\n### Afterward"),
        friday,
      ),
    ).toThrow("final section")
  })
})
