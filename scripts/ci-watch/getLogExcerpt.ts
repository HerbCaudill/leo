import { cleanLog } from "./cleanLog.ts"

/** Quote the few lines of a failure's log that say what broke. */
export function getLogExcerpt(
  /** The log from `gh run view --log-failed`. */
  log: string,
): string {
  const lines = cleanLog(log).filter(line => !line.includes("✓") && TELLING_LINE.test(line))
  const excerpt = [...new Set(lines)]
    .slice(0, MAX_LINES)
    // A fence in the log would end the quote in the message.
    .map(line => line.slice(0, MAX_LENGTH).replaceAll("```", "'''"))
  return excerpt.join("\n") || "(the log has no error lines)"
}

const TELLING_LINE =
  /FAIL |error TS|Error: | article [\w-]+: (stale|missing)|^\S+ [\w:.-]+: diff --git|timed out|ERR_PNPM|##\[error\]/
const MAX_LINES = 12
const MAX_LENGTH = 300
