# Tasks integration

`scripts/tasks/` owns the managed CLI boundary. Reads and writes require `converged` freshness and the enrolled space from `TASKS_SPACE_ID` (defaulting to Herb’s verified personal space for manual runs). It never opens peer storage or falls back to Google. Capture and description intentions retain their original request IDs and inputs under `~/.local/state/briefings-tasks/`. An uncertain receipt stops publication and must be inspected, not blindly replayed.

New capture journals are version 2 with typed task/project targets and space bindings. Pending legacy records resolve `google-tasks:<id>` provenance before use and retain the complete original record in `legacy`. Unknown, deleted or ambiguous mappings stop that item. Existing research `.done` files remain historical receipts and are never rewritten to trigger research; a missing target is not completion. No blanket journal or Obsidian backlink rewrite is needed. Unused Google helper modules remain historical source only.

The hourly inbox job and 07:00 Europe/Madrid morning briefing are managed by dotfiles. The morning review invokes `task-review` once with `views: ["inbox"]`. Research findings stay in Obsidian, with the canonical link and ordered execution steps in the task or project description.

On the mini, [X bookmark intake](x-bookmarks.md) uses the same capture records, duplicate detection, verified task destinations, and durable description writes as other capture records. X task event keys use the `x:` prefix, while older records keep `siri:`. Bookmark source links are retained on both newly created and matched tasks. The original 145 bookmarks are excluded by the source baseline journal; archive-only posts never reach Tasks.
