/**
 * In-memory cache with TTL support.
 * Designed to reduce Firestore reads for frequently accessed, rarely-mutated data
 * like master data, locations, partner lists, and dashboard stats.
 *
 * For the Firestore free tier (50k reads/day), caching even for 60 seconds
 * can cut reads by 90%+ on high-traffic endpoints.
 */
const { logger } = require("../config/logger");

class MemoryCache {
  constructor() {
    /** @type {Map<string, { data: any, expiresAt: number }>} */
    this._store = new Map();
    this._hits = 0;
    this._misses = 0;
    this._evictions = 0;

    // Periodic cleanup of expired entries every 60 seconds
    this._cleanupInterval = setInterval(() => this._cleanup(), 60_000);
    if (this._cleanupInterval.unref) this._cleanupInterval.unref();
  }

  /**
   * Get a value from the cache.
   * @param {string} key
   * @returns {any|undefined} The cached value, or undefined if not found or expired.
   */
  get(key) {
    const entry = this._store.get(key);
    if (!entry) {
      this._misses++;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this._store.delete(key);
      this._misses++;
      this._evictions++;
      return undefined;
    }
    this._hits++;
    return entry.data;
  }

  /**
   * Set a value in the cache.
   * @param {string} key
   * @param {any} data
   * @param {number} ttlSeconds - Time-to-live in seconds (default: 120)
   */
  set(key, data, ttlSeconds = 120) {
    this._store.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  /**
   * Get-or-fetch: returns cached value if available, otherwise calls the async
   * fetcher function, caches the result, and returns it.
   * This is the primary way services should interact with the cache.
   *
   * @param {string} key
   * @param {() => Promise<any>} fetcher
   * @param {number} ttlSeconds
   * @returns {Promise<any>}
   */
  async getOrFetch(key, fetcher, ttlSeconds = 120) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const data = await fetcher();
    this.set(key, data, ttlSeconds);
    return data;
  }

  /**
   * Invalidate a specific cache key.
   * Call this after mutations (create/update/delete) on the related collection.
   */
  invalidate(key) {
    this._store.delete(key);
  }

  /**
   * Invalidate all keys whose prefix matches the given string.
   * E.g. invalidatePrefix("donors") clears "donors:list:*", "donors:single:*", etc.
   */
  invalidatePrefix(prefix) {
    let cleared = 0;
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) {
        this._store.delete(key);
        cleared++;
      }
    }
    if (cleared > 0) {
      logger.debug(`Cache: invalidated ${cleared} keys with prefix '${prefix}'`);
    }
  }

  /** Invalidate everything. */
  clear() {
    this._store.clear();
    logger.debug("Cache: cleared all entries");
  }

  /** Return hit/miss/size stats for monitoring. */
  stats() {
    return {
      size: this._store.size,
      hits: this._hits,
      misses: this._misses,
      evictions: this._evictions,
      hitRate: this._hits + this._misses > 0
        ? ((this._hits / (this._hits + this._misses)) * 100).toFixed(1) + "%"
        : "N/A",
    };
  }

  /** Remove expired entries (called periodically). */
  _cleanup() {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this._store) {
      if (now > entry.expiresAt) {
        this._store.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      logger.debug(`Cache: cleaned up ${removed} expired entries`);
    }
  }
}

// Singleton instance — shared across the backend
const cache = new MemoryCache();

module.exports = { cache };
