# Morning briefing

`scripts/morning-briefing/` processes new inbox captures, extracts carryover from recent Obsidian daily notes, runs schedule, communications, work, and documents gather agents concurrently through `codex exec`, schema-checks and persists their results and JSONL events under `~/.local/state/morning-briefing/`, synthesizes one canonical Markdown briefing, atomically saves it to the daily note, waits for Obsidian Sync, then opens T3 Code and posts the date and daily note path to a T3 webhook task. That task starts a fresh thread that renames and pins itself, unpins older briefing threads, repeats the saved briefing exactly, and then queues one task-review of the Inbox. The webhook URL is a credential stored in `~/.config/morning-briefing/t3-webhook-url`; the task prompt lives in T3, not in this repo. The T3 relay holds the request until the app is online. The mini's `Morning briefing` task runs it at 07:00.

## Running it

`pnpm briefing:morning` runs both briefings locally for the current date in the machine's time zone. An optional `YYYY-MM-DD` argument backfills another date, and `--dry-run` prints the time zone, planned lanes, destinations, and artifact paths without contacting sources or writing any destination. News runs from the repository directory even when the scheduler starts elsewhere. Each briefing finishes and presents independently; the command waits for both and reports any failures.

The workflow extracts carryover from the three latest daily briefings, then runs three ephemeral Codex agents in parallel:

- schedule and the Tasks board;
- Gmail and messaging; and
- GitHub, meeting transcripts, and local agent sessions.

The schedule agent uses `pnpm --silent briefing:location` for last-known place context. The command reads Backtrack's iCloud CSV and compares its final row with approximate boxes for Barcelona (latitude 41.32–41.48, longitude 2.05–2.23) and Tamariu (latitude 41.90–41.93, longitude 3.19–3.23). It returns `other` outside both boxes. It does not interpret timestamps or apply an age cutoff. A missing or invalid file causes the command to fail; the briefing continues without location context. An optional file-path argument lets you read another Backtrack CSV.

Each agent writes schema-constrained JSON plus its complete JSONL event stream. One final agent reads the merged results and creates a validated canonical `final.md`. The publisher atomically writes that exact briefing under `## Daily briefing` in `~/Code/herbcaudill/notes/daily/YYYY-MM-DD.md`, waits for Obsidian Sync, then posts the saved note path to the morning T3 webhook. The news branch posts the saved JSON path to a separate news webhook. Each task creates and pins its own dated thread and unpins only older threads of the same kind. The morning thread alone begins the Inbox review. Webhook credentials live in `~/.config/morning-briefing/t3-webhook-url` and `~/.config/morning-briefing/news-t3-webhook-url`; the news presentation prompt is versioned in `scripts/morning-briefing/prompts/news-presentation.prompt.md`.

Private artifacts never enter Git. Each run has its own directory under `~/.local/state/morning-briefing/YYYY-MM-DD/`, including `carryover.md`, per-lane results and event logs, `merged.json`, synthesis attempts, `final.md`, the presentation event log, and `manifest.json`. A single-run lock prevents scheduled runs from overlapping.

Task capture, research publication and duplicate detection use the managed Tasks CLI. See [Tasks integration](docs/tasks-integration.md) for the enrolled-space binding, journal recovery and legacy-history rules.

## Scan filing

The `documents` lane files new family scans in Google Drive with the `file-scans` skill from dotfiles, which owns the naming rules and filing script, then reports scans that need Herb's attention. See `plans/005-scan-filing.md`.

## GitHub notifications

The `work` lane marks GitHub notifications done when they need no input from Herb, such as closed or merged subjects and bot activity. It leaves the rest in the inbox and reports them so synthesis can turn them into tasks. It takes no other GitHub action.
