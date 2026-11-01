# Tasks integration

`scripts/tasks-client/` calls the managed `tasks` CLI, whose source is in the tasks repo. Reads and writes require `converged` freshness and the enrolled space from `TASKS_SPACE_ID` (defaulting to Herb’s verified personal space for manual runs). It never opens peer storage. Capture and description intentions retain their original request IDs and inputs under `~/.local/state/tasks-client/`. An uncertain receipt stops publication and must be inspected, not blindly replayed.

Capture journals are version 2 with typed task/project targets and space bindings. Unversioned records from the Google Tasks era remain as receipts; intake and research never process them again.

The hourly inbox job and 07:00 Europe/Madrid morning briefing are managed by dotfiles. The morning review invokes `task-review` once with `views: ["inbox"]`. Research findings stay in Obsidian, with the canonical link and ordered execution steps in the task or project description.

On the mini, [X bookmark intake](x-bookmarks.md) uses the same capture records, duplicate detection, verified task destinations, and durable description writes as other capture records. X task event keys use the `x:` prefix, while older records keep `siri:`. Bookmark source links are retained on both newly created and matched tasks. The original 145 bookmarks are excluded by the source baseline journal; archive-only posts never reach Tasks.
