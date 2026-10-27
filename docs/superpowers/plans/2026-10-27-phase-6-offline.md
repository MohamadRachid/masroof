# Phase 6 — Offline Implementation Plan

> Executed inline (superpowers:executing-plans), TDD for the sync module, one fresh review at the end.

**Goal:** An entry Ali makes offline on the phone always reaches the laptop after reconnect: never dropped, never stuck silently, and the two devices end up showing the same data.

**Starting point:** The Dexie mirror, outbox, push/pull worker and unsynced chip shipped in phase 1 (CLAUDE.md requires the UI to read only from Dexie). The service worker already serves the app shell offline (precache + `index.html` navigation fallback).

**Spec:** `SPEC.md` §8 (Phase 6 hardening), §10 phase 6. `CLAUDE.md`.

## Findings that drive the work
1. **Offline entries could be dropped.** When the stored access token has expired and the refresh fails, supabase-js 2.118 `_getAccessToken()` falls back to the publishable key. The upsert then runs as `anon`, RLS refuses it (42501), and `isPermanent` (22/23/42/PGRST) counts that as permanent. The rows leave the outbox for good. Likely trigger: the phone offline for over an hour, then a flaky reconnect.
2. **A pull as `anon` returns no rows without an error**, and would still mark the initial pull done on a new device (→ First run → duplicate accounts).
3. **A rejected row was never restored.** The comment says "the next pull restores the server's version", but pull only reads rows newer than the cursor.

## Rulings taken up front (no question needed)
- `supabaseRemote` checks for a signed-in session before every request; with none, it throws a retryable `NO_SESSION` error (nothing pushed or pulled; the outbox waits).
- Permanent = Postgres classes 22 and 23 only. 42xxx (permission, undefined column) and PGRST (JWT, schema cache) are retried. A stuck push stays visible through the "n unsynced" chip.
- After a permanent rejection, that table's pull cursor is cleared, so the same sync re-reads it in full and the local copy matches the server.
- Same-row edits on two devices stay "last push wins" (SPEC §8); a test documents it.
- The real phone + laptop check is a short manual checklist for Ali (it needs his login).

## Tasks
1. **Spec:** SPEC §8 Phase 6 hardening notes.
2. **Sync (TDD):** `isPermanent` narrowed; auth/schema errors keep rows queued; a rejection clears the table's cursor and the same sync restores the server copy; two-device tests (offline phone → laptop, deletes, same-row last push wins, rows pushed while the other device is offline).
3. **Runner:** `requireSession()` guard in `supabaseRemote`.
4. **Verify + ship:** typecheck, tests, build; preview build at 390 px: load, go offline, reload, add an entry, back online → outbox flushes (requests to Supabase intercepted, never sent). Fresh review, deploy, PROGRESS, manual checklist for Ali.

## Review round (2026-10-27)
A fresh reviewer confirmed the core (nothing leaves the outbox unless accepted or refused with 22/23) and found:
- Refused rows still diverged (a refused new row stayed only on this device; children cascade with 23503). Now `Remote.getRows` fetches the server copies before the outbox lets go: copy back, or remove a row the server never had; a toast says how many were undone. Replaces the full-table re-read, which was costly and could stall later tables on a weak connection.
- Two tabs syncing at once could land an older version last → Web Lock around each sync run.
- Offset paging could skip a row when the other device edits mid-pull → keyset paging (`pageThrough`), tested; PostgREST accepted the quoted `or()` filter.
- `requireSession` didn't control the token sent → the checked token goes out as the Authorization header.
- Not done: a richer stuck-queue display (error code, age, tap to retry). The "n unsynced" chip stays visible while anything is queued.

## Review Focus
1. Can any code path still remove an outbox row without the server having accepted it, apart from 22/23 rejections?
2. Can a pull without a session still mark the initial pull done?
3. Clearing the cursor after a rejection: does the re-read keep rows with pending local changes, and avoid loops?
