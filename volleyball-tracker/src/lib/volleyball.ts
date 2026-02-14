// volleyball.ts

export type TeamSide = "left" | "right";
export type TeamId = "A" | "B";

/**
 * ✅ Positions
 * You said you need rankings per position: OH, OPP, S, L, MB.
 *
 * Notes:
 * - "WS" is kept as a legacy alias (some of your code/store normalizes strings anyway).
 * - If you never use "WS", you can delete it later.
 */
export type Position = "OH" | "OPP" | "MB" | "S" | "L" | "WS";

export type PositionGroup = "OH" | "OPP" | "MB" | "S" | "L";

/** Normalize any old labels into the 5 ranking buckets */
export function normalizePosition(pos: Position | string): PositionGroup {
  const p = String(pos).trim().toUpperCase();

  // legacy / common aliases
  if (p === "WS" || p === "W" || p === "WINGER" || p === "WINGERS") return "OH";
  if (p === "OH" || p === "OUTSIDE" || p === "OUTSIDE_HITTER") return "OH";
  if (p === "OPP" || p === "OPPOSITE" || p === "RIGHT_SIDE" || p === "RS") return "OPP";
  if (p === "MB" || p === "MIDDLE" || p === "MIDDLE_BLOCKER") return "MB";
  if (p === "S" || p === "SETTER") return "S";
  if (p === "L" || p === "LIBERO") return "L";

  // fallback bucket (treat unknown wing roles as OH)
  return "OH";
}

// Rotation slot numbers (standard)
// 1 = BR, 2 = FR, 3 = FM, 4 = FL, 5 = BL, 6 = BM
export type RotationSlot = 1 | 2 | 3 | 4 | 5 | 6;

export const slotLabel: Record<RotationSlot, string> = {
  1: "BR",
  2: "FR",
  3: "FM",
  4: "FL",
  5: "BL",
  6: "BM",
};

export type Player = {
  id: string;
  teamId: TeamId;
  name: string;
  jerseyNumber: number;
  position: Position;
};

export type CourtState = Record<RotationSlot, string | null>; // playerId per slot

/**
 * ✅ Skills
 * Expanded so you can cleanly tally points + stat buckets.
 * (Legacy values kept so old code won’t explode.)
 */
export type Skill =
  | "SERVE"
  | "RECEIVE"
  | "RECEPTION"
  | "PASS"
  | "DIG"
  | "SET"
  | "SPIKE"
  | "ATTACK"
  | "HIT"
  | "BLOCK";

/**
 * ✅ Outcomes
 * Expanded to support point attribution + detailed stats.
 *
 * You can still log simple outcomes (PERFECT/SUCCESS/ERROR),
 * but now you can log richer ones (ACE, KILL, OUT, NET, FAULT, etc.).
 */
export type Outcome =
  | "PERFECT" // perfect receive / perfect set
  | "SUCCESS" // generic success (non-point, or a point depending on skill)
  | "POINT" // explicitly a point for the acting team
  | "WIN" // explicitly a point for the acting team
  | "ACE"
  | "KILL"
  | "BLOCK_POINT"
  | "STUFF"
  | "KILL_BLOCK"
  | "ERROR" // generic error (point to opponent)
  | "FAULT" // point to opponent
  | "OUT" // point to opponent
  | "NET"; // point to opponent

/**
 * If you want a single source of truth for point attribution,
 * export these so matchStore (and UI) can use the same lists.
 */
export const ERROR_OUTCOME_KEYS = [
  "ERROR",
  "FAULT",
  "OUT",
  "NET",
  "ATTACK_ERROR",
  "SERVE_ERROR",
  "SERVICE_ERROR",
  "BLOCK_ERROR",
  "RECEIVE_ERROR",
  "DIG_ERROR",
] as const;

export const WIN_OUTCOME_KEYS = [
  "POINT",
  "WIN",
  "ACE",
  "KILL",
  "BLOCK_POINT",
  "STUFF",
  "KILL_BLOCK",
  "SUCCESS", // success can be treated as point depending on skill (see helper)
] as const;

/**
 * ✅ Optional helper: determine point winner from (teamId, skill, outcome)
 * - Errors/faults always award opponent
 * - Wins (ace/kill/block point) award acting team
 * - SUCCESS/PERFECT are treated as “no point” by default except:
 *   - serve + SUCCESS => point (ace-like)
 *   - attack/spike + SUCCESS => point (kill-like)
 *   - block + SUCCESS => point (stuff-like)
 */
export function resolvePointWinner(input: {
  actingTeam: TeamId;
  skill: Skill;
  outcome: Outcome;
}): TeamId | null {
  const acting = input.actingTeam;
  const opp: TeamId = acting === "A" ? "B" : "A";

  const skillKey = String(input.skill).toUpperCase();
  const outcomeKey = String(input.outcome).toUpperCase();

  const isError =
    outcomeKey === "ERROR" ||
    outcomeKey === "FAULT" ||
    outcomeKey === "OUT" ||
    outcomeKey === "NET" ||
    outcomeKey.includes("ERROR") ||
    outcomeKey.includes("FAULT");

  if (isError) return opp;

  const isHardWin =
    outcomeKey === "POINT" ||
    outcomeKey === "WIN" ||
    outcomeKey === "ACE" ||
    outcomeKey === "KILL" ||
    outcomeKey === "BLOCK_POINT" ||
    outcomeKey === "STUFF" ||
    outcomeKey === "KILL_BLOCK";

  if (isHardWin) return acting;

  // Soft success: decide based on action type
  if (outcomeKey === "SUCCESS") {
    const isServe = skillKey.includes("SERVE");
    const isAttack = skillKey.includes("ATTACK") || skillKey.includes("SPIKE") || skillKey === "HIT";
    const isBlock = skillKey.includes("BLOCK");
    if (isServe || isAttack || isBlock) return acting;
  }

  return null;
}

export type ActionEvent = {
  id: string;
  ts: number;
  teamId: TeamId;
  playerId: string;
  slot: RotationSlot;
  skill: Skill;
  outcome: Outcome;

  /** If you want explicit point attribution (recommended for rankings) */
  pointWinner?: TeamId; // winner of the rally/point (if any)
};
