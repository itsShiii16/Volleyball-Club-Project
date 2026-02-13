// lib/volleyball.ts

export type TeamSide = "left" | "right";
export type TeamId = "A" | "B";

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

export type RotationSlot = 1 | 2 | 3 | 4 | 5 | 6;

export const slotLabel: Record<RotationSlot, string> = {
  1: "BR", 2: "FR", 3: "FM", 4: "FL", 5: "BL", 6: "BM",
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
  | "SERVE" | "RECEIVE" | "RECEPTION" | "PASS" | "DIG" | "SET"
  | "SPIKE" | "ATTACK" | "HIT" | "BLOCK";

export type Outcome =
  | "PERFECT" 
  | "GOOD"
  | "SUCCESS" 
  | "IN_PLAY"
  | "TOUCH"
  | "POINT" 
  | "WIN" 
  | "ACE_ERROR"
  | "KILL_ERROR" // ✅ ADDED
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
  "ERROR", "FAULT", "OUT", "NET", "ATTACK_ERROR", "SERVE_ERROR", "SERVICE_ERROR", "BLOCK_ERROR", "RECEIVE_ERROR", "DIG_ERROR",
] as const;

export const WIN_OUTCOME_KEYS = [
  "POINT", "WIN", "ACE", "KILL", "BLOCK_POINT", "STUFF", "KILL_BLOCK", "SUCCESS", 
] as const;

export function resolvePointWinner(input: {
  actingTeam: TeamId;
  skill: Skill;
  outcome: Outcome;
}): TeamId | null {
  const acting = input.actingTeam;
  const opp: TeamId = acting === "A" ? "B" : "A";
  const outcomeKey = String(input.outcome).toUpperCase();

  // 1. Errors (Point to Opponent)
  if (
    outcomeKey === "ERROR" || outcomeKey === "FAULT" || 
    outcomeKey === "OUT" || outcomeKey === "NET" || 
    outcomeKey.includes("ERROR")
  ) {
    // EXCEPTIONS: These are wins for the actor, waiting for the opponent's error log.
    if (outcomeKey === "ACE_ERROR") return null; 
    if (outcomeKey === "KILL_ERROR") return null; 
    return opp;
  }

  // 2. Hard Wins (Point to Actor)
  if (
    outcomeKey === "POINT" || outcomeKey === "WIN" || 
    outcomeKey === "ACE" || outcomeKey === "KILL" || 
    outcomeKey === "BLOCK_POINT"
  ) {
    return acting;
  }

  // 3. Deferrals
  if (outcomeKey === "ACE_ERROR" || outcomeKey === "KILL_ERROR") {
      return null; 
  }

  return null;
}

export type ActionEvent = {
  id: string; ts: number; teamId: TeamId; playerId: string; slot: RotationSlot; skill: Skill; outcome: Outcome; pointWinner?: TeamId; 
};