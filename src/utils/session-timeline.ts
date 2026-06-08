/**
 * session-timeline.ts
 *
 * Unified ISO timestamp → session-offset alignment utility.
 * All OpenF1 data packets carry a `date` field; this normalises them
 * to milliseconds from session start so heterogeneous streams can be
 * time-synced (telemetry, audio, circuit map, race control).
 *
 * Usage:
 *   const tl = new SessionTimeline(session.date_start);
 *   const offsetMs = tl.toOffset(carDataFrame.date);
 *   const idx = tl.bisect(carDataFrames, offsetMs);
 *   const snapshot = tl.snapshot(raceControlMsgs, replayISO);
 */

export class SessionTimeline {
  private readonly t0: number; // session start epoch ms

  constructor(sessionStartISO: string) {
    this.t0 = new Date(sessionStartISO).getTime();
  }

  /** Session start as epoch milliseconds */
  get startEpoch(): number {
    return this.t0;
  }

  /**
   * Convert any ISO date string to milliseconds offset from session start.
   * Negative values are before the session began.
   */
  toOffset(isoDate: string): number {
    return new Date(isoDate).getTime() - this.t0;
  }

  /**
   * Format a session offset as "MM:SS.mmm" (e.g. "01:23.456").
   */
  formatOffset(offsetMs: number): string {
    const abs = Math.abs(offsetMs);
    const sign = offsetMs < 0 ? '-' : '';
    const minutes = Math.floor(abs / 60_000);
    const seconds = Math.floor((abs % 60_000) / 1_000);
    const millis  = abs % 1_000;
    return `${sign}${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
  }

  /**
   * Binary search: find the index in a sorted (ascending `date`) data array
   * whose offset is closest to `targetOffsetMs`.
   * O(log n).
   */
  bisect<T extends { date: string }>(data: T[], targetOffsetMs: number): number {
    if (data.length === 0) return 0;
    let lo = 0;
    let hi = data.length - 1;

    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.toOffset(data[mid].date) < targetOffsetMs) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    // Clamp to valid range
    return Math.max(0, Math.min(lo, data.length - 1));
  }

  /**
   * Replay snapshot: return all entries with `date` ≤ `upToISO`.
   * Useful for scrubbing: pass the current replay timestamp to get
   * everything that has happened up to that point.
   */
  snapshot<T extends { date: string }>(data: T[], upToISO: string): T[] {
    const cutoff = new Date(upToISO).getTime();
    return data.filter(d => new Date(d.date).getTime() <= cutoff);
  }

  /**
   * For a given replay position, return the ISO window [from, to]
   * to use as API query parameters (e.g. date>=${from}&date<=${to}).
   */
  windowAround(isoDate: string, halfWindowMs = 4000): { from: string; to: string } {
    const t = new Date(isoDate).getTime();
    return {
      from: new Date(t - halfWindowMs).toISOString(),
      to:   new Date(t + halfWindowMs).toISOString(),
    };
  }

  /**
   * Return a window relative to NOW for live data queries.
   * e.g. last 8 seconds: windowFromNow(8000) → date>=${8s ago}
   */
  static windowFromNow(lookbackMs: number): string {
    return new Date(Date.now() - lookbackMs).toISOString();
  }
}
