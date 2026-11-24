import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { DatabaseSync } from "node:sqlite"
import { afterEach, beforeEach, expect, test } from "vitest"
import {
  applyCleanupActions,
  listDesktopItems,
  listDocumentPhotos,
  readPhotoDecisions,
  recordPhotoDecision,
} from "../morningCleanup.ts"

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "morning-cleanup-"))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

test("lists desktop items without system files", () => {
  const desktop = join(root, "Desktop")
  mkdirSync(join(desktop, "1Password kits"), { recursive: true })
  for (const name of [".DS_Store", ".localized", "desktop.ini", "Ding.webloc", "plan.docx"])
    writeFileSync(join(desktop, name), "x")

  expect(listDesktopItems(desktop).map(item => [item.name, item.kind])).toEqual([
    ["1Password kits", "folder"],
    ["Ding.webloc", "file"],
    ["plan.docx", "file"],
  ])
})

test("lists recent photos with recognized text that have no decision, oldest first", () => {
  const library = createPhotosLibrary(root, [
    { uuid: "VET", taken: "2026-11-23T10:28:00Z", textBytes: 10_000 },
    { uuid: "SUNSET", taken: "2026-11-23T19:58:00Z", textBytes: 0 },
    { uuid: "SCREENSHOT", taken: "2026-11-23T20:00:00Z", textBytes: 9_000, subtype: 10 },
    { uuid: "TRASHED", taken: "2026-11-23T20:01:00Z", textBytes: 9_000, trashed: true },
    { uuid: "OLD", taken: "2026-09-01T10:00:00Z", textBytes: 9_000 },
    { uuid: "DONE", taken: "2026-11-24T09:00:00Z", textBytes: 9_000 },
    { uuid: "PHYSICAL", taken: "2026-11-22T10:30:00Z", textBytes: 26_000 },
  ])
  const decisionsPath = join(root, "decisions.json")
  recordPhotoDecision(decisionsPath, "DONE", "task", new Date("2026-11-24T10:00:00Z"))

  const photos = listDocumentPhotos({
    libraryPath: library,
    since: new Date("2026-10-25T00:00:00Z"),
    decided: readPhotoDecisions(decisionsPath),
  })

  expect(photos.map(photo => photo.uuid)).toEqual(["PHYSICAL", "VET"])
  expect(photos[0]).toMatchObject({
    takenAt: "2026-11-22T10:30:00.000Z",
    sourcePath: join(library, "originals/P/PHYSICAL.jpeg"),
  })
  expect(photos[1].sourcePath).toBe(join(library, "resources/derivatives/V/VET_1_102_o.jpeg"))
})

test("keeps every recorded photo decision", () => {
  const path = join(root, "decisions.json")
  expect(readPhotoDecisions(path).size).toBe(0)
  recordPhotoDecision(path, "A", "filed", new Date("2026-11-24T10:00:00Z"))
  recordPhotoDecision(path, "B", "not a document", new Date("2026-11-24T10:01:00Z"))
  expect([...readPhotoDecisions(path)]).toEqual(["A", "B"])
})

test("applies approved actions and reports each outcome", () => {
  const desktop = join(root, "Desktop")
  const trash = join(root, ".Trash")
  const drive = join(root, "Drive/Scans/2026")
  mkdirSync(desktop, { recursive: true })
  mkdirSync(trash)
  for (const name of ["Antigravity.dmg", "Antigravity (1).dmg", "Plan.docx", "Kept.txt"])
    writeFileSync(join(desktop, name), name)
  writeFileSync(join(trash, "Antigravity.dmg"), "an older copy")
  const library = createPhotosLibrary(root, [
    { uuid: "PHYSICAL", taken: "2026-11-22T10:30:00Z", textBytes: 26_000 },
  ])
  const decisionsPath = join(root, "decisions.json")

  const results = applyCleanupActions({ desktop, trash, libraryPath: library, decisionsPath }, [
    { kind: "trash", name: "Antigravity.dmg" },
    { kind: "trash", name: "Antigravity (1).dmg" },
    { kind: "move", name: "Plan.docx", to: drive },
    { kind: "move", name: "Missing.pdf", to: drive },
    { kind: "save-photo", uuid: "PHYSICAL", to: drive, name: "2026-11-22 Physical checklist" },
    { kind: "decide-photo", uuid: "PHYSICAL", decision: "filed; task created" },
  ])

  expect(results.map(result => result.ok)).toEqual([true, true, true, false, true, true])
  expect(readFileSync(join(trash, "Antigravity.dmg"), "utf8")).toBe("an older copy")
  expect(existsSync(join(desktop, "Antigravity.dmg"))).toBe(false)
  expect(existsSync(join(trash, "Antigravity (1).dmg"))).toBe(true)
  expect(readFileSync(join(drive, "Plan.docx"), "utf8")).toBe("Plan.docx")
  expect(readFileSync(join(drive, "2026-11-22 Physical checklist.jpeg"), "utf8")).toBe("original")
  expect(existsSync(join(desktop, "Kept.txt"))).toBe(true)
  expect(readPhotoDecisions(decisionsPath).has("PHYSICAL")).toBe(true)
})

/** Build a minimal Photos library with the tables the cleanup reads. */
function createPhotosLibrary(
  directory: string,
  assets: {
    uuid: string
    taken: string
    textBytes: number
    subtype?: number
    trashed?: boolean
  }[],
): string {
  const library = join(directory, "Photos Library.photoslibrary")
  mkdirSync(join(library, "database"), { recursive: true })
  const database = new DatabaseSync(join(library, "database/Photos.sqlite"))
  database.exec(`
    create table ZASSET (Z_PK integer primary key, ZUUID text, ZDATECREATED real, ZKIND integer,
      ZKINDSUBTYPE integer, ZTRASHEDSTATE integer, ZHIDDEN integer, ZVISIBILITYSTATE integer,
      ZDIRECTORY text, ZFILENAME text);
    create table ZMEDIAANALYSISASSETATTRIBUTES (Z_PK integer primary key, ZASSET integer,
      ZCHARACTERRECOGNITIONATTRIBUTES integer);
    create table ZCHARACTERRECOGNITIONATTRIBUTES (Z_PK integer primary key,
      ZCHARACTERRECOGNITIONDATA blob);
  `)
  assets.forEach((asset, index) => {
    const pk = index + 1
    database
      .prepare("insert into ZASSET values (?, ?, ?, 0, ?, ?, 0, 0, ?, ?)")
      .run(
        pk,
        asset.uuid,
        Date.parse(asset.taken) / 1000 - 978_307_200,
        asset.subtype ?? 0,
        asset.trashed ? 1 : 0,
        asset.uuid[0],
        `${asset.uuid}.jpeg`,
      )
    database.prepare("insert into ZMEDIAANALYSISASSETATTRIBUTES values (?, ?, ?)").run(pk, pk, pk)
    database
      .prepare("insert into ZCHARACTERRECOGNITIONATTRIBUTES values (?, ?)")
      .run(pk, asset.textBytes ? new Uint8Array(asset.textBytes) : null)
  })
  database.close()
  // PHYSICAL's original is downloaded; VET's is only in iCloud, with local previews.
  mkdirSync(join(library, "originals/P"), { recursive: true })
  writeFileSync(join(library, "originals/P/PHYSICAL.jpeg"), "original")
  mkdirSync(join(library, "resources/derivatives/V"), { recursive: true })
  writeFileSync(join(library, "resources/derivatives/V/VET_1_105_c.jpeg"), "small")
  writeFileSync(join(library, "resources/derivatives/V/VET_1_102_o.jpeg"), "the larger preview")
  return library
}
