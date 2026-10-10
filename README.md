# Gmail Volume Tracker

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Version](https://img.shields.io/badge/version-1.2.1-brightgreen.svg)
![Platform](https://img.shields.io/badge/platform-Gmail-red.svg)
![Userscript](https://img.shields.io/badge/userscript-Tampermonkey-orange.svg)

A lightweight, privacy-focused tool that displays a real-time incoming email volume counter directly in Gmail's top-right header.

Unlike standard inbox counters that only reflect unread messages in your primary view, this tracks **all incoming emails across your entire account**, including:
- **Inbox**
- **Trash**
- **Spam**
- **Archive**
- **All custom labels and categories**

It automatically filters out self-sent emails (`-from:me`) so it strictly measures received mail throughput.

---

## The Hybrid Architecture

```
┌─────────────────────────────────┐         ┌───────────────────────────────┐
│     Google Apps Script (GAS)    │         │      Tampermonkey Script      │
│          (Google Cloud)         │         │        (Your Browser)         │
│                                 │         │                               │
│ • Runs inside your Google Acct  │  JSON   │ • Matches mail.google.com     │
│ • Has native GmailApp access    │ ◄─────► │ • Injects top-right UI badge  │
│ • Queries "in:anywhere after:X" │         │ • Auto-refreshes periodically │
│ • Counts messages across labels │         │ • Shift+click opens search    │
└─────────────────────────────────┘         └───────────────────────────────┘
```

- **Backend (`Code.gs`):** A lightweight Google Apps Script Web App deployed in your own Google account. It uses `GmailApp.search("in:anywhere after:<start_of_day> -from:me")` to accurately count emails across your entire mailbox in milliseconds.
- **Frontend (`gmail-volume-tracker.user.js`):** A userscript that runs on `mail.google.com`, fetches the count in the background, and renders a native-styled pill badge in Gmail's top-right header with interactive tooltips and auto-refresh.

> [!NOTE]
> **100% Privacy Focused:** Your emails never touch any third-party servers. All queries execute directly between your browser and your own Google Apps Script deployment.

---

## Installation

1. Make sure you have a UserScript manager installed:
   - [Tampermonkey](https://www.tampermonkey.net/) (Recommended)
   - [Violentmonkey](https://violentmonkey.github.io/)
   - [Greasemonkey](https://www.greasespot.net/)

2. Click **[Install here](https://raw.githubusercontent.com/NightMean/Gmail-Volume-Tracker/main/gmail-volume-tracker.user.js)**
3. Confirm the installation in your Userscript manager.
4. Follow the [Quick Setup Guide](#quick-setup-guide) below to deploy your backend Web App.

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

- **Hover:** Displays a detailed card with individual message count, thread count, and last checked timestamp.
- **Click:** Triggers an immediate real-time refresh (with an animated spinning indicator).
- **Shift + Click:** Automatically navigates to Gmail search for `in:anywhere after:<today> -from:me` to view the matching emails directly.

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
