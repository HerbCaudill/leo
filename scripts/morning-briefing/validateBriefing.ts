import {
  MORNING_BRIEFING_LANES,
  REQUIRED_BRIEFING_HEADINGS,
  SYNTHESIZED_BRIEFING_HEADINGS,
} from "./constants.ts"

/** Validate the canonical final briefing before either publication step. */
export function validateFinalBriefingMarkdown(
  /** Candidate briefing Markdown. */
  markdown: string,
): string {
  const normalized = validateBriefing(markdown, REQUIRED_BRIEFING_HEADINGS)
  const newTasksIndex = normalized.indexOf("\n### New tasks\n")
  if (/^### /m.test(normalized.slice(newTasksIndex + "\n### New tasks\n".length)))
    throw new Error("New tasks must be the final section")
  return normalized
}

/** Validate synthesis output before task creation adds the final section. */
export function validateSynthesizedBriefingMarkdown(
  /** Candidate briefing Markdown without New tasks. */
  markdown: string,
): string {
  return validateBriefing(markdown, SYNTHESIZED_BRIEFING_HEADINGS)
}

/** Validate shared briefing structure and source coverage. */
function validateBriefing(markdown: string, headings: readonly string[]): string {
  if (!markdown.startsWith("## Daily briefing\n"))
    throw new Error("The final briefing must begin with `## Daily briefing`")

  let previousIndex = -1
  for (const heading of headings) {
    const headingIndex = markdown.indexOf(`\n${heading}\n`)
    if (headingIndex < 0) throw new Error(`The final briefing is missing ${heading}`)
    if (headingIndex <= previousIndex)
      throw new Error(`The final briefing has ${heading} out of order`)
    previousIndex = headingIndex
  }

  if (markdown.match(/^## Daily briefing[ \t]*$/gm)?.length !== 1)
    throw new Error("The final briefing must contain one Daily briefing section")

  for (const source of MORNING_BRIEFING_LANES.flatMap(lane => lane.sources)) {
    const checklistPattern = new RegExp(
      `^- \\[([x ])\\] ${escapeRegExp(source)}(?: \\([^\\n]+\\))?$`,
      "gm",
    )
    const matches = markdown.match(checklistPattern) ?? []
    if (matches.length !== 1)
      throw new Error(`The final briefing must contain one coverage entry for ${source}`)
  }

  if (!/```text\n✅ [^\n]+\n/.test(markdown) || !markdown.includes("\n🎯 Today\n"))
    throw new Error("The final briefing must contain the copy-ready standup block")

  return `${markdown.trimEnd()}\n`
}

/** Escape a source name for literal use in a regular expression. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
