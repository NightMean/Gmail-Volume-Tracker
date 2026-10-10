// ==UserScript==
// @name         Gmail Volume Tracker
// @namespace    https://github.com/NightMean/Gmail-Volume-Tracker
// @version      1.3.0
// @description  Displays a real-time incoming email volume counter and 30-day activity heatmap in Gmail.
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

  function getShortMonth(dateStr) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const parts = (dateStr || '').split("-");
    if (parts.length === 3) {
      const mIdx = parseInt(parts[1], 10) - 1;
      return months[mIdx] || "";
    }
    return "";
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

      /* Tooltip / Heatmap Panel */
      .gvt-tooltip {
        visibility: hidden !important;
        position: absolute !important;
        top: calc(100% + 4px) !important;
        right: 0 !important;
        width: 326px !important;
        background-color: #202124 !important;
        color: #ffffff !important;
        font-family: Roboto, 'Google Sans', sans-serif !important;
        font-size: 12px !important;
        line-height: 1.5 !important;
        padding: 12px 14px !important;
        border-radius: 10px !important;
        box-shadow: 0 6px 20px rgba(0,0,0,0.5) !important;
        z-index: 10000000 !important;
        opacity: 0 !important;
        transform: translateY(-4px) !important;
        transition: opacity 0.2s, transform 0.2s, visibility 0.2s !important;
        pointer-events: none !important;
        white-space: normal !important;
        box-sizing: border-box !important;
        border: 1px solid rgba(255,255,255,0.1) !important;
      }

      #gvt-badge-container:hover .gvt-tooltip,
      #gvt-badge-container.gvt-pinned .gvt-tooltip {
        visibility: visible !important;
        opacity: 1 !important;
        transform: translateY(0) !important;
        pointer-events: auto !important;
      }

      .gvt-tooltip-header {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        border-bottom: 1px solid rgba(255,255,255,0.15) !important;
        padding-bottom: 6px !important;
        margin-bottom: 8px !important;
      }

      .gvt-tooltip-title {
        font-weight: 600 !important;
        font-size: 13px !important;
        color: #8ab4f8 !important;
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
      }

      .gvt-tooltip-actions {
        display: flex !important;
        gap: 8px !important;
        align-items: center !important;
      }

      .gvt-action-btn {
        background: transparent !important;
        border: none !important;
        color: #9aa0a6 !important;
        cursor: pointer !important;
        font-size: 13px !important;
        padding: 2px 4px !important;
        border-radius: 4px !important;
        line-height: 1 !important;
        transition: color 0.15s, background 0.15s !important;
      }

      .gvt-action-btn:hover {
        color: #ffffff !important;
        background: rgba(255,255,255,0.1) !important;
      }

      .gvt-summary-stats {
        display: flex !important;
        justify-content: space-between !important;
        font-size: 11px !important;
        color: #bdc1c6 !important;
        margin-bottom: 10px !important;
        padding: 4px 8px !important;
        background: rgba(255,255,255,0.05) !important;
        border-radius: 6px !important;
      }

      .gvt-summary-stats span strong {
        color: #e8eaed !important;
      }

      /* Heatmap Grid (6 columns x 5 rows = 30 days) */
      .gvt-heatmap-section-title {
        font-size: 11px !important;
        font-weight: 600 !important;
        color: #9aa0a6 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.5px !important;
        margin-bottom: 6px !important;
      }

      .gvt-heatmap-grid {
        display: grid !important;
        grid-template-columns: repeat(6, 1fr) !important;
        gap: 5px !important;
        margin: 6px 0 10px 0 !important;
      }

      .gvt-heatmap-cell {
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 5px 2px !important;
        min-height: 40px !important;
        border-radius: 6px !important;
        cursor: pointer !important;
        transition: transform 0.15s ease, box-shadow 0.15s ease !important;
        position: relative !important;
        text-align: center !important;
        user-select: none !important;
        box-sizing: border-box !important;
        border: 1px solid transparent !important;
      }

      .gvt-heatmap-cell:hover {
        transform: translateY(-2px) scale(1.05) !important;
        z-index: 10 !important;
        box-shadow: 0 3px 8px rgba(0,0,0,0.6) !important;
      }

      .gvt-heatmap-cell.is-today {
        outline: 2px solid #8ab4f8 !important;
        outline-offset: 1px !important;
      }

      .gvt-cell-day {
        font-size: 9.5px !important;
        font-weight: 500 !important;
        opacity: 0.75 !important;
        line-height: 1.1 !important;
        margin-bottom: 2px !important;
      }

      .gvt-cell-count {
        font-size: 11.5px !important;
        font-weight: 700 !important;
        line-height: 1.1 !important;
      }

      .gvt-tooltip-footer {
        margin-top: 8px !important;
        padding-top: 6px !important;
        border-top: 1px solid rgba(255,255,255,0.1) !important;
        font-size: 11px !important;
        color: #9aa0a6 !important;
        display: flex !important;
        justify-content: space-between !important;
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
    badge.title = 'Click to open 30-Day Heatmap • Shift+Click to search today';

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

    // Tooltip & 30-day heatmap panel (Trusted Types compliant)
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'gvt-tooltip';

    // Panel Header
    const ttHeader = document.createElement('div');
    ttHeader.className = 'gvt-tooltip-header';

    const ttTitle = document.createElement('div');
    ttTitle.className = 'gvt-tooltip-title';
    ttTitle.textContent = '📬 30-Day Email Activity';

    const ttActions = document.createElement('div');
    ttActions.className = 'gvt-tooltip-actions';

    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'gvt-action-btn';
    refreshBtn.title = 'Refresh email counts';
    refreshBtn.textContent = '🔄';
    refreshBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fetchCount(true);
    });

    ttActions.appendChild(refreshBtn);
    ttHeader.appendChild(ttTitle);
    ttHeader.appendChild(ttActions);
    tooltipEl.appendChild(ttHeader);

    // Summary stats bar
    const statsRow = document.createElement('div');
    statsRow.className = 'gvt-summary-stats';

    const statToday = document.createElement('span');
    statToday.id = 'gvt-stat-today';
    statToday.textContent = 'Today: --';

    const statTotal = document.createElement('span');
    statTotal.id = 'gvt-stat-total';
    statTotal.textContent = '30d: --';

    const statAvg = document.createElement('span');
    statAvg.id = 'gvt-stat-avg';
    statAvg.textContent = 'Avg: --';

    statsRow.appendChild(statToday);
    statsRow.appendChild(statTotal);
    statsRow.appendChild(statAvg);
    tooltipEl.appendChild(statsRow);

    // Heatmap Section Title
    const hmTitle = document.createElement('div');
    hmTitle.className = 'gvt-heatmap-section-title';
    hmTitle.textContent = 'Daily Breakdown (Past 30 Days)';
    tooltipEl.appendChild(hmTitle);

    // 30-Day Heatmap Grid
    const heatmapGrid = document.createElement('div');
    heatmapGrid.className = 'gvt-heatmap-grid';
    heatmapGrid.id = 'gvt-heatmap-grid';
    tooltipEl.appendChild(heatmapGrid);

    // Panel Footer
    const ttFooter = document.createElement('div');
    ttFooter.className = 'gvt-tooltip-footer';

    const ftLeft = document.createElement('span');
    ftLeft.textContent = 'Click cell to view day in Gmail';

    const ftRight = document.createElement('span');
    ftRight.id = 'gvt-tt-time';
    ftRight.textContent = 'Never';

    ttFooter.appendChild(ftLeft);
    ttFooter.appendChild(ftRight);
    tooltipEl.appendChild(ttFooter);

    badgeContainer.appendChild(badge);
    badgeContainer.appendChild(tooltipEl);

    // Click handler: click badge to toggle pinned heatmap panel
    badge.addEventListener('click', (e) => {
      if (e.shiftKey) {
        const epoch = getTodayStartEpochSec();
        window.location.hash = `#search/in%3Aanywhere+after%3A${epoch}+-from%3Ame`;
      } else {
        badgeContainer.classList.toggle('gvt-pinned');
      }
    });

    // Close pinned panel when clicking outside
    document.addEventListener('click', (e) => {
      if (badgeContainer && !badgeContainer.contains(e.target)) {
        badgeContainer.classList.remove('gvt-pinned');
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
  // DATA FETCHING & UI UPDATE
  // ============================================================================
  function updateUI(data) {
    if (!countNumberEl) return;

    // Display primary count on the header badge
    const count = DISPLAY_MODE === 'threads' 
      ? (data.threadsCount !== undefined ? data.threadsCount : data.messagesCount) 
      : (data.messagesCount !== undefined ? data.messagesCount : data.threadsCount);

    countNumberEl.textContent = count !== undefined ? count : '?';

    // Update quick summary stats
    const statToday = document.getElementById('gvt-stat-today');
    const statTotal = document.getElementById('gvt-stat-total');
    const statAvg = document.getElementById('gvt-stat-avg');
    const ttTime = document.getElementById('gvt-tt-time');

    if (statToday) {
      statToday.textContent = '';
      statToday.appendChild(document.createTextNode('Today: '));
      const b = document.createElement('strong');
      b.textContent = count !== undefined ? count : '--';
      statToday.appendChild(b);
    }

    if (ttTime) {
      ttTime.textContent = (data.clientFetchedAt || data.updatedAt || formatTime(new Date()));
    }

    // Render 30-Day Heatmap Grid
    const grid = document.getElementById('gvt-heatmap-grid');
    if (!grid) return;

    const history = data.history || [];
    if (history.length === 0) {
      grid.textContent = '';
      const emptyNote = document.createElement('div');
      emptyNote.style.gridColumn = 'span 6';
      emptyNote.style.textAlign = 'center';
      emptyNote.style.padding = '12px 0';
      emptyNote.style.color = '#9aa0a6';
      emptyNote.textContent = 'Loading 30-day history...';
      grid.appendChild(emptyNote);
      return;
    }

    grid.textContent = '';

    // Calculate total and max for color scaling
    let total30 = 0;
    let maxCount = 1;
    for (const item of history) {
      const c = (DISPLAY_MODE === 'threads' ? (item.threadsCount ?? item.messagesCount) : (item.messagesCount ?? item.threadsCount)) || 0;
      total30 += c;
      if (c > maxCount) maxCount = c;
    }

    const avg = Math.round(total30 / history.length);
    if (statTotal) {
      statTotal.textContent = '';
      statTotal.appendChild(document.createTextNode('30d: '));
      const b = document.createElement('strong');
      b.textContent = total30.toLocaleString();
      statTotal.appendChild(b);
    }

    if (statAvg) {
      statAvg.textContent = '';
      statAvg.appendChild(document.createTextNode('Avg: '));
      const b = document.createElement('strong');
      b.textContent = avg.toString() + '/d';
      statAvg.appendChild(b);
    }

    // Render each day cell
    for (const item of history) {
      const c = (DISPLAY_MODE === 'threads' ? (item.threadsCount ?? item.messagesCount) : (item.messagesCount ?? item.threadsCount)) || 0;
      const cell = document.createElement('div');
      cell.className = 'gvt-heatmap-cell';
      if (item.isToday) cell.classList.add('is-today');

      // Heatmap color intensity (Emerald gradient in dark mode)
      const ratio = c / maxCount;
      let bg = 'rgba(255,255,255,0.04)';
      let textColor = '#9aa0a6';
      let borderColor = 'rgba(255,255,255,0.06)';

      if (c === 0) {
        bg = 'rgba(255,255,255,0.03)';
        textColor = '#5f6368';
      } else if (ratio <= 0.25) {
        bg = '#0e3a24';
        textColor = '#81c995';
        borderColor = '#137333';
      } else if (ratio <= 0.50) {
        bg = '#137333';
        textColor = '#e6f4ea';
        borderColor = '#1e8e3e';
      } else if (ratio <= 0.75) {
        bg = '#1e8e3e';
        textColor = '#ffffff';
        borderColor = '#34a853';
      } else {
        bg = '#34a853';
        textColor = '#ffffff';
        borderColor = '#81c995';
      }

      cell.style.backgroundColor = bg;
      cell.style.color = textColor;
      cell.style.borderColor = borderColor;

      // Tooltip description on hover
      const labelDate = item.date || '';
      const dayName = item.dayName || '';
      cell.title = `${dayName ? dayName + ', ' : ''}${labelDate}: ${c} emails (Click to search in Gmail)`;

      // Day label (top: e.g. "9 Oct")
      const dayEl = document.createElement('div');
      dayEl.className = 'gvt-cell-day';
      dayEl.textContent = `${item.dayNumber || ''} ${item.date ? getShortMonth(item.date) : ''}`;

      // Count label (center: e.g. "199")
      const countEl = document.createElement('div');
      countEl.className = 'gvt-cell-count';
      countEl.textContent = c.toString();

      cell.appendChild(dayEl);
      cell.appendChild(countEl);

      // Clicking any day opens Gmail search for that day
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.startEpochSec && item.endEpochSec) {
          window.location.hash = `#search/in%3Aanywhere+after%3A${item.startEpochSec}+before%3A${item.endEpochSec}+-from%3Ame`;
        } else if (item.date) {
          window.location.hash = `#search/in%3Aanywhere+after%3A${item.date.replace(/-/g, '/')}+-from%3Ame`;
        }
      });

      grid.appendChild(cell);
    }
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
