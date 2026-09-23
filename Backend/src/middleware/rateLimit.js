/**
 * Simple in-memory rate limiter.
 * Prevents a single client from flooding the API with requests,
 * which is a main cause of excessive Firestore reads.
 *
 * Uses a sliding-window counter per IP address.
 */

/**
 * Factory function to create a rate-limiting middleware.
 *
 * @param {object} options
 * @param {number} options.windowMs  - Window size in milliseconds (default: 60s)
 * @param {number} options.maxRequests - Max requests per window (default: 60)
 * @param {string} [options.message] - Response message when rate limit exceeded
 * @returns {import("express").RequestHandler}
 */
function rateLimit({ windowMs = 60_000, maxRequests = 60, message } = {}) {
  /** @type {Map<string, { count: number, resetAt: number }>} */
  const clients = new Map();

  // Cleanup expired entries every 2 minutes
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of clients) {
      if (now > entry.resetAt) clients.delete(key);
    }
  }, 120_000);
  if (cleanup.unref) cleanup.unref();

  return (req, res, next) => {
    const key = req.user?.uid || req.ip || req.connection?.remoteAddress || "unknown";
    const now = Date.now();

    let entry = clients.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      clients.set(key, entry);
    }

    entry.count++;

    // Add rate-limit headers for transparency
    res.set("X-RateLimit-Limit", String(maxRequests));
    res.set("X-RateLimit-Remaining", String(Math.max(0, maxRequests - entry.count)));
    res.set("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > maxRequests) {
      res.status(429).json({
        success: false,
        error: {
          message: message || "Too many requests. Please slow down.",
          code: "RATE_LIMITED",
          retryAfter: Math.ceil((entry.resetAt - now) / 1000),
        },
      });
      return;
    }

    next();
  };
}

module.exports = { rateLimit };
