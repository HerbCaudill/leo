import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "vitest"

import { MORNING_BRIEFING_LANES } from "../constants.ts"
import { synthesizeMorningBriefing } from "../synthesizeMorningBriefing.ts"

const saturday = "2026-11-21"

const briefing = `## Daily briefing

### Sources

${MORNING_BRIEFING_LANES.flatMap(lane => lane.sources)
  .map(source => `- [x] ${source}`)
  .join("\n")}

### Calendar

Clear.

### Other calendars

Clear.

### Open issues

None.

### Yesterday

- Work.
`

test("writes the briefing on the writer role from inline artifacts", async () => {
  const runs: { prompt: string; role: string }[] = []
  const directory = mkdtempSync(join(tmpdir(), "synthesis-"))
  const carryoverPath = join(directory, "carryover.md")
  writeFileSync(carryoverPath, "Herb said the invoice is paid.")

  const result = await synthesizeMorningBriefing({
    ...getArgs(directory, carryoverPath),
    runRole: async request => {
      runs.push(request)
      return JSON.stringify({ markdown: briefing, newTasks: [] })
    },
  })

  expect(result).toEqual({ markdown: briefing, newTasks: [] })
  expect(runs.map(run => run.role)).toEqual(["writer"])
  expect(runs[0]!.prompt).toContain("Herb said the invoice is paid.")
  expect(runs[0]!.prompt).toContain('"report": "Dentist at 10"')
  expect(readFileSync(join(directory, "attempt-1.json"), "utf8")).toContain("## Daily briefing")
})

test("tries again after an output that fails validation", async () => {
  const directory = mkdtempSync(join(tmpdir(), "synthesis-"))
  const carryoverPath = join(directory, "carryover.md")
  writeFileSync(carryoverPath, "")
  const outputs = ["## Daily briefing\n", briefing]

  const result = await synthesizeMorningBriefing({
    ...getArgs(directory, carryoverPath),
    runRole: async () => JSON.stringify({ markdown: outputs.shift(), newTasks: [] }),
  })

  expect(result.markdown).toBe(briefing)
})

/** Arguments shared by these tests. */
function getArgs(directory: string, carryoverPath: string) {
  return {
    carryoverPath,
    date: saturday,
    gatherResults: [{ coverage: [], lane: "schedule" as const, report: "Dentist at 10" }],
    mergedPath: join(directory, "merged.json"),
    role: "writer",
    schemaPath: join(directory, "schema.json"),
    synthesisDirectoryPath: directory,
    timeZone: "Europe/Madrid",
  }
}
