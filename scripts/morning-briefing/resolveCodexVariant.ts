import { execFileSync } from "node:child_process"
import { homedir } from "node:os"
import { join } from "node:path"

/** Ask the shared `llm` CLI which Codex model and effort meet a level. */
export function resolveCodexVariant(
  /** Required intelligence from 0 to 100. */
  level: number,
): CodexVariant {
  // Leo's agents rely on Codex features like Chrome MCP and event logs, so they stay on Codex.
  const output = execFileSync(
    process.execPath,
    ["--no-warnings", LLM_CLI_PATH, "resolve", "--level", String(level), "--harness", "codex"],
    { encoding: "utf8", windowsHide: true },
  )
  return JSON.parse(output)
}

const LLM_CLI_PATH = join(homedir(), "Code/HerbCaudill/dotfiles/scripts/llm/cli.ts")

export type CodexVariant = {
  /** Reasoning effort. */
  effort: string
  /** Model ID. */
  model: string
}
