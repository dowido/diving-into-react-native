/**
 * pit-wall-theme.ts
 *
 * Extended design token set for the Artello F1 pit-wall aesthetic.
 * Base background: #0b0b0c (void black).
 *
 * Import alongside the core theme:
 *   import { PitWall, TEAM_COLOURS, SEGMENT_COLOURS } from '@/constants/pit-wall-theme';
 */

// ─── Core pit-wall palette ───────────────────────────────────────────────────

export const PitWall = {
  // Background layers (darkest → lightest)
  void:          '#0b0b0c',   // root background
  surface:       '#111114',   // card surfaces
  surfaceRaised: '#17171b',   // elevated cards, modals
  border:        '#202028',   // subtle separator lines
  borderFocus:   '#303040',   // focused / active borders

  // Racing accent palette
  racingRed:     '#ff1801',   // F1 brand red
  neonTeal:      '#00e5ff',   // sector timing highlight
  solarAmber:    '#ffea00',   // yellow flag / sector yellow
  safetyOrange:  '#ff6b00',   // safety car / VSC
  pitGreen:      '#22c55e',   // green flag / personal best sector
  dangerRed:     '#ef4444',   // red flag / braking indicator
  purpleBest:    '#bf00ff',   // session best sector / overall fastest lap

  // Tyre compound colours
  tyreSoft:      '#ef4444',   // S — red
  tyreMedium:    '#eab308',   // M — yellow
  tyreHard:      '#e2e8f0',   // H — white/silver
  tyreInter:     '#22c55e',   // I — green
  tyreWet:       '#3b82f6',   // W — blue

  // Flag state colours
  flagGreen:     '#22c55e',
  flagYellow:    '#f59e0b',
  flagDoubleYellow: '#f97316',
  flagRed:       '#ef4444',
  flagSafetyCar: '#fb923c',
  flagVSC:       '#fbbf24',
  flagBlue:      '#3b82f6',
  flagChequered: '#f8fafc',

  // DRS states
  drsOpen:       '#ffea00',   // solarAmber — DRS active
  drsEligible:   '#00e5ff',   // neonTeal — in detection zone
  drsClosed:     '#475569',   // dimmed

  // Typography
  textPrimary:   '#f8fafc',
  textSecondary: '#94a3b8',
  textDim:       '#475569',
} as const;

// ─── Team colours (2025 grid) ─────────────────────────────────────────────────

export const TEAM_COLOURS: Record<string, string> = {
  mclaren:       '#FF8000',
  red_bull:      '#3671C6',
  mercedes:      '#27F4D2',
  ferrari:       '#E8002D',
  williams:      '#64C4FF',
  aston_martin:  '#229971',
  rb:            '#6692FF',
  haas:          '#B6BABD',
  sauber:        '#52E252',
  alpine:        '#FF87BC',
};

export function teamColour(constructorId: string): string {
  return TEAM_COLOURS[constructorId] ?? '#94a3b8';
}

// ─── Tyre compound helpers ────────────────────────────────────────────────────

export type TyreCompound = 'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET';

export interface TyreSpec {
  label: 'S' | 'M' | 'H' | 'I' | 'W';
  color: string;
}

const TYRE_MAP: Record<string, TyreSpec> = {
  SOFT:         { label: 'S', color: PitWall.tyreSoft },
  MEDIUM:       { label: 'M', color: PitWall.tyreMedium },
  HARD:         { label: 'H', color: PitWall.tyreHard },
  INTERMEDIATE: { label: 'I', color: PitWall.tyreInter },
  WET:          { label: 'W', color: PitWall.tyreWet },
};

export function tyreSpec(compound: string): TyreSpec {
  return TYRE_MAP[compound?.toUpperCase()] ?? { label: 'S', color: PitWall.textDim };
}

// ─── Mini-sector (segment) status colours ────────────────────────────────────
//
// OpenF1 /v1/laps returns segments_sector_1/2/3 arrays.
// Each element is a status code; map to a display colour.

export const SEGMENT_COLOURS: Record<number, string> = {
  0:    'transparent',          // not reached / unknown
  2048: PitWall.solarAmber,     // yellow (not personal best)
  2049: PitWall.solarAmber,
  2050: PitWall.solarAmber,
  2051: PitWall.pitGreen,       // green (personal best)
  2052: PitWall.pitGreen,
  2064: PitWall.purpleBest,     // purple (session best)
  2068: PitWall.purpleBest,
};

export function segmentColour(code: number): string {
  return SEGMENT_COLOURS[code] ?? 'transparent';
}

// ─── Flag state helpers ───────────────────────────────────────────────────────

export function flagColour(flag: string): string {
  switch (flag?.toUpperCase()) {
    case 'YELLOW':        return PitWall.flagYellow;
    case 'DOUBLE YELLOW': return PitWall.flagDoubleYellow;
    case 'RED':           return PitWall.flagRed;
    case 'SAFETY CAR':    return PitWall.flagSafetyCar;
    case 'VIRTUAL SAFETY CAR':
    case 'VSC':           return PitWall.flagVSC;
    case 'BLUE':          return PitWall.flagBlue;
    case 'CHEQUERED':     return PitWall.flagChequered;
    case 'GREEN':
    case 'CLEAR':
    default:              return PitWall.flagGreen;
  }
}

export function flagLabel(flag: string): string {
  if (!flag || flag === 'GREEN' || flag === 'CLEAR') return 'GREEN FLAG — TRACK CLEAR';
  if (flag === 'DOUBLE YELLOW') return 'DOUBLE YELLOW — REDUCE SPEED';
  if (flag === 'SAFETY CAR') return 'SAFETY CAR DEPLOYED';
  if (flag === 'VIRTUAL SAFETY CAR') return 'VIRTUAL SAFETY CAR';
  return `${flag.toUpperCase()} FLAG`;
}

// ─── DRS state ───────────────────────────────────────────────────────────────

export type DrsState = 'OPEN' | 'ELIGIBLE' | 'CLOSED';

export function drsState(drsValue: number): DrsState {
  if (drsValue >= 8)  return 'OPEN';
  if (drsValue === 2) return 'ELIGIBLE';
  return 'CLOSED';
}

export function drsColour(state: DrsState): string {
  return state === 'OPEN' ? PitWall.drsOpen
    : state === 'ELIGIBLE' ? PitWall.drsEligible
    : PitWall.drsClosed;
}

// ─── Nationality flag emoji ───────────────────────────────────────────────────

const NAT_FLAGS: Record<string, string> = {
  British: '🇬🇧', Dutch: '🇳🇱', Australian: '🇦🇺', German: '🇩🇪',
  Monegasque: '🇲🇨', Italian: '🇮🇹', Thai: '🇹🇭', Spanish: '🇪🇸',
  French: '🇫🇷', Canadian: '🇨🇦', Japanese: '🇯🇵', 'New Zealander': '🇳🇿',
  Brazilian: '🇧🇷', Argentine: '🇦🇷', Austrian: '🇦🇹', American: '🇺🇸',
  Swiss: '🇨🇭', Finnish: '🇫🇮', Danish: '🇩🇰', Chinese: '🇨🇳',
};

export function natFlag(nationality: string): string {
  return NAT_FLAGS[nationality] ?? '🏁';
}
