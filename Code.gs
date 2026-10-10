/**
 * ==============================================================================
 * Gmail Volume Tracker - Google Apps Script Web App (v1.3.1)
 * ==============================================================================
 *
 * This script runs in Google Apps Script (https://script.google.com) under your
 * Google account. It queries Gmail via the official GmailApp API to accurately
 * count all incoming emails received today across all folders (Inbox, Trash, Spam,
 * Archive, and custom labels) and caches 30-day activity trends.
 *
 * Deploy this as a Web App:
 * 1. Open https://script.google.com and paste this code into Code.gs
 * 2. Click "Deploy" -> "New deployment" (or "Manage deployments" -> edit -> new version)
 * 3. Select type: "Web app"
 * 4. Execute as: "Me (<your email>)"
 * 5. Who has access: "Anyone" (or see SECURITY_SECRET below for token protection)
 * 6. Authorize the required Gmail permissions.
 * 7. Copy the Web App URL and paste it into your Tampermonkey userscript.
 * ==============================================================================
 */

// OPTIONAL: Set a secret token to protect your endpoint (e.g., "my-secure-secret-123")
// If set, requests must include ?token=my-secure-secret-123.
// Leave as empty string "" if you don't require a token.
const SECURITY_SECRET = "";

/**
 * Handles incoming GET requests from the Tampermonkey script.
 */
function doGet(e) {
  try {
    // 1. Verify security token if configured
    if (SECURITY_SECRET && SECURITY_SECRET.trim() !== "") {
      const providedToken = (e && e.parameter ? e.parameter.token : "") || "";
      if (providedToken.trim() !== SECURITY_SECRET.trim()) {
        return createJsonResponse({
          status: "error",
          message: "Unauthorized: Invalid or missing security token."
        }, 401);
      }
    }

    // 2. Determine time boundary for "today"
    let afterEpochSec;
    const timeZone = Session.getScriptTimeZone();

    if (e && e.parameter && e.parameter.after) {
      afterEpochSec = parseInt(e.parameter.after, 10);
      if (isNaN(afterEpochSec) || afterEpochSec <= 0) {
        afterEpochSec = null;
      }
    }

    let startOfDayDate;
    if (afterEpochSec) {
      startOfDayDate = new Date(afterEpochSec * 1000);
    } else {
      const now = new Date();
      startOfDayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      afterEpochSec = Math.floor(startOfDayDate.getTime() / 1000);
    }

    const formattedDate = Utilities.formatDate(startOfDayDate, timeZone, "yyyy/MM/dd");
    const todayKey = Utilities.formatDate(startOfDayDate, timeZone, "yyyy-MM-dd");

    // 3. Load persistent cache from PropertiesService
    let userProperties = null;
    let cachedHistory = {};
    let lastKnownToday = null;

    try {
      userProperties = PropertiesService.getUserProperties();
      const rawCached = userProperties.getProperty("GMAIL_DAILY_HISTORY");
      if (rawCached) {
        cachedHistory = JSON.parse(rawCached);
      }
      const rawLastToday = userProperties.getProperty("GMAIL_LAST_TODAY");
      if (rawLastToday) {
        lastKnownToday = JSON.parse(rawLastToday);
      }
    } catch (err) {
      cachedHistory = {};
    }

    // 4. Check if any past days (days 1 to 29) are missing from the cache
    let missingPastDays = false;
    for (let dayOffset = 29; dayOffset >= 1; dayOffset--) {
      const d = new Date(startOfDayDate.getTime() - dayOffset * 24 * 60 * 60 * 1000);
      const dateKey = Utilities.formatDate(d, timeZone, "yyyy-MM-dd");
      if (!cachedHistory[dateKey]) {
        missingPastDays = true;
        break;
      }
    }

    let quotaExceeded = false;
    let quotaErrorMessage = "";
    let threadCount = (lastKnownToday && lastKnownToday.date === todayKey) ? lastKnownToday.threadsCount : 0;
    let messageCount = (lastKnownToday && lastKnownToday.date === todayKey) ? lastKnownToday.messagesCount : 0;
    let cacheUpdated = false;

    // Get current script user email for self-sent filtering
    let userEmail = "";
    try {
      userEmail = (Session.getEffectiveUser().getEmail() || "").toLowerCase().trim();
    } catch (err) {
      userEmail = "";
    }

    // 5. Query Gmail API (wrapped to catch daily quota limits)
    try {
      // If past days are missing, populate the entire 30-day history in ONE single query!
      if (missingPastDays) {
        const thirtyDaysAgoEpoch = Math.floor(startOfDayDate.getTime() / 1000) - 29 * 24 * 60 * 60;
        const bulkQuery = `in:anywhere after:${thirtyDaysAgoEpoch} -from:me`;
        const bulkThreads = GmailApp.search(bulkQuery, 0, 500);

        // Group threads by day in-memory (0 extra API calls)
        const countsByDate = {};
        for (let i = 0; i < bulkThreads.length; i++) {
          const t = bulkThreads[i];
          const lastMsgDate = t.getLastMessageDate();
          if (lastMsgDate) {
            const dKey = Utilities.formatDate(lastMsgDate, timeZone, "yyyy-MM-dd");
            countsByDate[dKey] = (countsByDate[dKey] || 0) + 1;
          }
        }

        // Cache all past 29 days
        for (let dayOffset = 29; dayOffset >= 1; dayOffset--) {
          const d = new Date(startOfDayDate.getTime() - dayOffset * 24 * 60 * 60 * 1000);
          const dateKey = Utilities.formatDate(d, timeZone, "yyyy-MM-dd");
          const c = countsByDate[dateKey] || 0;
          cachedHistory[dateKey] = {
            threadsCount: c,
            messagesCount: c
          };
        }
        cacheUpdated = true;

        // If today's count was in bulkThreads, use it as baseline
        if (countsByDate[todayKey] !== undefined) {
          threadCount = countsByDate[todayKey];
          messageCount = countsByDate[todayKey];
        }
      }

      // Normal refresh: Exactly ONE search call for today's volume
      const todayQuery = `in:anywhere after:${afterEpochSec} -from:me`;
      const threads = GmailApp.search(todayQuery, 0, 500);
      threadCount = threads.length;
      messageCount = threadCount;

      // Batch fetch messages only for today's threads if there are results
      if (threads.length > 0) {
        try {
          const afterTimestampMs = startOfDayDate.getTime();
          let detailedMsgCount = 0;
          const allMessages = GmailApp.getMessagesForThreads(threads);
          for (let i = 0; i < allMessages.length; i++) {
            const threadMsgs = allMessages[i];
            for (let j = 0; j < threadMsgs.length; j++) {
              const msg = threadMsgs[j];
              if (msg.getDate().getTime() >= afterTimestampMs && !msg.isDraft()) {
                const from = (msg.getFrom() || "").toLowerCase();
                if (!userEmail || !from.includes(userEmail)) {
                  detailedMsgCount++;
                }
              }
            }
          }
          if (detailedMsgCount > 0) {
            messageCount = detailedMsgCount;
          }
        } catch (msgErr) {
          // If message details fail, fallback to threadCount
          messageCount = threadCount;
        }
      }

      // Record latest valid today count in PropertiesService
      if (userProperties) {
        userProperties.setProperty("GMAIL_LAST_TODAY", JSON.stringify({
          date: todayKey,
          threadsCount: threadCount,
          messagesCount: messageCount,
          savedAt: Date.now()
        }));
      }

    } catch (apiError) {
      const errStr = apiError.toString();
      // Detect Google Apps Script daily quota error
      if (errStr.includes("príliš veľakrát") || errStr.includes("too many times") || errStr.includes("Service invoked")) {
        quotaExceeded = true;
        quotaErrorMessage = "Google Apps Script daily Gmail quota reached. Showing cached statistics until quota resets (rolling 24h window).";
      } else {
        // Unexpected non-quota error: rethrow to catch block
        throw apiError;
      }
    }

    // 6. Build 30-Day History array
    const historyList = [];
    for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
      const d = new Date(startOfDayDate.getTime() - dayOffset * 24 * 60 * 60 * 1000);
      const dateKey = Utilities.formatDate(d, timeZone, "yyyy-MM-dd");
      const dayNum = d.getDate();
      const dayName = Utilities.formatDate(d, timeZone, "E");
      const dStartEpoch = Math.floor(d.getTime() / 1000);
      const dEndEpoch = dStartEpoch + 24 * 60 * 60;
      const isToday = (dayOffset === 0);

      if (isToday) {
        historyList.push({
          date: dateKey,
          dayNumber: dayNum,
          dayName: dayName,
          threadsCount: threadCount,
          messagesCount: messageCount,
          startEpochSec: dStartEpoch,
          endEpochSec: dEndEpoch,
          isToday: true
        });
      } else if (cachedHistory[dateKey]) {
        const item = cachedHistory[dateKey];
        historyList.push({
          date: dateKey,
          dayNumber: dayNum,
          dayName: dayName,
          threadsCount: item.threadsCount || 0,
          messagesCount: item.messagesCount || item.threadsCount || 0,
          startEpochSec: dStartEpoch,
          endEpochSec: dEndEpoch,
          isToday: false
        });
      } else {
        historyList.push({
          date: dateKey,
          dayNumber: dayNum,
          dayName: dayName,
          threadsCount: 0,
          messagesCount: 0,
          startEpochSec: dStartEpoch,
          endEpochSec: dEndEpoch,
          isToday: false
        });
      }
    }

    // 7. Save persistent cache & purge entries older than 45 days
    if (cacheUpdated && userProperties) {
      try {
        const cutoffEpoch = Math.floor(Date.now() / 1000) - 45 * 24 * 60 * 60;
        const cleanedCache = {};
        for (const k in cachedHistory) {
          const parts = k.split("-");
          if (parts.length === 3) {
            const entryEpoch = Math.floor(new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)).getTime() / 1000);
            if (entryEpoch >= cutoffEpoch) {
              cleanedCache[k] = cachedHistory[k];
            }
          }
        }
        userProperties.setProperty("GMAIL_DAILY_HISTORY", JSON.stringify(cleanedCache));
      } catch (err) {
        // Non-fatal
      }
    }

    // 8. Return response
    const result = {
      status: quotaExceeded ? "quota_exceeded" : "success",
      warning: quotaExceeded ? quotaErrorMessage : null,
      quotaExceeded: quotaExceeded,
      date: formattedDate,
      startEpochSec: afterEpochSec,
      searchQuery: `in:anywhere after:${afterEpochSec} -from:me`,
      messagesCount: messageCount,
      threadsCount: threadCount,
      history: historyList,
      updatedAt: Utilities.formatDate(new Date(), timeZone, "yyyy-MM-dd HH:mm:ss z"),
      timeZone: timeZone
    };

    return createJsonResponse(result);

  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: error.toString(),
      stack: error.stack
    }, 500);
  }
}

/**
 * Helper to return a JSON response with proper MIME type.
 */
function createJsonResponse(data, statusCode) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
