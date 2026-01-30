export type TeamSide = "left" | "right";
export type TeamId = "A" | "B";

export type Position = "WS" | "MB" | "S" | "L";

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

export type Skill = "RECEIVE" | "DIG" | "BLOCK" | "SPIKE" | "SERVE" | "SET";

export type Outcome =
  | "PERFECT" // perfect receive / perfect set
  | "SUCCESS" // kill / ace / kill block / dig
  | "ERROR";  // error

export type ActionEvent = {
  id: string;
  ts: number;
  teamId: TeamId;
  playerId: string;
  slot: RotationSlot;
  skill: Skill;
  outcome: Outcome;
  pointForTeam?: TeamId; // optional (we can use later when you track rally points)
};
