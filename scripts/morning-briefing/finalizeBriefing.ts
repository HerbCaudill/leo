import type { MorningBriefingTaskOutcome } from "./types.ts"
import { validateFinalBriefingMarkdown } from "./validateBriefing.ts"

/** Add the final section describing tasks that were actually created, and any that were not. */
export function finalizeMorningBriefing(
  /** Validated synthesis Markdown. */
  markdown: string,
  /** Briefing date as YYYY-MM-DD. */
  date: string,
  /** Task creation outcome. */
  tasks: MorningBriefingTaskOutcome,
): string {
  const parts = tasks.created.length
    ? [tasks.created.map(task => `- [${escapeLinkLabel(task.title)}](${task.url})`).join("\n")]
    : tasks.deferred.length
      ? []
      : ["- None."]
  if (tasks.deferred.length)
    parts.push(
      `Tasks failed, so these were not created: ${tasks.error ?? "unknown error"}`,
      tasks.deferred.map(task => `- ${escapeLinkLabel(task.title)}`).join("\n"),
    )
  return validateFinalBriefingMarkdown(
    `${markdown.trimEnd()}\n\n### New tasks\n\n${parts.join("\n\n")}\n`,
    date,
  )
}

/** Escape Markdown syntax that can terminate a link label. */
function escapeLinkLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]")
}
