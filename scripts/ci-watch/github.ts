import { runCommand } from "./runCommand.ts"
import { REPOSITORY } from "./constants.ts"
import type { CiRun, Conclusion } from "./types.ts"

/** List main's newest finished runs. */
export async function listRuns(
  /** Only runs with this status. */
  status = "completed",
): Promise<CiRun[]> {
  const { workflow_runs } = await getJson<{ workflow_runs: ApiRun[] }>(
    `actions/workflows/ci.yml/runs?branch=main&status=${status}&per_page=100`,
  )
  return workflow_runs.filter(run => run.event !== "pull_request").map(toRun)
}

/** Read one run. */
export async function readRun(
  /** The run's ID. */
  id: number,
): Promise<CiRun> {
  return toRun(await getJson<ApiRun>(`actions/runs/${id}`))
}

/*
 * A job that outlasts timeout-minutes ends its run as "cancelled", like a superseded one. Only the
 * long ones can be timeouts, and a superseded run's jobs never ran that long.
 */
/** Mark the newest canceled run as timed out when one of its jobs hit the time limit. */
export async function markTimeouts(
  /** Finished runs. */
  runs: CiRun[],
): Promise<CiRun[]> {
  const suspect = runs
    .filter(
      run =>
        run.conclusion === "cancelled" &&
        Date.parse(run.updatedAt) - Date.parse(run.createdAt) >= JOB_LIMIT_MS,
    )
    .reduce<CiRun | undefined>(
      (latest, run) => (latest && latest.createdAt >= run.createdAt ? latest : run),
      undefined,
    )
  // A newer result makes it history.
  if (!suspect) return runs
  if (runs.some(run => run.createdAt > suspect.createdAt && run.conclusion !== "cancelled"))
    return runs

  const jobs = await listJobs(suspect.id)
  const timedOut = jobs.some(
    job =>
      job.conclusion === "cancelled" &&
      job.started_at &&
      job.completed_at &&
      Date.parse(job.completed_at) - Date.parse(job.started_at) >= JOB_LIMIT_MS,
  )
  return timedOut
    ? runs.map(run => (run === suspect ? { ...run, conclusion: "timed_out" as const } : run))
    : runs
}

/** Name a run's failed steps. */
export async function readFailedSteps(
  /** The run's ID. */
  id: number,
): Promise<string> {
  const failed = (await listJobs(id)).flatMap(job =>
    (job.steps ?? [])
      .filter(step => step.conclusion === "failure" || step.conclusion === "timed_out")
      .map(step => `${job.name}: ${step.name}`),
  )
  return failed.join(", ") || "none named (a timeout, or the job didn't start)"
}

/** Read a run's failed-step log. */
export async function readFailedLog(
  /** The run's ID. */
  id: number,
): Promise<string> {
  try {
    return await runCommand("gh", ["run", "view", String(id), "-R", REPOSITORY, "--log-failed"])
  } catch (error) {
    // A run that timed out or never started has no such log, and someone must still be woken.
    console.log(`${new Date().toISOString()} no failure log for ${id}: ${error}`)
    return ""
  }
}

/** List a run's jobs. */
async function listJobs(
  /** The run's ID. */
  id: number,
): Promise<ApiJob[]> {
  return (await getJson<{ jobs: ApiJob[] }>(`actions/runs/${id}/jobs`)).jobs
}

/** Read from the repository's API. */
async function getJson<T>(
  /** The path below the repository. */
  path: string,
): Promise<T> {
  return JSON.parse(await runCommand("gh", ["api", `repos/${REPOSITORY}/${path}`]))
}

/** Keep what the watcher uses of a run. */
function toRun(
  /** The run as GitHub gives it. */
  run: ApiRun,
): CiRun {
  return {
    id: run.id,
    sha: run.head_sha,
    conclusion: run.conclusion,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    url: run.html_url,
  }
}

const JOB_LIMIT_MS = 29.5 * 60 * 1_000

/** A run in GitHub's API. */
type ApiRun = {
  /** Its ID. */
  id: number
  /** What triggered it. */
  event: string
  /** The commit it checked. */
  head_sha: string
  /** How it ended. */
  conclusion: Conclusion
  /** When it was queued. */
  created_at: string
  /** When it last changed. */
  updated_at: string
  /** Its page. */
  html_url: string
}

/** A job in GitHub's API. */
type ApiJob = {
  /** Its name. */
  name: string
  /** How it ended. */
  conclusion: string | null
  /** When it started. */
  started_at: string | null
  /** When it ended. */
  completed_at: string | null
  /** Its steps. */
  steps?: Array<{ name: string; conclusion: string | null }>
}
