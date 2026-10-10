// ==UserScript==
// @name         Gmail Volume Tracker
// @namespace    https://github.com/NightMean/Gmail-Volume-Tracker
// @version      1.2.1
// @description  Displays a real-time incoming email volume counter in Gmail's top-right header across all labels, spam, and trash.
// @author       NightMean
// @match        https://mail.google.com/*
// @include      *://mail.google.com/*
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @connect      *
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/NightMean/Gmail-Volume-Tracker/main/gmail-volume-tracker.user.js
// @downloadURL  https://raw.githubusercontent.com/NightMean/Gmail-Volume-Tracker/main/gmail-volume-tracker.user.js
// ==/UserScript==

(function () {
  'use strict';

  // Only run in top window, not inside hidden iframes
  if (window !== window.top) {
    return;
  }

  console.log('%c[Gmail Volume Tracker]%c Initializing userscript...', 'background: #1a73e8; color: white; font-weight: bold; padding: 2px 6px; border-radius: 3px;', '');

  // ============================================================================
  // CONFIGURATION
  // ============================================================================
  // Paste your Google Apps Script Web App URL here, or configure it via the extension menu
  const DEFAULT_SCRIPT_URL = "";

  // Auto-refresh interval in minutes (default: 5 minutes)
  const REFRESH_INTERVAL_MIN = 5;

  // What to display primarily: 'messages' (individual emails) or 'threads' (conversations)
  const DISPLAY_MODE = 'threads'; // 'messages' | 'threads'

  // ============================================================================
  // STORAGE HELPERS
  // ============================================================================
  function getAppScriptUrl() {
    let url = GM_getValue('GMAIL_VOLUME_TRACKER_APPS_SCRIPT_URL', GM_getValue('GMAIL_COUNTER_APPS_SCRIPT_URL', DEFAULT_SCRIPT_URL));
    if (!url || url.trim() === '') {
      url = DEFAULT_SCRIPT_URL;
    }
    return (url || '').trim();
  }

  function setAppScriptUrl(url) {
    GM_setValue('GMAIL_VOLUME_TRACKER_APPS_SCRIPT_URL', (url || '').trim());
  }

  function getLastData() {
    return GM_getValue('GMAIL_VOLUME_TRACKER_LAST_DATA', GM_getValue('GMAIL_COUNTER_LAST_DATA', null));
  }

  function setLastData(data) {
    GM_setValue('GMAIL_VOLUME_TRACKER_LAST_DATA', data);
  }

  // Register Tampermonkey Menu Commands
  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand("⚙️ Set Google Apps Script URL", () => {
      const current = getAppScriptUrl();
      const input = prompt("Enter your Google Apps Script Web App URL:\n(e.g., https://script.google.com/macros/s/.../exec)", current);
      if (input !== null) {
        setAppScriptUrl(input);
        fetchCount(true);
      }
    });

    GM_registerMenuCommand("🔄 Refresh Count Now", () => {
      fetchCount(true);
    });
  }

  // ============================================================================
  // STATE & UI ELEMENTS
  // ============================================================================
  let isFetching = false;
  let badgeContainer = null;
  let countNumberEl = null;
  let iconEl = null;
  let tooltipEl = null;

  function getTodayStartEpochSec() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.floor(today.getTime() / 1000);
  }

  function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ============================================================================
  // CSS STYLES
  // ============================================================================
  function injectStyles() {
    if (document.getElementById('gmail-volume-tracker-styles')) return;

    const style = document.createElement('style');
    style.id = 'gmail-volume-tracker-styles';
    style.textContent = `
      #gvt-badge-container {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        height: 48px !important;
        min-height: 48px !important;
        max-height: 48px !important;
        margin: 0 8px 0 0 !important;
        padding: 0 !important;
        position: relative !important;
        z-index: 100 !important;
        user-select: none !important;
        font-family: 'Google Sans', Roboto, RobotoDraft, Helvetica, Arial, sans-serif !important;
        vertical-align: middle !important;
        flex-shrink: 0 !important;
        box-sizing: border-box !important;
      }

      /* Fallback if placed directly on body */
      body > #gvt-badge-container {
        position: fixed !important;
        top: 8px !important;
        right: 215px !important;
        z-index: 9999999 !important;
      }

      .gvt-badge {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 6px !important;
        height: 36px !important;
        min-height: 36px !important;
        max-height: 36px !important;
        padding: 0 14px !important;
        border-radius: 18px !important;
        font-size: 13px !important;
        font-weight: 500 !important;
        line-height: 36px !important;
        box-sizing: border-box !important;
        cursor: pointer !important;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
        text-decoration: none !important;
        box-shadow: 0 1px 3px rgba(60,64,67,0.2) !important;
        white-space: nowrap !important;
        overflow: visible !important;

        /* Light Theme Default */
        background-color: #f2f6fc !important;
        color: #001d35 !important;
        border: 1px solid #c2e7ff !important;
      }

      .gvt-badge:hover {
        background-color: #dbe7f9 !important;
        box-shadow: 0 2px 5px rgba(60,64,67,0.3) !important;
      }

      .gvt-badge:active {
        transform: scale(0.96) !important;
      }

      /* Dark Theme */
      @media (prefers-color-scheme: dark) {
        .gvt-badge {
          background-color: #303134 !important;
          color: #e8eaed !important;
          border: 1px solid #5f6368 !important;
          box-shadow: 0 1px 3px rgba(0,0,0,0.6) !important;
        }
        .gvt-badge:hover {
          background-color: #3c4043 !important;
        }
      }

      .gvt-icon {
        font-size: 15px !important;
        line-height: 1 !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        transition: transform 0.6s ease !important;
      }

      .gvt-icon.spinning {
        animation: gvt-spin 1s linear infinite !important;
      }

      @keyframes gvt-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      .gvt-count {
        font-weight: 600 !important;
        font-size: 13px !important;
        line-height: 1 !important;
        letter-spacing: 0.2px !important;
      }

      .gvt-label {
        font-size: 11px !important;
        line-height: 1 !important;
        opacity: 0.8 !important;
        font-weight: 500 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.4px !important;
      }

      /* Tooltip */
      .gvt-tooltip {
        visibility: hidden !important;
        position: absolute !important;
        top: calc(100% + 4px) !important;
        right: 0 !important;
        min-width: 220px !important;
        background-color: #202124 !important;
        color: #ffffff !important;
        font-family: Roboto, 'Google Sans', sans-serif !important;
        font-size: 12px !important;
        line-height: 1.5 !important;
        padding: 10px 14px !important;
        border-radius: 8px !important;
        box-shadow: 0 4px 14px rgba(0,0,0,0.35) !important;
        z-index: 10000000 !important;
        opacity: 0 !important;
        transform: translateY(-4px) !important;
        transition: opacity 0.2s, transform 0.2s, visibility 0.2s !important;
        pointer-events: none !important;
        white-space: normal !important;
      }

      #gvt-badge-container:hover .gvt-tooltip {
        visibility: visible !important;
        opacity: 1 !important;
        transform: translateY(0) !important;
      }

      .gvt-tooltip-title {
        font-weight: 600 !important;
        font-size: 13px !important;
        margin-bottom: 6px !important;
        color: #8ab4f8 !important;
        border-bottom: 1px solid rgba(255,255,255,0.15) !important;
        padding-bottom: 4px !important;
      }

      .gvt-tooltip-row {
        display: flex !important;
        justify-content: space-between !important;
        margin: 4px 0 !important;
      }

      .gvt-tooltip-row-label {
        color: #bdc1c6 !important;
      }

      .gvt-tooltip-row-val {
        font-weight: 500 !important;
      }

      .gvt-tooltip-footer {
        margin-top: 8px !important;
        padding-top: 6px !important;
        border-top: 1px solid rgba(255,255,255,0.1) !important;
        font-size: 11px !important;
        color: #9aa0a6 !important;
      }
    `;
    document.head.appendChild(style);
  }

  // ============================================================================
  // DOM CREATION & POSITIONING
  // ============================================================================
  function findSupportButton() {
    const selectors = [
      'header a[href*="support.google.com"]',
      'header [aria-label*="Podpora" i]',
      'header [aria-label*="Support" i]',
      'header [aria-label*="Nápoveda" i]',
      'header [aria-label*="Help" i]',
      'header [aria-label*="Pomoc" i]',
      'header button[aria-label*="Support" i]',
      'header button[aria-label*="Podpora" i]',
      'header a[aria-label*="Podpora" i]',
      'header a[aria-label*="Support" i]'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        let target = el;
        while (target.parentElement && 
               target.parentElement.tagName !== 'HEADER' && 
               target.parentElement !== document.body &&
               target.parentElement.children.length <= 1) {
          target = target.parentElement;
        }
        return target;
      }
    }

    // Fallback: Settings button
    const settings = document.querySelector(
      'header [aria-label*="Nastavenia" i], ' +
      'header [aria-label*="Settings" i], ' +
      'header a.FH'
    );
    if (settings) {
      let target = settings;
      while (target.parentElement && 
             target.parentElement.tagName !== 'HEADER' && 
             target.parentElement !== document.body && 
             target.parentElement.children.length <= 1) {
        target = target.parentElement;
      }
      return target;
    }

    return null;
  }

  function insertIntoDOM() {
    if (!badgeContainer) return;

    const supportBtn = findSupportButton();
    if (supportBtn && supportBtn.parentElement) {
      if (badgeContainer.parentElement !== supportBtn.parentElement || badgeContainer.nextSibling !== supportBtn) {
        supportBtn.parentElement.insertBefore(badgeContainer, supportBtn);
        console.log('%c[Gmail Volume Tracker]%c Badge placed next to ? button!', 'background: #34a853; color: white; padding: 2px 6px; border-radius: 3px;', '');
      }
      return;
    }

    // Fallback: If support button not yet in DOM, place in header or body
    if (!document.body.contains(badgeContainer)) {
      const header = document.querySelector('header');
      if (header) {
        header.appendChild(badgeContainer);
      } else {
        document.body.appendChild(badgeContainer);
      }
    }
  }

  function createBadge() {
    if (document.getElementById('gvt-badge-container')) return;

    injectStyles();

    badgeContainer = document.createElement('div');
    badgeContainer.id = 'gvt-badge-container';

    const badge = document.createElement('div');
    badge.className = 'gvt-badge';
    badge.setAttribute('role', 'button');
    badge.setAttribute('tabindex', '0');
    badge.title = 'Click to refresh count • Shift+Click to open Gmail search';

    iconEl = document.createElement('span');
    iconEl.className = 'gvt-icon';
    iconEl.textContent = '📬';

    countNumberEl = document.createElement('span');
    countNumberEl.className = 'gvt-count';
    countNumberEl.textContent = '...';

    const labelEl = document.createElement('span');
    labelEl.className = 'gvt-label';
    labelEl.textContent = 'today';

    badge.appendChild(iconEl);
    badge.appendChild(countNumberEl);
    badge.appendChild(labelEl);

    // Tooltip built safely without innerHTML (complying with Trusted Types)
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'gvt-tooltip';

    const ttTitle = document.createElement('div');
    ttTitle.className = 'gvt-tooltip-title';
    ttTitle.textContent = 'Received Today';
    tooltipEl.appendChild(ttTitle);

    function createRow(labelText, valId, defaultVal) {
      const row = document.createElement('div');
      row.className = 'gvt-tooltip-row';
      const label = document.createElement('span');
      label.className = 'gvt-tooltip-row-label';
      label.textContent = labelText;
      const val = document.createElement('span');
      val.className = 'gvt-tooltip-row-val';
      if (valId) val.id = valId;
      val.textContent = defaultVal;
      row.appendChild(label);
      row.appendChild(val);
      return row;
    }

    tooltipEl.appendChild(createRow('Emails (Threads):', 'gvt-tt-threads', '--'));
    tooltipEl.appendChild(createRow('Individual Msgs:', 'gvt-tt-messages', '--'));
    tooltipEl.appendChild(createRow('Last Checked:', 'gvt-tt-time', 'Never'));

    const ttFooter = document.createElement('div');
    ttFooter.className = 'gvt-tooltip-footer';
    ttFooter.textContent = 'Click to refresh • Shift+Click to open search';
    tooltipEl.appendChild(ttFooter);

    badgeContainer.appendChild(badge);
    badgeContainer.appendChild(tooltipEl);

    // Click handler
    badge.addEventListener('click', (e) => {
      if (e.shiftKey) {
        const epoch = getTodayStartEpochSec();
        window.location.hash = `#search/in%3Aanywhere+after%3A${epoch}+-from%3Ame`;
      } else {
        fetchCount(true);
      }
    });

    // Load cached data immediately
    const cached = getLastData();
    if (cached) {
      updateUI(cached);
    }

    insertIntoDOM();
  }

  // ============================================================================
  // DATA FETCHING
  // ============================================================================
  function updateUI(data) {
    if (!countNumberEl) return;

    // Display primary count based on DISPLAY_MODE
    const count = DISPLAY_MODE === 'threads' 
      ? (data.threadsCount !== undefined ? data.threadsCount : data.messagesCount) 
      : (data.messagesCount !== undefined ? data.messagesCount : data.threadsCount);

    countNumberEl.textContent = count !== undefined ? count : '?';

    const ttThreads = document.getElementById('gvt-tt-threads');
    const ttMessages = document.getElementById('gvt-tt-messages');
    const ttTime = document.getElementById('gvt-tt-time');

    if (ttThreads) ttThreads.textContent = data.threadsCount !== undefined ? data.threadsCount : '--';
    if (ttMessages) ttMessages.textContent = (data.messagesCount !== undefined && data.messagesCount > 0) ? data.messagesCount : (data.threadsCount ?? '--');
    if (ttTime) ttTime.textContent = data.clientFetchedAt || data.updatedAt || formatTime(new Date());
  }

  function fetchCount(isManual = false) {
    const url = getAppScriptUrl();

    if (!url) {
      if (countNumberEl) countNumberEl.textContent = 'setup';
      return;
    }

    if (isFetching) return;
    isFetching = true;

    if (iconEl) iconEl.classList.add('spinning');
    console.log('[Gmail Volume Tracker] Requesting update from Google Apps Script...');

    const epochSec = getTodayStartEpochSec();
    const queryDelimiter = url.includes('?') ? '&' : '?';
    const requestUrl = `${url}${queryDelimiter}after=${epochSec}&_t=${Date.now()}`;

    function onFetchSuccess(data) {
      isFetching = false;
      if (iconEl) iconEl.classList.remove('spinning');
      console.log('[Gmail Volume Tracker] Received response:', data);

      if (data && data.status === "success") {
        data.clientFetchedAt = formatTime(new Date());
        setLastData(data);
        updateUI(data);
      } else {
        console.error("[Gmail Volume Tracker] Error from Web App:", data);
        if (countNumberEl) countNumberEl.textContent = '!';
        if (isManual) alert("Error fetching count:\n" + (data.message || JSON.stringify(data)));
      }
    }

    function onFetchFail(err, isNetError = false) {
      isFetching = false;
      if (iconEl) iconEl.classList.remove('spinning');
      console.error("[Gmail Volume Tracker] Fetch error:", err);
      if (countNumberEl) countNumberEl.textContent = '!';
      if (isManual && isNetError) {
        alert("Network error connecting to Google Apps Script Web App.\n\n" +
              "1. If Tampermonkey asked for permission to access script.google.com, make sure to choose 'Always allow domain'.\n" +
              "2. Verify that in Apps Script, under 'Deploy' -> 'Manage deployments', 'Who has access' is set to 'Anyone'.");
      }
    }

    // Try GM_xmlhttpRequest first, with fallback to fetch
    let requestHandled = false;

    try {
      GM_xmlhttpRequest({
        method: "GET",
        url: requestUrl,
        headers: {
          "Accept": "application/json"
        },
        timeout: 40000,
        onload: function (response) {
          if (requestHandled) return;
          requestHandled = true;
          try {
            const data = JSON.parse(response.responseText);
            onFetchSuccess(data);
          } catch (err) {
            onFetchFail("Failed to parse response: " + err + " -> " + response.responseText.substring(0, 200));
          }
        },
        onerror: function (err) {
          if (requestHandled) return;
          // Fallback to fetch in case Tampermonkey cross-origin was blocked
          fetch(requestUrl, { headers: { "Accept": "application/json" } })
            .then(res => res.json())
            .then(data => {
              if (requestHandled) return;
              requestHandled = true;
              onFetchSuccess(data);
            })
            .catch(() => {
              if (requestHandled) return;
              requestHandled = true;
              onFetchFail(err, true);
            });
        },
        ontimeout: function () {
          if (requestHandled) return;
          requestHandled = true;
          isFetching = false;
          if (iconEl) iconEl.classList.remove('spinning');
          console.error("[Gmail Volume Tracker] Request timed out");
          if (countNumberEl) countNumberEl.textContent = '⏳';
        }
      });
    } catch (e) {
      fetch(requestUrl, { headers: { "Accept": "application/json" } })
        .then(res => res.json())
        .then(data => onFetchSuccess(data))
        .catch(err => onFetchFail(err, true));
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  function init() {
    createBadge();

    // Ensure badge remains next to Support button even if Gmail re-renders
    const observer = new MutationObserver(() => {
      insertIntoDOM();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Initial fetch
    fetchCount(false);

    // Periodic background refresh
    setInterval(() => {
      fetchCount(false);
    }, REFRESH_INTERVAL_MIN * 60 * 1000);
  }

  // Run initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
