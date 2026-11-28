# `.gbox` backup file type + open-to-restore — Design

Date: 2026-11-28
Status: Implemented 2026-11-29 (JS + native config + tests; needs a native rebuild and
on-device verification of the platform specifics noted under "Left to the builder").

## Intent / why

Today a GuardBox backup is a `.json` file that can only be restored by going into
**Settings → Backup & sync → Import Backup…** and hunting for it in the document
picker. We want backups to be a recognizable GuardBox document (`.gbox`) that iOS
and Android own, so a person can **tap a `.gbox` file in Files/Mail/AirDrop and have
GuardBox open and offer to restore it**. This makes backup/restore and moving to a
new device feel first-class.

"Read and execute from the file" means *open → confirm → restore*. The file is still
**data**, never code — a `.gbox` is the same JSON (or encrypted JSON) backup, just
with an owned extension/UTI. The app never runs anything from it.

## Goals

- `.gbox` is an **owned file type** on iOS and Android (shows "Open in GuardBox").
- Opening a `.gbox` launches GuardBox, **waits for the passcode lock + onboarding**,
  then shows a **dedicated confirm sheet** to restore it.
- **Export** produces `.gbox` (correct UTI / mime), so files round-trip.
- The **Import** picker also accepts `.gbox` (and still `.json`).

## Non-goals / anti-goals

- No change to backup **contents or format** — same plain/encrypted JSON.
- No new **merge** behaviour. Restore **replaces** this device's data with the file's
  (keeping *this* device's profile) — the existing `restoreBackup` behaviour, behind
  the existing confirm dialog.
- No web file association (web keeps today's behaviour).
- **Anti-goal:** never bypass the passcode lock, and never auto-restore without an
  explicit confirm.

## Constraints

- Expo SDK 58 with Continuous Native Generation — all native config goes in
  `app.config.ts`; `ios/` and `android/` are generated. **A native rebuild is required**
  (`expo run:ios` / `eas build`); the change does not hot-reload.
- Must reuse the "pending import" gate so the file is held until the app is unlocked
  and past onboarding (same reason the reverted EPF feature did it this way).
- iOS: the exported UTI conforms to `public.json` (it *is* JSON) and is **owned**.

## Approaches considered (the how)

1. **Dedicated confirm sheet (chosen).** A focused modal screen reads the opened file
   and asks "Restore from <name>? This replaces the data on this device." Restore
   logic is extracted into a shared helper reused by the existing Import button.
   Cleaner UX; a little more new code.
2. **Reuse the Backup & sync screen (rejected).** Route to Settings → Backup & sync and
   auto-run the import confirmation. Least code, but dropping someone into the full
   settings screen after they tapped a file is jarring.

## The how, decided

- **`src/lib/pendingImport.ts`** — small zustand store holding the pending file URI,
  adapted from the reverted `src/lib/epf/pending.ts` (`request(uri)` / `take()`).
- **`src/app/+native-intent.tsx`** — `redirectSystemPath({ path, initial })`: if `path`
  is a local file ending in `.gbox`, call `pendingImport.request(path)` and return `'/'`
  on initial launch (else `null`); otherwise return `path`.
- **`src/lib/restore.ts`** — extract a shared helper from the current
  `sync.tsx` import: given backup **text**, decide plain vs encrypted
  (`isEncryptedBackup`), decrypt with a passphrase when needed, and return a
  `BackupFile`. Reused by both the Import button and the new screen.
- **`src/app/restore-backup.tsx`** — modal screen. Reads the pending file URI, shows
  the confirm sheet (file name + replace warning), prompts for a passphrase if the
  backup is encrypted, calls `restoreBackup`, cleans up the temp file, routes home.
- **`src/app/_layout.tsx`** — when `ready && unlocked && !showOnboarding` and a pending
  import exists, `router.push('/restore-backup')`; register it as a modal `Stack.Screen`.
  This slots next to the existing onboarding gate.
- **`app.config.ts`** — declare the type:
  - iOS `ios.infoPlist`: `CFBundleDocumentTypes` (role **Owner**, `LSItemContentTypes:
    ['com.guardbox.backup']`) + `UTExportedTypeDeclarations` (identifier
    `com.guardbox.backup`, conforms to `['public.json','public.data']`, tag
    `public.filename-extension: ['gbox']`, `public.mime-type: ['application/json']`).
  - Android `android.intentFilters`: `VIEW` + `BROWSABLE,DEFAULT`, `data` matching
    `.gbox` (by mimeType and/or `pathPattern` for `file`/`content` schemes).
- **`src/app/sync.tsx`** — export filename → `GuardBox-backup-<date>[-encrypted].gbox`;
  `shareAsync(..., { mimeType: 'application/json', UTI: 'com.guardbox.backup' })`. Import
  `DocumentPicker` keeps `'*/*'` (iOS custom UTIs aren't expressible via `type`), so
  `.gbox` is already selectable.

## Left to the builder / to verify on a device

- Exact UTI conformance keys and whether `public.data` is needed alongside `public.json`.
- Android `data` schema for matching a file extension across `file://` **and**
  `content://` URIs (likely needs `mimeType` plus `pathPattern`/`host` combos); verify
  the VIEW filter actually fires.
- Cold-start (app not running) vs warm (already open) both deliver the path through
  `+native-intent`; confirm both.
- What inbound URL iOS/Android actually hand us for a `.gbox` open, and that
  `new File(uri).text()` can read it (may need to copy out of an inbox dir first).
