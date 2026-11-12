import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { describe, expect, test } from "vitest"

import { getCodexExecArgs, runCodexAgent } from "../codexAgent.ts"

describe("getCodexExecArgs", () => {
  test("can preserve a research session and restrict classification to reads", () => {
    const args = getCodexExecArgs({
      cwd: "/repo",
      effort: "high",
      model: "gpt-6.1-sol",
      outputPath: "/result",
      schemaPath: "/schema",
      threadSource: "inbox-research",
      persistent: true,
      sandbox: "read-only",
    })
    expect(args).not.toContain("--ephemeral")
    expect(args[args.indexOf("--sandbox") + 1]).toBe("read-only")
  })
  test("runs an ephemeral schema-constrained agent in the briefing repo", () => {
    expect(
      getCodexExecArgs({
        cwd: "/repo",
        effort: "high",
        model: "gpt-6.1-sol",
        outputPath: "/state/result.json",
        schemaPath: "/repo/result.schema.json",
        threadSource: "morning-briefing-schedule",
      }),
    ).toEqual([
      "exec",
      "--model",
      "gpt-6.1-sol",
      "--config",
      'model_reasoning_effort="high"',
      "--sandbox",
      "danger-full-access",
      "--cd",
      "/repo",
      "--thread-source",
      "morning-briefing-schedule",
      "--ephemeral",
      "--json",
      "--output-schema",
      "/repo/result.schema.json",
      "--output-last-message",
      "/state/result.json",
      "-",
    ])
  })

  test("terminates an agent that exceeds its timeout and preserves its event log", async () => {
    const directoryPath = mkdtempSync(join(tmpdir(), "morning-agent-timeout-"))
    const eventsPath = join(directoryPath, "events.jsonl")

    await expect(
      runCodexAgent({
        codexCommand: process.execPath,
        cwd: "/repo",
        environment: {
          ...process.env,
          NODE_OPTIONS: `--import=data:text/javascript,${encodeURIComponent("setInterval(() => {}, 1000); await new Promise(() => {})")}`,
        },
        eventsPath,
        role: "author",
        resolveVariant: () => ({ effort: "high", model: "gpt-6.1-sol" }),
        outputPath: join(directoryPath, "result.json"),
        prompt: "Test",
        schemaPath: "/repo/result.schema.json",
        threadSource: "morning-briefing-test",
        timeoutMs: 20,
      }),
    ).rejects.toThrow("timed out")

    expect(readFileSync(eventsPath, "utf8")).toBe("")
  })

  // Codex agents can start daemons, such as the Chrome DevTools CLI's, that inherit the agent's
  // stdout and outlive it
  test("finishes when the agent exits while a background process it started holds its output open", async () => {
    const directoryPath = mkdtempSync(join(tmpdir(), "morning-agent-orphan-"))
    const eventsPath = join(directoryPath, "events.jsonl")
    const backgroundPidPath = join(directoryPath, "background.pid")
    const agentScriptPath = join(directoryPath, "agent.mjs")
    writeFileSync(
      agentScriptPath,
      `
      import { spawn } from "node:child_process"
      import { writeFileSync, writeSync } from "node:fs"
      const background = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], {
        env: { ...process.env, NODE_OPTIONS: "" },
        detached: true,
        stdio: "inherit",
      })
      writeFileSync(${JSON.stringify(backgroundPidPath)}, String(background.pid))
      writeSync(1, '{"type":"done"}\\n')
      process.exit(0)
    `,
    )

    try {
      await runCodexAgent({
        codexCommand: process.execPath,
        cwd: "/repo",
        environment: {
          ...process.env,
          NODE_OPTIONS: `--import=${pathToFileURL(agentScriptPath).href}`,
        },
        eventsPath,
        role: "author",
        resolveVariant: () => ({ effort: "high", model: "gpt-6.1-sol" }),
        outputPath: join(directoryPath, "result.json"),
        prompt: "Test",
        schemaPath: "/repo/result.schema.json",
        threadSource: "morning-briefing-test",
        timeoutMs: 30_000,
      })

      expect(readFileSync(eventsPath, "utf8")).toBe('{"type":"done"}\n')
    } finally {
      process.kill(Number(readFileSync(backgroundPidPath, "utf8")))
    }
  }, 15_000)
})
