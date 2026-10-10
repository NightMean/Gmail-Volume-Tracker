/**
 * ==============================================================================
 * Gmail Volume Tracker - Google Apps Script Web App
 * ==============================================================================
 *
 * This script runs in Google Apps Script (https://script.google.com) under your
 * Google account. It queries Gmail via the official GmailApp API to accurately
 * count all incoming emails received today across all folders (Inbox, Trash, Spam,
 * Archive, and custom labels).
 *
 * Deploy this as a Web App:
 * 1. Open https://script.google.com and paste this code into Code.gs
 * 2. Click "Deploy" -> "New deployment"
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
      const providedToken = e && e.parameter ? e.parameter.token : "";
      if (providedToken !== SECURITY_SECRET) {
        return createJsonResponse({
          error: "Unauthorized: Invalid or missing security token."
        }, 401);
      }
    }

    // 2. Determine time boundary for "today"
    // Client can pass unix epoch in seconds: ?after=1728432000
    // If not provided, calculate midnight in the script's timezone.
    let afterEpochSec;
    let timeZone = Session.getScriptTimeZone();

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
      // Calculate local midnight
      const now = new Date();
      startOfDayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      afterEpochSec = Math.floor(startOfDayDate.getTime() / 1000);
    }

    // Format human-readable date string (YYYY/MM/DD)
    const formattedDate = Utilities.formatDate(startOfDayDate, timeZone, "yyyy/MM/dd");

    // 3. Build Gmail search query
    // - in:anywhere ensures searching Inbox, Trash, Spam, Archive, and all labels
    // - after:<epoch> ensures messages received after midnight
    // - -from:me excludes self-sent emails so we only count received emails
    const searchQuery = `in:anywhere after:${afterEpochSec} -from:me`;

    // 4. Perform search
    // Fetch up to 500 matching threads (plenty for daily volume)
    const threads = GmailApp.search(searchQuery, 0, 500);

    // Get the script owner's email address (Session.getEffectiveUser() works for Web Apps executed as 'Me')
    let userEmail = "";
    try {
      userEmail = (Session.getEffectiveUser().getEmail() || "").toLowerCase().trim();
    } catch (err) {
      userEmail = "";
    }

    let messageCount = 0;
    let threadCount = threads.length;

    const afterTimestampMs = startOfDayDate.getTime();

    // 5. Fast batch fetch of messages across all threads
    if (threads.length > 0) {
      const allMessages = GmailApp.getMessagesForThreads(threads);
      for (let i = 0; i < allMessages.length; i++) {
        const threadMsgs = allMessages[i];
        for (let j = 0; j < threadMsgs.length; j++) {
          const msg = threadMsgs[j];
          if (msg.getDate().getTime() >= afterTimestampMs) {
            if (!msg.isDraft()) {
              const from = (msg.getFrom() || "").toLowerCase();
              const isFromMe = userEmail !== "" && from.includes(userEmail);
              if (!isFromMe) {
                messageCount++;
              }
            }
          }
        }
      }
    }

    // Safety fallback: if messageCount couldn't be parsed but threads exist
    if (messageCount === 0 && threadCount > 0) {
      messageCount = threadCount;
    }

    // 6. Return response
    const result = {
      status: "success",
      date: formattedDate,
      startEpochSec: afterEpochSec,
      searchQuery: searchQuery,
      messagesCount: messageCount,
      threadsCount: threadCount,
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
