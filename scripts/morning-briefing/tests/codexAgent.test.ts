import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
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
        level: 75,
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
})
