import { runCommand } from "./runCommand.ts"

/** Read the default role from the model roles table, for a thread the watcher starts. */
export async function resolveModelRole(): Promise<{ model: string }> {
  return JSON.parse(await runCommand("llm", ["resolve", "--role", "default"]))
}
