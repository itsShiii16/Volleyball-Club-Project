// lib/volleyball.ts

export type TeamSide = "left" | "right";
export type TeamId = "A" | "B";

/**
 * ✅ Positions
 */
export type Position = "OH" | "OPP" | "MB" | "S" | "L" | "WS";

export type PositionGroup = "OH" | "OPP" | "MB" | "S" | "L";

export function normalizePosition(pos: Position | string): PositionGroup {
  const p = String(pos).trim().toUpperCase();

  if (p === "WS" || p === "W" || p === "WINGER" || p === "WINGERS") return "OH";
  if (p === "OH" || p === "OUTSIDE" || p === "OUTSIDE_HITTER") return "OH";
  if (p === "OPP" || p === "OPPOSITE" || p === "RIGHT_SIDE" || p === "RS") return "OPP";
  if (p === "MB" || p === "MIDDLE" || p === "MIDDLE_BLOCKER") return "MB";
  if (p === "S" || p === "SETTER") return "S";
  if (p === "L" || p === "LIBERO") return "L";

  return "OH";
}

// Rotation slot numbers (standard)
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

export type CourtState = Record<RotationSlot, string | null>; 

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
 * Updated to include neutral outcomes used in Keybind/Button logic.
 */
export type Outcome =
  | "PERFECT" 
  | "GOOD"        // ✅ ADDED: Neutral positive (Dig/Rec/Set)
  | "SUCCESS" 
  | "IN_PLAY"     // ✅ ADDED: Neutral continuation (Serve/Attack)
  | "TOUCH"       // ✅ ADDED: Neutral block contact
  | "POINT" 
  | "WIN" 
  | "ACE"
  | "KILL"
  | "BLOCK_POINT"
  | "STUFF"
  | "KILL_BLOCK"
  | "ERROR" 
  | "FAULT" 
  | "OUT" 
  | "NET";

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
  "SUCCESS", 
] as const;

export function resolvePointWinner(input: {
  actingTeam: TeamId;
  skill: Skill;
  outcome: Outcome;
}): TeamId | null {
  const acting = input.actingTeam;
  const opp: TeamId = acting === "A" ? "B" : "A";

  const skillKey = String(input.skill).toUpperCase();
  const outcomeKey = String(input.outcome).toUpperCase();

  // 1. Check Errors (Point to Opponent)
  const isError =
    outcomeKey === "ERROR" ||
    outcomeKey === "FAULT" ||
    outcomeKey === "OUT" ||
    outcomeKey === "NET" ||
    outcomeKey.includes("ERROR") ||
    outcomeKey.includes("FAULT");

  if (isError) return opp;

  // 2. Check Hard Wins (Point to Actor)
  const isHardWin =
    outcomeKey === "POINT" ||
    outcomeKey === "WIN" ||
    outcomeKey === "ACE" ||
    outcomeKey === "KILL" ||
    outcomeKey === "BLOCK_POINT" ||
    outcomeKey === "STUFF" ||
    outcomeKey === "KILL_BLOCK";

  if (isHardWin) return acting;

  // 3. Handle Ambiguous "SUCCESS" (Legacy support)
  // New neutral types (IN_PLAY, TOUCH, GOOD, PERFECT) return null automatically here.
  if (outcomeKey === "SUCCESS") {
    const isServe = skillKey.includes("SERVE");
    const isAttack = skillKey.includes("ATTACK") || skillKey.includes("SPIKE") || skillKey === "HIT";
    const isBlock = skillKey.includes("BLOCK");
    
    // In strict scoring, SUCCESS usually implies point for Serve/Attack/Block 
    // unless you specifically use IN_PLAY/TOUCH for those scenarios.
    if (isServe || isAttack || isBlock) return acting;
  }

  return null; // Rally continues
}

export type ActionEvent = {
  id: string;
  ts: number;
  teamId: TeamId;
  playerId: string;
  slot: RotationSlot;
  skill: Skill;
  outcome: Outcome;
  pointWinner?: TeamId; 
};