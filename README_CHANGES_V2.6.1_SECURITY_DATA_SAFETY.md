# V2.6.1 Security and Data-Safety Audit Patch

Date: 2026-05-22

## Summary

This patch keeps the existing GH Budgeting data model and feature set intact. It focuses on safer cloud-login gating, safer Supabase configuration, backup restore validation, and environment-file hygiene.

## Files changed

- `.env.example`
- `.gitignore`
- `src/components/auth/CloudLoginGate.jsx`
- `src/pages/SettingsPage.jsx`
- `src/services/cloudBackupService.js`
- `src/services/storageService.js`

## What changed

- Cloud login gating now protects the app UI before private budgeting pages render.
- Supabase URL/key values are provided by environment variables, not by editable app fields.
- Supabase defaults can be provided with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Client-side Supabase setup rejects keys that look like service-role keys.
- Cloud setup screens no longer accept pasted Supabase keys.
- Backup restore now rejects non-JSON files and files over 25 MB before parsing.
- `.env.example` documents safe placeholders only.
- `.gitignore` now ignores `.env.*` files while keeping `.env.example` commit-safe.

## How to test

1. Run `npm.cmd install` if dependencies are missing.
2. Run `npm.cmd run build`.
3. Start the app with `npm.cmd run dev`.
4. With local-only/default settings, confirm the app opens without the cloud login gate.
5. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the environment, then sign out and reload. Confirm finance pages do not render before login.
6. Confirm Supabase URL/key values are not editable in Settings or the login gate.
7. In Settings -> Data backup and restore, try selecting a non-JSON file and confirm restore is rejected before preview.
8. Export and restore a normal GH Budgeting JSON backup to confirm existing backup compatibility.

## Storage and migration notes

- No stored financial data fields were renamed or removed.
- No migration is required.
- Existing IndexedDB/localStorage data and existing JSON backups remain compatible.
- Restoring a backup still replaces current local browser data after the existing `RESTORE` confirmation.

## Remaining risks

- This remains a browser client app. Supabase anon keys are allowed in frontend code, but service-role keys must stay out of Vite/Vercel client env vars.
- Local IndexedDB data is still readable by someone with access to the unlocked browser/profile. The cloud login gate prevents app UI rendering before login; it is not full device encryption.
- Cloud backup safety depends on installing the RLS SQL shown in the app.
