import { readFileSync } from "node:fs"
import { join } from "node:path"

/** Fill in the message that wakes a thread. */
export function fillPrompt(
  /** A value for each placeholder. */
  values: Record<string, string>,
): string {
  const template = readFileSync(join(import.meta.dirname, "wake.prompt.md"), "utf8")
  // A single pass, so a log that contains a placeholder is left as it is.
  return template.replace(/\{\{(\w+)\}\}/g, (placeholder, name) => values[name] ?? placeholder)
}
