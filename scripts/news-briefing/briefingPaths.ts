import path from "node:path"

const datedBriefingJsonFileNamePattern = /^\d{4}-\d{2}-\d{2}\.json$/

const briefingsGitDirectoryPath = "briefings"

const rawBriefingsGitDirectoryPath = "briefings/raw"

/** Build the raw briefing JSON path for a date. */
export function getRawBriefingPath(
  /** The directory containing raw briefing JSON files. */
  rawDirectoryPath: string,
  /** The briefing date. */
  date: string,
): string {
  return path.join(rawDirectoryPath, `${date}.json`)
}

/** Build the selected-stories briefing JSON path for a date. */
export function getSelectionBriefingPath(
  /** The directory containing raw briefing JSON files. */
  rawDirectoryPath: string,
  /** The briefing date. */
  date: string,
): string {
  return path.join(rawDirectoryPath, `${date}-selection.json`)
}

/** Build the final briefing JSON path for a date. */
export function getFinalBriefingPath(
  /** The directory containing final briefing JSON files. */
  briefingDirectoryPath: string,
  /** The briefing date. */
  date: string,
): string {
  return path.join(briefingDirectoryPath, `${date}.json`)
}

/** Build the generated briefing paths to stage in git for the given dates. */
export function getGeneratedBriefingGitPaths(
  /** The briefing dates whose generated files should be staged. */
  dates: string[],
): string[] {
  return dates
    .flatMap(date => [
      getFinalBriefingPath(briefingsGitDirectoryPath, date),
      getRawBriefingPath(rawBriefingsGitDirectoryPath, date),
      getSelectionBriefingPath(rawBriefingsGitDirectoryPath, date),
    ])
    .map(filePath => filePath.replaceAll("\\", "/"))
}

/** Check whether a file name is a dated briefing JSON file. */
export function isDatedBriefingJsonFileName(
  /** The file name to inspect. */
  fileName: string,
): boolean {
  return datedBriefingJsonFileNamePattern.test(fileName)
}

/** Extract the briefing date from a dated briefing JSON file name. */
export function getBriefingDateFromFileName(
  /** The dated briefing JSON file name. */
  fileName: string,
): string {
  return fileName.replace(/\.json$/, "")
}
