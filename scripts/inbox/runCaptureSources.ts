/** Run each source even when another fails, then report the combined errors. */
export async function runCaptureSources(
  /** Sources in order, each returning how many items it processed. */
  sources: (() => Promise<number>)[],
): Promise<number> {
  const failures: unknown[] = []
  let processed = 0
  for (const source of sources) {
    try {
      processed += await source()
    } catch (error) {
      failures.push(error)
    }
  }
  if (failures.length) throw new Error(failures.map(String).join("\n"))
  return processed
}
