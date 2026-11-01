import { createHash } from "node:crypto"

/** Retain logical request identities while avoiding NTFS stream syntax in filenames. */
export function journalFileName(
  /** Stable logical request or capture key. */
  key: string,
) {
  return `${process.platform === "win32" ? createHash("sha256").update(key).digest("hex") : key}.json`
}
