import { cleanLog } from "./cleanLog.ts"

/** Pick out what a failure's log says about the change that caused it. */
export function readFailureEvidence(
  /** The log from `gh run view --log-failed`. */
  log: string,
): FailureEvidence {
  const files = new Set<string>()
  const articles = new Set<string>()
  const texts = new Set<string>()

  for (const line of cleanLog(log)) {
    if (line.includes("✓")) continue
    const stale = STALE_ARTICLE.exec(line)
    if (stale) articles.add(stale[1]!)
    const mismatched = MISMATCHED_MESSAGE.exec(line)
    if (mismatched) texts.add(mismatched[1]!)

    const [, directory, content = line] = PACKAGE_LINE.exec(line) ?? []
    // A diff's unchanged references name files that had nothing to do with it.
    if (/^ +#:/.test(content)) continue

    if (/^[+-] /.test(content) || /^[+-](msgid|msgstr|#:)/.test(content))
      for (const [, text] of content.matchAll(QUOTED_TEXT)) texts.add(text!)

    for (const [token] of content.matchAll(FILE_NAME)) {
      const name = token.replace(/^[ab]\//, "").replace(/^\.\//, "")
      if (name.includes("node_modules") || SHARED_FILE.test(name)) continue
      const isRootPath = ROOT_DIRECTORY.test(name)
      files.add(directory && !isRootPath && name.includes("/") ? `${directory}/${name}` : name)
    }
  }
  return { files: [...files], articles: [...articles], texts: [...texts].slice(0, MAX_TEXTS) }
}

const PACKAGE_LINE =
  /^(?:##\[error\])?((?:apps|packages|public|data|migration|tests)\/[\w./-]+) [\w:.-]+: (.*)$/
// Packages have `scripts` and `tests` folders of their own, so those aren't taken for the root's.
const ROOT_DIRECTORY = /^(apps|packages|public|data|migration|tests\/(api|e2e)|\.github)\//
const STALE_ARTICLE = / article ([\w-]+): (?:stale|missing)/
const FILE_NAME =
  /(?:[\w.@$-]+\/)*[\w.@$-]+\.(?:tsx|ts|jsx|json|js|mjs|cjs|md|po|yaml|yml|css|sql)\b/g
const MISMATCHED_MESSAGE = / mismatch for (\S+) in /
const QUOTED_TEXT = /"([^"]{12,})"/g
// Nearly every commit changes catalogs and manifests, so they point at nobody.
const SHARED_FILE = /(^|\/)(locales|generated)\/|(^|\/)package\.json$/
const MAX_TEXTS = 200

/** What a failure's log mentions. */
type FailureEvidence = {
  /** Files, as repository paths where the log says enough. */
  files: string[]
  /** Help articles with stale or missing translations. */
  articles: string[]
  /** Text from a catalog's diff, and IDs of mismatched messages. */
  texts: string[]
}
