/** Turn gh's failed-step log into plain lines. */
export function cleanLog(
  /** The log from `gh run view --log-failed`. */
  log: string,
): string[] {
  return log
    .split("\n")
    .map(line => line.replace(LINE_PREFIX, "").replace(COLOR_CODE, "").replaceAll(RUNNER_ROOT, ""))
}

// gh prints the escape character either as itself or as a caret and bracket.
// eslint-disable-next-line no-control-regex -- color codes start with the escape character
const COLOR_CODE = /(?:\u001b|\^\[)\[[0-9;]*m/g
const LINE_PREFIX = /^[^\t]*\t[^\t]*\t\S+ /
const RUNNER_ROOT = "/home/runner/work/devresults-next/devresults-next/"
