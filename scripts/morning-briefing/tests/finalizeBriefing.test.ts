import { describe, expect, test } from "vitest"

import { MORNING_BRIEFING_LANES } from "../constants.ts"
import { finalizeMorningBriefing } from "../finalizeBriefing.ts"

const sources = MORNING_BRIEFING_LANES.flatMap(lane => lane.sources)
  .map(source => `- [x] ${source}`)
  .join("\n")
const synthesizedBriefing = `## Daily briefing

### Sources

${sources}

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
`

describe("finalizeMorningBriefing", () => {
  test("finishes the briefing with links to tasks that were actually created", () => {
    expect(
      finalizeMorningBriefing(synthesizedBriefing, "2026-11-20", {
        created: [
          {
            notes: "Source context",
            title: "Reply to Ann",
            url: "https://tasks.google.com/task/task-id?sa=6",
          },
        ],
        deferred: [],
      }),
    ).toBe(`${synthesizedBriefing}
### New tasks

- [Reply to Ann](https://tasks.google.com/task/task-id?sa=6)
`)
  })

  test("states when no new tasks were needed", () => {
    expect(
      finalizeMorningBriefing(synthesizedBriefing, "2026-11-20", { created: [], deferred: [] }),
    ).toBe(`${synthesizedBriefing}
### New tasks

- None.
`)
  })

  test("lists tasks that could not be created and why", () => {
    expect(
      finalizeMorningBriefing(synthesizedBriefing, "2026-11-20", {
        created: [{ notes: "", title: "Reply to Ann", url: "https://tasks/?task=a" }],
        deferred: [{ notes: "", title: "Cancel [Friday]" }],
        error: "Tasks reply lost; inspect request r1",
      }),
    ).toBe(`${synthesizedBriefing}
### New tasks

- [Reply to Ann](https://tasks/?task=a)

Tasks failed, so these were not created: Tasks reply lost; inspect request r1

- Cancel \\[Friday\\]
`)
  })
})
