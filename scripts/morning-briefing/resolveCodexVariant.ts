import { execFileSync } from "node:child_process"
import { homedir } from "node:os"
import { join } from "node:path"

/** Ask the shared `llm` CLI for a model role's Codex model and effort. */
export function resolveCodexVariant(
  /** Role name from the model roles table in the global AGENTS.md. */
  role: string,
): CodexVariant {
  const output = execFileSync(
    process.execPath,
    ["--no-warnings", LLM_CLI_PATH, "resolve", "--role", role],
    { encoding: "utf8", windowsHide: true },
  )
  const variant = JSON.parse(output) as CodexVariant & { harness: string }
  // Leo's agents rely on Codex features like Chrome MCP and event logs, so they need a Codex role.
  if (variant.harness !== "codex")
    throw new Error(`The ${role} role uses ${variant.harness}; Leo's agents need a Codex role`)
  return variant
}

const LLM_CLI_PATH = join(homedir(), "Code/HerbCaudill/dotfiles/scripts/llm/cli.ts")

export type CodexVariant = {
  /** Reasoning effort. */
  effort: string
  /** Model ID. */
  model: string
}
