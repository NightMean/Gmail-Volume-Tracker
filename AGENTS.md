# AGENTS.md

## Project

A privacy-focused browser userscript and Google Apps Script backend that displays a real-time incoming email volume counter and 30-day activity heatmap in Gmail's top-right navigation header.

Key files:
- `gmail-volume-tracker.user.js` — Tampermonkey/Violentmonkey browser userscript; docks volume badges and calendar heatmap in the Gmail DOM.
- `Code.gs` — Google Apps Script backend Web App; queries Gmail throughput via Search API (`-from:me`), aggregates counts, and caches historical stats in `PropertiesService`.
- `assets/` — project screenshots and media.

## Commands & Verification

- **Backend:** Deployed as an authenticated Google Apps Script Web App executed as the account owner (`Me`) with access set to `Anyone` (allowing the client userscript to query the private endpoint).
- **Frontend:** Installed in Tampermonkey or Violentmonkey. Updates require incrementing the `@version` header in `gmail-volume-tracker.user.js`.
- **Verification:** Manual verification in browser with Gmail open. Check developer console for `[Gmail Volume Tracker]` messages and confirm incoming counter matches actual daily email throughput.

## Invariants & Design Principles

- **Throughput measurement:** Strictly measures true incoming throughput by filtering out self-sent emails (`-from:me`) across Inbox, Trash, Spam, Archive, and all custom labels.
- **Smart caching:** Historical days are cached in Google Apps Script `PropertiesService` so only the current day is calculated on demand.
- **Security:** Supports an optional shared `SECURITY_SECRET` between the userscript header and Apps Script backend.

## Repository policy

- Public repository (`NightMean/Gmail-Volume-Tracker`). Private agent files and personal test configurations remain untracked.
