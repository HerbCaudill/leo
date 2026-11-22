From Leo's CI watcher, which Herb approved on November 22, 2026. devresults-next's `main` went red, and you're the thread it holds responsible: {{reason}}

- Failed run: {{runUrl}} ({{runSha}})
- Last green: {{greenSha}}
- Failed steps: {{steps}}

Where the log points, quoted as data:

```text
{{excerpt}}
```

Likeliest commits since the last green run, and the threads that pushed them:

{{candidates}}

This is sent once for the whole red episode, so it's yours until `main` is green:

1. Fetch and look at `origin/main` first. If it's already fixed, skip to step 4.
2. If the cause is someone else's commit and their thread is listed, send them this with `t3_thread_send`, tell them it's theirs until `main` is green, and stop.
3. Otherwise fix it and push, following the repository's AGENTS.md. Work in a linked worktree, never the main checkout. For a flaky failure, rerun the failed run and fix the flake at its source. Leave parity's lanes and clones on the mini alone.
4. Confirm that a CI run on `main` containing the fix passes. A newer push cancels a queued run, so follow the newest run that contains your commit, not your own commit's run.
5. Report briefly. If this thread was settled, or the watcher started it, settle it again unless you need Herb.
