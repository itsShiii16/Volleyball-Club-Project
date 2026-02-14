// lib/volleyball.ts

export type TeamSide = "left" | "right";
export type TeamId = "A" | "B";

/**
 * Positions
 */
export type Position = "OH" | "OPP" | "MB" | "S" | "L" | "WS" | "DS";

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
  | "BLOCK"
  | "SUBSTITUTION";

/**
 * ✅ Outcomes
 */
export type Outcome =
  | "PERFECT"
  | "GOOD"        
  | "SUCCESS"
  | "IN_PLAY"     
  | "POOR"        
  | "TOUCH"       
  | "SLASH"       
  | "OVERPASS"    
  | "POINT"
  | "WIN"
  | "ACE"
  | "ACE_FORCED"  // ✅ NEW: Ace causing error
  | "KILL"
  | "KILL_FORCED" // ✅ NEW: Kill causing error (Tool/Shank)
  | "BLOCK_POINT"
  | "STUFF"       
  | "KILL_BLOCK"  
  | "ERROR"
  | "FAULT"
  | "OUT"
  | "NET"
  | "BLOCKED"     
  | "None";       

export const ERROR_OUTCOME_KEYS = [
  "ERROR",
  "FAULT",
  "OUT",
  "NET",
  "BLOCKED",
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
    outcomeKey.includes("ERROR") ||
    outcomeKey.includes("FAULT") ||
    outcomeKey === "OUT" ||
    outcomeKey === "NET" ||
    outcomeKey === "BLOCKED";

  if (isError) return opp;

  // 2. Check Hard Wins (Point to Actor)
  const isHardWin =
    outcomeKey === "POINT" ||
    outcomeKey === "WIN" ||
    (outcomeKey === "ACE" && !outcomeKey.includes("FORCED")) || // Clean Ace only
    (outcomeKey === "KILL" && !outcomeKey.includes("FORCED")) || // Clean Kill only
    outcomeKey === "BLOCK_POINT" ||
    outcomeKey === "STUFF" ||
    outcomeKey === "KILL_BLOCK";

  if (isHardWin) return acting;

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
  pointWinner?: TeamId;
};