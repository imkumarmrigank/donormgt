/**
 * Firestore read-tracking utility.
 * Wraps Firestore calls to log how many document reads each API request triggers.
 * This helps identify the most expensive endpoints.
 *
 * Usage in services:
 *   const { trackReads } = require("../utils/readTracker");
 *   const snapshot = await trackReads(req, "donors:list", () => query.get());
 *
 * Usage as middleware:
 *   app.use(readTrackerMiddleware);  // Attaches req._reads counter
 */
const { logger } = require("../config/logger");

// Global daily read counter for monitoring against Firestore free tier
let dailyReads = 0;
let lastResetDate = new Date().toISOString().slice(0, 10);

function checkDailyReset() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== lastResetDate) {
    logger.info(`Firestore daily reads (${lastResetDate}): ${dailyReads}`);
    dailyReads = 0;
    lastResetDate = today;
  }
}

/**
 * Express middleware that initializes a per-request read counter.
 * Logs the total reads on response finish.
 */
function readTrackerMiddleware(req, res, next) {
  req._firestoreReads = 0;
  req._readDetails = [];

  const startTime = Date.now();

  res.on("finish", () => {
    checkDailyReset();
    const elapsed = Date.now() - startTime;

    if (req._firestoreReads > 0) {
      logger.info("Firestore reads for request", {
        method: req.method,
        path: req.path,
        reads: req._firestoreReads,
        details: req._readDetails,
        elapsed: `${elapsed}ms`,
        dailyTotal: dailyReads,
      });
    }
  });

  next();
}

/**
 * Wrapper that tracks the number of documents read by a Firestore operation.
 *
 * @param {object} req - Express request (must have _firestoreReads initialized)
 * @param {string} label - Human-readable label for this read operation
 * @param {() => Promise<FirebaseFirestore.QuerySnapshot|FirebaseFirestore.DocumentSnapshot>} operation
 * @returns {Promise<any>} The Firestore snapshot
 */
async function trackReads(req, label, operation) {
  const result = await operation();

  let count = 0;
  if (result && typeof result.size === "number") {
    // QuerySnapshot
    count = result.size;
  } else if (result && typeof result.exists === "boolean") {
    // DocumentSnapshot
    count = 1;
  }

  if (req && typeof req._firestoreReads === "number") {
    req._firestoreReads += count;
    req._readDetails.push({ label, docs: count });
  }
  dailyReads += count;

  return result;
}

/** Get the current daily read count for monitoring/health-check endpoints. */
function getDailyReadCount() {
  checkDailyReset();
  return { date: lastResetDate, reads: dailyReads };
}

module.exports = {
  readTrackerMiddleware,
  trackReads,
  getDailyReadCount,
};
