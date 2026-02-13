// lib/statemachine.ts
import type { Skill, TeamId, ActionEvent } from "./volleyball";

type FlowState = {
  allowedSkills: Skill[];
  nextTeam: "SAME" | "OPPONENT";
};

// Standard flow for when the ball stays in play (Rally continues)
const STANDARD_FLOW: Partial<Record<Skill, FlowState>> = {
  SERVE: { allowedSkills: ["RECEIVE"], nextTeam: "OPPONENT" }, 
  RECEIVE: { allowedSkills: ["SET"], nextTeam: "SAME" }, 
  SET: { allowedSkills: ["SPIKE", "ATTACK"], nextTeam: "SAME" },
  SPIKE: { allowedSkills: ["DIG", "BLOCK"], nextTeam: "OPPONENT" },
  ATTACK: { allowedSkills: ["DIG", "BLOCK"], nextTeam: "OPPONENT" },
  BLOCK: { allowedSkills: ["DIG"], nextTeam: "SAME" }, 
  DIG: { allowedSkills: ["SET"], nextTeam: "SAME" },
};

export function getValidNextState(
  lastEvent: ActionEvent | undefined, 
  servingTeam: TeamId
): { allowedSkills: Skill[]; actingTeam: TeamId; waitingMessage?: string } {
  
  if (!lastEvent) {
    return {
      allowedSkills: ["SERVE"],
      actingTeam: servingTeam,
      waitingMessage: "Waiting for Serve..."
    };
  }

  const { skill, outcome, teamId } = lastEvent;
  const skillKey = String(skill).toUpperCase() as Skill;
  const outcomeKey = String(outcome).toUpperCase();

  // --- SERVE LOGIC ---
  if (skillKey === "SERVE") {
    // 1. Clean Ace -> End Rally (Point) -> Serve Again
    if (outcomeKey === "ACE") {
       return { allowedSkills: ["SERVE"], actingTeam: teamId, waitingMessage: "Clean Ace! Serve again." };
    }
    // 2. Ace Error -> Pass to Opponent (to log Receive Error)
    if (outcomeKey === "ACE_ERROR") {
       return { allowedSkills: ["RECEIVE"], actingTeam: teamId === "A" ? "B" : "A", waitingMessage: "Select the receiver to log the error." };
    }
    // 3. Serve Error -> End Rally (Sideout)
    if (outcomeKey.includes("ERROR") || outcomeKey.includes("FAULT") || outcomeKey.includes("OUT") || outcomeKey.includes("NET")) {
       return { allowedSkills: ["SERVE"], actingTeam: teamId === "A" ? "B" : "A", waitingMessage: "Service Error. Sideout." };
    }
  }

  // --- RECEIVE LOGIC ---
  if (skillKey === "RECEIVE") {
      // 1. Error -> Point Server
      if (outcomeKey.includes("ERROR") || outcomeKey.includes("FAULT")) {
          // Rally ends, point awarded to server. Server serves again.
          const serverTeam = teamId === "A" ? "B" : "A";
          return { allowedSkills: ["SERVE"], actingTeam: serverTeam, waitingMessage: "Receive Error. Point Server." };
      }

      // 2. Attempt/Overpass -> Opponent
      if (outcomeKey === "SUCCESS" || outcomeKey === "ATTEMPT" || outcomeKey === "IN_PLAY") {
          return {
              allowedSkills: ["DIG", "SET", "ATTACK", "BLOCK"], 
              actingTeam: teamId === "A" ? "B" : "A",
              waitingMessage: "Overpass! Opponent possession."
          };
      }

      // 3. Perfect/Excellent -> Possession Stays
      if (outcomeKey === "PERFECT" || outcomeKey === "EXCELLENT" || outcomeKey === "GOOD") {
          return {
              allowedSkills: ["SET", "ATTACK", "SPIKE"],
              actingTeam: teamId,
              waitingMessage: "Perfect Pass. Transition."
          };
      }
  }

  // --- ATTACK / SPIKE LOGIC ---
  if (skillKey === "SPIKE" || skillKey === "ATTACK") {
      // 1. Kill Error -> Pass to Opponent
      if (outcomeKey === "KILL_ERROR") {
          return {
              allowedSkills: ["DIG", "BLOCK"],
              actingTeam: teamId === "A" ? "B" : "A",
              waitingMessage: "Select the opponent who committed the error."
          };
      }
      
      // 2. Standard Kill -> End Rally -> Serve Again
      if (outcomeKey.includes("KILL") || outcomeKey.includes("POINT")) {
          return { allowedSkills: ["SERVE"], actingTeam: teamId, waitingMessage: "Kill! Serve again." };
      }
  }

  // --- TERMINATION (Generic) ---
  if (
    outcomeKey.includes("KILL") || 
    outcomeKey.includes("POINT") || 
    outcomeKey.includes("ERROR") || 
    outcomeKey.includes("OUT") || 
    outcomeKey.includes("NET")
  ) {
    // ✅ FIX: Allow the NEXT SERVE to happen immediately.
    // The Store has already updated the servingTeam to the winner of this rally.
    // We just need to tell the UI "It's the (new) Server's turn".
    return { 
        allowedSkills: ["SERVE"], 
        actingTeam: servingTeam, // This comes from the store's current state
        waitingMessage: "Point Awarded. Next Serve." 
    };
  }

  // --- STANDARD FLOW ---
  const rule = STANDARD_FLOW[skillKey];
  if (!rule) {
    return { allowedSkills: ["SERVE", "RECEIVE", "SET", "SPIKE", "DIG", "BLOCK"], actingTeam: teamId };
  }

  const nextTeam = rule.nextTeam === "OPPONENT" ? (teamId === "A" ? "B" : "A") : teamId;
  return { allowedSkills: rule.allowedSkills, actingTeam: nextTeam };
}

export function isActionAllowed(
  skill: Skill, 
  teamId: TeamId, 
  validState: { allowedSkills: Skill[]; actingTeam: TeamId }
) {
  if (teamId !== validState.actingTeam) return false;
  const checkSkill = (skill === "ATTACK") ? "SPIKE" : skill;
  return validState.allowedSkills.includes(checkSkill);
}