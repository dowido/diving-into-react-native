/**
 * coordinate-normaliser.ts
 *
 * Shared bounding-box scaling for OpenF1 /v1/location data.
 * Raw telemetry coords are circuit-local metres; this maps them
 * onto device canvas pixels while preserving aspect ratio.
 *
 * Formula (X):
 *   X_screen = offsetX + (X_raw - X_min) / (X_max - X_min) * scale
 * Y is inverted: geographic convention (up = positive) → screen (down = positive).
 */

export interface RawPoint {
  x: number;
  y: number;
}

export interface CanvasBounds {
  minX:    number;
  maxX:    number;
  minY:    number;
  maxY:    number;
  /** Uniform scale factor (aspect-ratio preserving, tighter axis wins) */
  scale:   number;
  /** Horizontal centering offset in pixels */
  offsetX: number;
  /** Vertical centering offset in pixels */
  offsetY: number;
  canvasW: number;
  canvasH: number;
}

/**
 * Compute bounding box + uniform scale from a set of raw track points.
 * @param points   Raw {x, y} points from OpenF1 /v1/location
 * @param canvasW  Target canvas width in pixels
 * @param canvasH  Target canvas height in pixels
 * @param padding  Pixel padding on each side (default 16)
 */
export function computeCanvasBounds(
  points: RawPoint[],
  canvasW: number,
  canvasH: number,
  padding = 16
): CanvasBounds | null {
  if (points.length === 0) return null;

  let minX = points[0].x, maxX = points[0].x;
  let minY = points[0].y, maxY = points[0].y;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const usableW = canvasW - padding * 2;
  const usableH = canvasH - padding * 2;

  // Uniform scale: tighter axis controls so track fits in both dimensions
  const scale = Math.min(usableW / rangeX, usableH / rangeY);

  const drawW = rangeX * scale;
  const drawH = rangeY * scale;

  // Center the drawn track within the canvas area
  const offsetX = padding + (usableW - drawW) / 2;
  const offsetY = padding + (usableH - drawH) / 2;

  return { minX, maxX, minY, maxY, scale, offsetX, offsetY, canvasW, canvasH };
}

/**
 * Map one raw telemetry coordinate to screen pixels.
 * Y axis is inverted (geographic up → screen down).
 */
export function toScreenXY(
  bounds: CanvasBounds,
  rawX: number,
  rawY: number
): { x: number; y: number } {
  return {
    x: bounds.offsetX + (rawX - bounds.minX) * bounds.scale,
    // Y flip: maxY - rawY instead of rawY - minY
    y: bounds.offsetY + (bounds.maxY - rawY) * bounds.scale,
  };
}

/**
 * Downsample an array to at most `maxPoints` evenly spaced entries.
 * Preserves first and last elements.
 */
export function downsample<T>(arr: T[], maxPoints: number): T[] {
  if (arr.length <= maxPoints) return arr;
  const result: T[] = [];
  const step = (arr.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    result.push(arr[Math.round(i * step)]);
  }
  return result;
}

/**
 * Convert normalised screen points → SVG polyline `points` attribute string.
 * e.g. "12.3,45.6 78.9,10.1 …"
 */
export function toPolylineString(pts: { x: number; y: number }[]): string {
  return pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}
