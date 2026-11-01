import { homedir } from "node:os"
import { join, resolve } from "node:path"

/** Absolute path to this repository. */
export const BRIEFINGS_REPOSITORY_PATH = resolve(import.meta.dirname, "../..")

/** Absolute path to the Codex executable used by scheduled runs. */
export const CODEX_COMMAND_PATH =
  process.env.CODEX_COMMAND_PATH ??
  (process.platform === "win32"
    ? join(homedir(), "AppData/Local/mise/shims/codex.exe")
    : join(homedir(), "Library/pnpm/bin/codex"))

/** Directory containing Herb's Obsidian daily notes. */
export const DAILY_NOTES_DIRECTORY_PATH = join(homedir(), "Code/herbcaudill/notes/daily")

/** Herb-maintained standing guidance applied to every morning briefing run. */
export const MORNING_BRIEFING_CONTEXT_PATH = join(
  homedir(),
  "Code/herbcaudill/notes/documents/Morning briefing context.md",
)

/** Private state directory for persisted morning briefing artifacts. */
export const MORNING_BRIEFING_STATE_DIRECTORY_PATH = join(
  homedir(),
  ".local/state/morning-briefing",
)

/** T3 Code desktop app that hosts the pinned briefing thread. */
export const T3_APP_NAME = "T3 Code (Nightly)"

/** Private file holding the URL of the T3 webhook task that presents the briefing. */
export const T3_WEBHOOK_URL_PATH = join(homedir(), ".config/morning-briefing/t3-webhook-url")

/** Private URL of the separate news presentation webhook task. */
export const NEWS_T3_WEBHOOK_URL_PATH = join(
  homedir(),
  ".config/morning-briefing/news-t3-webhook-url",
)

/** Intelligence level for source gathering and final synthesis. */
export const MORNING_BRIEFING_LEVEL = 75

/** Independent source groups gathered in parallel. */
export const MORNING_BRIEFING_LANES = [
  {
    key: "schedule",
    promptFileName: "schedule.prompt.md",
    sources: [
      "Primary calendar",
      "Lynne's calendar",
      "DevResults calendar",
      "Family and Tamariu calendars",
      "Tasks",
    ],
  },
  {
    key: "communications",
    promptFileName: "communications.prompt.md",
    sources: [
      "Gmail",
      "Slack",
      "WhatsApp",
      "Signal",
      "Apple Messages",
      "Facebook Messenger",
      "LinkedIn",
    ],
  },
  {
    key: "work",
    promptFileName: "work.prompt.md",
    sources: ["GitHub", "Meeting transcripts", "Local agent sessions"],
  },
  {
    // Files new scans in Drive before reporting
    key: "documents",
    promptFileName: "documents.prompt.md",
    sources: ["Scanned documents"],
  },
  {
    // Follow-ups, checkups and e2e, from Leo's memory in the vault
    key: "leo",
    promptFileName: "leo.prompt.md",
    sources: ["Leo"],
  },
] as const

/** Required section headings in the final briefing, in display order. */
export const REQUIRED_BRIEFING_HEADINGS = [
  "### Sources",
  "### Calendar",
  "### Other calendars",
  "### Open issues",
  "### Yesterday",
  "### Proposed standup",
  "### New tasks",
] as const

/** Headings written by synthesis before task creation determines the final section. */
export const SYNTHESIZED_BRIEFING_HEADINGS = REQUIRED_BRIEFING_HEADINGS.slice(0, -1)
