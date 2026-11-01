# Inbox processing

`scripts/inbox/` runs hourly and before the morning briefing. It first moves every open reminder without a due date in the Apple Reminders list named Reminders straight into the Tasks Inbox through `scripts/inbox/reminders.swift` (EventKit; AppleScript takes over a minute per call), with no classification or research, and marks each reminder done only after its task is verified. Reminders with due dates stay in Reminders so the phone can still alert Herb. Private journals live under `~/.local/state/inbox-processing/`.

An independently locked worker processes relevant research in persistent Codex sessions with no fixed time limit. Research writes canonical subject notes in Obsidian; deterministic code verifies the note, refreshes the typed task or project, and links the canonical note and appends ordered next steps to its description. Questions and source metadata remain in Obsidian, with task backlinks and private journals used to find them. Failed task updates reuse verified research and reuse the original description request before appending missing steps. Findings and unresolved questions surface in the morning Inbox review. `pnpm inbox:process --dry-run` inspects paths without writes; `--research-worker` drains queued research. Intake logs to `/tmp/inbox-processing.log`; detached research logs to `/tmp/inbox-research.log`.

On Windows, intake reads X bookmarks instead of reminders. See [X bookmark intake](x-bookmarks.md).

See [Tasks integration](tasks-integration.md) for the CLI binding and durable request journals.
