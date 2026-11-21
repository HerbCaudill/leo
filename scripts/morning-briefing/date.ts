/** Read the machine's current IANA time zone. */
export function getLocalTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** Format a date as YYYY-MM-DD in the current local time zone. */
export function formatLocalDate(
  /** Instant to format. */
  date: Date = new Date(),
  /** IANA time zone, defaulting to the machine's current zone. */
  timeZone: string = getLocalTimeZone(),
): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(date)
}

/** Whether a YYYY-MM-DD calendar date falls on a Saturday or Sunday. */
export function isWeekendDate(
  /** Calendar date as YYYY-MM-DD. */
  date: string,
): boolean {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay()
  return day === 0 || day === 6
}

/** Build a filesystem-safe timestamp for a run directory. */
export function formatRunId(
  /** Instant to format. */
  date: Date = new Date(),
): string {
  return date.toISOString().replaceAll(":", "-").replace(".", "-")
}
