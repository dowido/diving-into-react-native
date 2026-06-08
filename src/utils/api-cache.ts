/**
 * api-cache.ts
 *
 * In-memory TTL cache for OpenF1 and Jolpica API responses.
 * Prevents repeated fetches of static/slow-changing data and
 * reduces 429 rate-limit pressure during peak race weekends.
 *
 * Usage:
 *   const data = await apiCache.fetch('drivers-9158', fetchDrivers, TTL.driverRoster);
 */

interface CacheEntry<T> {
  data:      T;
  fetchedAt: number;  // epoch ms
  ttlMs:     number;
}

class ApiCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();

  /** Return cached data if still within TTL, otherwise null */
  get<T>(key: string): T | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > entry.ttlMs) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  /** Store data in cache under key with given TTL */
  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, { data, fetchedAt: Date.now(), ttlMs });
  }

  /**
   * Cache-aside fetch helper.
   * Returns cached value if available; otherwise calls `fetcher`,
   * stores the result, and returns it.
   */
  async fetch<T>(key: string, fetcher: () => Promise<T>, ttlMs: number): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) return cached;
    const fresh = await fetcher();
    this.set(key, fresh, ttlMs);
    return fresh;
  }

  /**
   * Invalidate all cache entries whose key starts with `prefix`.
   * Call when the active session changes.
   */
  invalidate(prefix: string): void {
    for (const k of this.store.keys()) {
      if (k.startsWith(prefix)) this.store.delete(k);
    }
  }

  /** Clear the entire cache */
  clear(): void {
    this.store.clear();
  }

  /** How many entries are currently cached */
  get size(): number {
    return this.store.size;
  }
}

/** Singleton cache instance shared across all screens */
export const apiCache = new ApiCache();

// ─── TTL Constants (milliseconds) ────────────────────────────────────────────

export const TTL = {
  // Static / rarely changing data
  driverRoster:    5 * 60_000,   //  5 min  — driver list per session
  sessionMeta:     2 * 60_000,   //  2 min  — session metadata
  raceCalendar:   30 * 60_000,   // 30 min  — full season race list

  // Semi-static per round
  stints:              30_000,   // 30 s   — tyre compounds (live)
  pits:                30_000,   // 30 s   — pit stop log (live)

  // Live during session — short TTL
  leaderboard:         30_000,   // 30 s
  intervals:           30_000,   // 30 s
  raceControl:         30_000,   // 30 s
  weather:             60_000,   //  1 min
  trackPositions:       6_000,   //  6 s   — circuit map driver dots

  // On-demand / historical — can cache longer
  carData:        10 * 60_000,   // 10 min — historical telemetry buffer
  lapData:        10 * 60_000,   // 10 min — lap times + segment codes
  teamRadio:       5 * 60_000,   //  5 min — audio clip list

  // Championship (external Jolpica API)
  standings:      15 * 60_000,   // 15 min
} as const;
