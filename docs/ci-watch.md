# CI watcher

The watcher lets agents on devresults-next push, report and settle without waiting for CI. Herb approved it on November 22, 2026. It runs on the Mac, where those threads are: launchd runs `scripts/ci-watch/run.ts` every two minutes (`com.herbcaudill.ci-watch`, wired in dotfiles' `nix/home/ci-watch.nix`) and logs to `~/.local/state/leo/ci-watch/watch.log`. It uses no model. It's separate from the [heartbeat](heartbeat.md), which runs a model every 30 minutes on the mini.

## When it wakes someone

It compares main's finished CI runs, ignoring superseded ones. When the newest result turns red, it wakes one thread, once. It then stays silent until a newer run is green, or the red run passes on a rerun. A job that hit its time limit counts as red. The woken thread owns main until it's green, which includes confirming its fix in CI.

## Whom it wakes

It ranks the commits since the last green run by what the failed log mentions: stale help articles, files, the folders of failing tests, catalog text and message IDs. The winning commit's thread is found from, in order:

1. what devresults-next's pre-push hook recorded in `.git/devresults-pushes.jsonl`, once that's installed;
2. the linked worktree whose reflog shows the commit being made, and the newest thread in that worktree;
3. the thread linked to the commit's pull request.

When the log points to no commit, or no thread on the Mac can be found (a commit from the mini, or a thread that's archived), it starts a `Fix red main` thread in a new worktree on the default role's model. The T3 CLI can't set effort, so that thread gets T3's default effort for the model.

The pick is a heuristic, so the message lists the other candidates and their threads, and the woken thread passes it on when the pick is wrong.

## Checking on it

- `~/.local/state/leo/ci-watch/state.json` has `checkedAt`, the last successful look, and the open episode. A `checkedAt` more than a few minutes old means the watcher isn't working. The reason is in the log.
- `node scripts/ci-watch/run.ts --replay <run ID>` prints whom a past failure would wake and the message, and sends nothing.

A T3 stall or failed delivery is retried on the next look, because the episode is saved only after delivery.
