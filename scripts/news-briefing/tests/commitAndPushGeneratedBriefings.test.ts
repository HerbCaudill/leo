import { describe, expect, test } from "vitest"
import { commitAndPushGeneratedBriefings } from "../commitAndPushGeneratedBriefings.ts"

describe("commitAndPushGeneratedBriefings", () => {
  test("adds generated briefing files, commits them, rebases with autostash, and pushes", async () => {
    const commands: Array<{ args: string[]; command: string }> = []

    await commitAndPushGeneratedBriefings({
      dates: ["2026-04-18", "2026-04-20"],
      runCommand: async (command, args) => {
        commands.push({ args, command })
        return ""
      },
    })

    expect(commands).toEqual([
      {
        command: "git",
        args: [
          "add",
          "briefings/2026-04-18.json",
          "briefings/raw/2026-04-18.json",
          "briefings/raw/2026-04-18-selection.json",
          "briefings/2026-04-20.json",
          "briefings/raw/2026-04-20.json",
          "briefings/raw/2026-04-20-selection.json",
        ],
      },
      {
        command: "git",
        args: ["commit", "-m", "Briefing: add generated briefings for 2026-04-18, 2026-04-20"],
      },
      { command: "git", args: ["pull", "--rebase", "--autostash"] },
      { command: "git", args: ["push"] },
    ])
  })

  test("does not run git commands when there are no generated dates", async () => {
    const commands: Array<{ args: string[]; command: string }> = []

    await commitAndPushGeneratedBriefings({
      dates: [],
      runCommand: async (command, args) => {
        commands.push({ args, command })
        return ""
      },
    })

    expect(commands).toEqual([])
  })
})
