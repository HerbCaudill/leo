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

describe("validateFinalBriefingMarkdown", () => {
  test("normalizes a complete briefing to one trailing newline", () => {
    expect(validateFinalBriefingMarkdown(`${validBriefing}\n`)).toBe(validBriefing)
  })

  test("rejects missing or reordered sections", () => {
    expect(() =>
      validateFinalBriefingMarkdown(validBriefing.replace("### Sources", "### Missing")),
    ).toThrow("missing ### Sources")
    expect(() =>
      validateFinalBriefingMarkdown(
        validBriefing
          .replace("### Calendar", "### Temporary")
          .replace("### Sources", "### Calendar"),
      ),
    ).toThrow("missing ### Sources")
  })

  test("accepts a standup whose first section names a different period", () => {
    const mondayBriefing = validBriefing.replace("✅ Yesterday", "✅ Friday & weekend")
    expect(validateFinalBriefingMarkdown(mondayBriefing)).toBe(mondayBriefing)
  })

  test("rejects missing source coverage and an incomplete standup block", () => {
    expect(() => validateFinalBriefingMarkdown(validBriefing.replace("- [x] Gmail\n", ""))).toThrow(
      "coverage entry for Gmail",
    )
    expect(() => validateFinalBriefingMarkdown(validBriefing.replace("🎯 Today", "Today"))).toThrow(
      "copy-ready standup block",
    )
  })

  test("requires New tasks to be the final section", () => {
    expect(() =>
      validateFinalBriefingMarkdown(
        validBriefing.replace("### New tasks", "### New tasks\n\n- None.\n\n### Afterward"),
      ),
    ).toThrow("final section")
  })
})
