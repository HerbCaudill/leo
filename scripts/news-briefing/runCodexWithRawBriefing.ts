import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runCodexAgent } from "../morning-briefing/codexAgent.ts"
import { BRIEFINGS_REPOSITORY_PATH, CODEX_COMMAND_PATH } from "../morning-briefing/constants.ts"
import type { RunCodexArgs } from "./types.ts"

const NEWS_BRIEFING_LEVEL = 55

/** Run a read-only Codex agent on a raw briefing file and return its final message. */
export async function runCodexWithRawBriefing(
  /** The prompt and raw briefing path. */
  args: RunCodexArgs,
): Promise<string> {
  const directoryPath = mkdtempSync(join(tmpdir(), "news-briefing-codex-"))
  const outputPath = join(directoryPath, "output.txt")
  try {
    await runCodexAgent({
      codexCommand: CODEX_COMMAND_PATH,
      cwd: BRIEFINGS_REPOSITORY_PATH,
      environment: process.env,
      eventsPath: join(directoryPath, "events.jsonl"),
      level: NEWS_BRIEFING_LEVEL,
      outputPath,
      prompt: `<file name="${args.rawBriefingPath}">\n${readFileSync(args.rawBriefingPath, "utf8")}\n</file>\n\n${args.prompt}`,
      sandbox: "read-only",
      threadSource: "news-briefing",
    })
    return readFileSync(outputPath, "utf8")
  } finally {
    rmSync(directoryPath, { force: true, recursive: true })
  }
}
