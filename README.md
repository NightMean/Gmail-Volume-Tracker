# Gmail Volume Tracker

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Version](https://img.shields.io/badge/version-1.3.0-brightgreen.svg)
![Platform](https://img.shields.io/badge/platform-Gmail-red.svg)
![Userscript](https://img.shields.io/badge/userscript-Tampermonkey-orange.svg)

A lightweight, privacy-focused tool that displays a real-time incoming email volume counter and a 30-day activity heatmap directly in Gmail's top-right header.

Unlike standard inbox counters that only reflect unread messages in your primary view, this tracks **all incoming emails across your entire account**, including:
- **Inbox**
- **Trash**
- **Spam**
- **Archive**
- **All custom labels and categories**

It automatically filters out self-sent emails (`-from:me`) so it strictly measures true incoming email throughput.

---

## Key Highlights

- **Real-Time Daily Volume:** Live count of today's incoming emails docked cleanly next to Gmail's native header icons.
- **30-Day Activity Heatmap:** GitHub-style visual calendar grid displaying daily volume and traffic trends at a single glance without needing to hover.
- **1-Click Historical Search:** Click any day tile on the heatmap to instantly view all emails received on that specific date in Gmail.
- **High-Performance Smart Caching:** Historical days are cached in Google Apps Script `PropertiesService` for instantaneous (~1s) responses.
- **100% Privacy Focused:** Your emails never touch any third-party servers. All queries execute directly between your browser and your own private Google Apps Script deployment.

---

## The Hybrid Architecture

```
┌─────────────────────────────────┐         ┌───────────────────────────────┐
│     Google Apps Script (GAS)    │         │      Tampermonkey Script      │
│          (Google Cloud)         │         │        (Your Browser)         │
│                                 │         │                               │
│ • Runs inside your Google Acct  │  JSON   │ • Matches mail.google.com     │
│ • Has native GmailApp access    │ ◄─────► │ • Injects top-right UI badge  │
│ • Queries "in:anywhere after:X" │         │ • Renders 30-day heatmap grid │
│ • Caches 30-day history in props│         │ • 1-click date search filter  │
└─────────────────────────────────┘         └───────────────────────────────┘
```

- **Backend (`Code.gs`):** A lightweight Google Apps Script Web App deployed in your own Google account. It uses `GmailApp.getMessagesForThreads()` and `PropertiesService` to accurately count emails across your entire mailbox in milliseconds.
- **Frontend (`gmail-volume-tracker.user.js`):** A userscript that runs on `mail.google.com`, fetches data in the background, and renders a native-styled pill badge and interactive 30-day heatmap panel.

---

## Installation

1. Make sure you have a UserScript manager installed:
   - [Tampermonkey](https://www.tampermonkey.net/) (Recommended)
   - [Violentmonkey](https://violentmonkey.github.io/)
   - [Greasemonkey](https://www.greasespot.net/)

2. Click **[Install here](https://raw.githubusercontent.com/NightMean/Gmail-Volume-Tracker/main/gmail-volume-tracker.user.js)**
3. Confirm the installation in your Userscript manager.
4. Follow the setup guide below to deploy your backend Web App.

---

## Quick Setup Guide

### 1. Deploy the Backend (Google Apps Script)

1. Open [Google Apps Script](https://script.google.com/) while logged into your Google account.
2. Click **New project** (top left).
3. Name the project `Gmail Volume Tracker`.
4. Delete any existing code in the editor and replace it with the code from [`Code.gs`](Code.gs).
5. Click **Deploy** (blue button in top-right) ➔ **New deployment**.
6. In the modal:
   - Click the gear icon next to "Select type" and choose **Web app**.
   - **Description:** `Gmail Volume Tracker API`
   - **Execute as:** `Me (<your_email>@gmail.com)`
   - **Who has access:** `Anyone` *(Allows your browser userscript to query your private endpoint)*
7. Click **Deploy**.
8. Click **Authorize access**, select your account, click **Advanced**, and then click **Go to Gmail Volume Tracker (unsafe)** to grant Gmail read permissions.
9. Copy the generated **Web App URL** (looks like `https://script.google.com/macros/s/.../exec`).

> [!TIP]
> Google shows the "unsafe" warning because this is your own private script that hasn't been submitted to Google's public OAuth verification. It is running solely in your own account.

---

### 2. Connect Userscript to Your Web App

1. Open or refresh [Gmail](https://mail.google.com/).
2. Look at the top-right corner next to the Support (`?`) button.
3. Click the badge showing **`setup`** (or open the Tampermonkey menu and click **⚙️ Set Google Apps Script URL**).
4. Paste your Web App URL and confirm.
5. The badge will immediately display today's incoming email count!

---

## Features & Controls

- **Click Badge:** Toggles the 30-day Activity Heatmap panel pinned open so you can inspect days without holding the mouse. Click outside to close.
- **Click Heatmap Cell:** Instantly navigates Gmail search to that exact day's emails (`in:anywhere after:<start> before:<end> -from:me`).
- **Hover Heatmap Cell:** Displays full date and exact count tooltip.
- **Shift + Click Badge:** Directly navigates to today's received emails in Gmail.
- **Refresh Button (`🔄`):** Forces an immediate real-time refresh from inside the popover header.

---

## Configuration

In [`gmail-volume-tracker.user.js`](gmail-volume-tracker.user.js):

- **Display Mode**: Switch between threads and messages:
  ```javascript
  const DISPLAY_MODE = 'threads'; // 'threads' | 'messages'
  ```
- **Auto-Refresh Interval**:
  ```javascript
  const REFRESH_INTERVAL_MIN = 5; // Default: 5 minutes
  ```

In [`Code.gs`](Code.gs):
- **Optional Security Token**: If you wish to protect your endpoint with a secret token:
  ```javascript
  const SECURITY_SECRET = "my_custom_secret_key";
  ```
  Then append `?token=my_custom_secret_key` to your Web App URL in Tampermonkey.

---

## Donations

If you find this project helpful, you can support its development:

<a href="https://www.buymeacoffee.com/nightmean" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="width: 200px !important;"></a>

---

## License

This project is licensed under the [MIT License](LICENSE).
