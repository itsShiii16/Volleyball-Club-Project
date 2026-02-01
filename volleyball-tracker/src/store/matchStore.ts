import { create } from "zustand";
import { persist } from "zustand/middleware";

import type {
  CourtState,
  Player,
  RotationSlot,
  TeamId,
  Skill,
  Outcome,
} from "@/lib/volleyball";

const emptyCourt = (): CourtState => ({
  1: null,
  2: null,
  3: null,
  4: null,
  5: null,
  6: null,
});

const opponentOf = (teamId: TeamId): TeamId => (teamId === "A" ? "B" : "A");

// Normalize enums/unions/strings into stable keys
const normKey = (v: unknown) =>
  String(v)
    .trim()
    .toUpperCase()
    .replace(/[^\w\s-]/g, "") // remove punctuation
    .replace(/[\s-]+/g, "_"); // spaces/dashes -> underscore

// Rotation order used everywhere
const ROTATION_ORDER: RotationSlot[] = [1, 6, 5, 4, 3, 2];

// Forward rotation = "shift right by 1" (matches your original)
const rotateCourtForward = (court: CourtState): CourtState => {
  const next: CourtState = { ...court };
  const current = ROTATION_ORDER.map((s) => next[s]);
  current.unshift(current.pop()!); // right shift
  ROTATION_ORDER.forEach((s, idx) => {
    next[s] = current[idx] ?? null;
  });
  return next;
};

// Backward rotation = inverse of forward (shift left by 1)
const rotateCourtBackward = (court: CourtState): CourtState => {
  const next: CourtState = { ...court };
  const current = ROTATION_ORDER.map((s) => next[s]);
  current.push(current.shift()!); // left shift
  ROTATION_ORDER.forEach((s, idx) => {
    next[s] = current[idx] ?? null;
  });
  return next;
};

/**
 * IMPORTANT:
 * Team B is drawn on the RIGHT facing left, so to make rotation look correct on screen
 * we rotate Team B in the opposite direction compared to Team A.
 */
const rotateForwardForTeam = (teamId: TeamId, court: CourtState): CourtState =>
  teamId === "A" ? rotateCourtForward(court) : rotateCourtBackward(court);

const rotateBackwardForTeam = (teamId: TeamId, court: CourtState): CourtState =>
  teamId === "A" ? rotateCourtBackward(court) : rotateCourtForward(court);

/**
 * Internal event stores enough metadata to UNDO scoring + sideout rotation.
 */
type InternalEvent = {
  id: string;
  ts: number;
  teamId: TeamId;
  playerId: string;
  slot: RotationSlot;
  skill: Skill;
  outcome: Outcome;

  pointWinner?: TeamId;
  prevScoreA: number;
  prevScoreB: number;
  prevServingTeam: TeamId;
  didSideoutRotate: boolean;

  // debug helpers
  skillKey: string;
  outcomeKey: string;
};

type MatchStore = {
  // Rosters
  players: Player[];

  // On-court assignments per team
  courtA: CourtState;
  courtB: CourtState;

  // UI selection
  selected: { teamId: TeamId; slot: RotationSlot; mode?: "default" | "bench" } | null;

  // Roster actions (UI-driven)
  setPlayers: (players: Player[]) => void;
  addPlayer: (player: Player) => void;
  updatePlayer: (id: string, patch: Partial<Player>) => void;
  removePlayer: (id: string) => void;

  // Slot selection actions
  selectSlot: (teamId: TeamId, slot: RotationSlot, mode?: "default" | "bench") => void;
  clearSelection: () => void;

  // Court slot actions
  assignPlayerToSlot: (teamId: TeamId, slot: RotationSlot, playerId: string) => void;
  substituteInSlot: (teamId: TeamId, slot: RotationSlot, newPlayerId: string) => void;
  clearSlot: (teamId: TeamId, slot: RotationSlot) => void;

  // Helpers
  getOnCourtPlayerIds: (teamId: TeamId) => string[];

  // Rotation
  rotateTeam: (teamId: TeamId) => void;
  rotateTeamBackward: (teamId: TeamId) => void;

  // Scoresheet UI
  activeScoresheet: { teamId: TeamId; slot: RotationSlot } | null;
  openScoresheet: (teamId: TeamId, slot: RotationSlot) => void;
  closeScoresheet: () => void;

  // SCOREBOARD
  scoreA: number;
  scoreB: number;
  servingTeam: TeamId;
  setServingTeam: (teamId: TeamId) => void;

  // Event log
  events: InternalEvent[];
  logEvent: (input: { teamId: TeamId; slot: RotationSlot; skill: Skill; outcome: Outcome }) => void;
  undoLastEvent: () => void;

  // Resets
  resetCourt: (teamId: TeamId) => void;
  resetMatch: () => void;
};

export const useMatchStore = create<MatchStore>()(
  persist(
    (set, get) => ({
      // Rosters
      players: [],

      // Courts
      courtA: emptyCourt(),
      courtB: emptyCourt(),

      // UI selection
      selected: null,

      // Roster actions
      setPlayers: (players) => set({ players }),
      addPlayer: (player) => set((state) => ({ players: [...state.players, player] })),
      updatePlayer: (id, patch) =>
        set((state) => ({
          players: state.players.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),
      removePlayer: (id) => set((state) => ({ players: state.players.filter((p) => p.id !== id) })),

      // Slot selection
      selectSlot: (teamId, slot, mode = "default") =>
      set({ selected: { teamId, slot, mode } }),
      clearSelection: () => set({ selected: null }),

      // Court slot actions
      assignPlayerToSlot: (teamId, slot, playerId) =>
        set((state) => {
          const key: "courtA" | "courtB" = teamId === "A" ? "courtA" : "courtB";
          const court: CourtState = { ...state[key] };

          // Prevent duplicates on same team's court
          const alreadyOnCourt = Object.values(court).includes(playerId);
          if (alreadyOnCourt) return state;

          court[slot] = playerId;
          return { ...state, [key]: court };
        }),

      substituteInSlot: (teamId, slot, newPlayerId) => {
        get().assignPlayerToSlot(teamId, slot, newPlayerId);
      },

      clearSlot: (teamId, slot) =>
        set((state) => {
          const key: "courtA" | "courtB" = teamId === "A" ? "courtA" : "courtB";
          const court: CourtState = { ...state[key] };
          court[slot] = null;
          return { ...state, [key]: court };
        }),

      // Helpers
      getOnCourtPlayerIds: (teamId) => {
        const state = get();
        const court = teamId === "A" ? state.courtA : state.courtB;
        return Object.values(court).filter(Boolean) as string[];
      },

      // Rotation (manual) — mirrored for Team B
      rotateTeam: (teamId) =>
        set((state) => {
          const key: "courtA" | "courtB" = teamId === "A" ? "courtA" : "courtB";
          const court = teamId === "A" ? state.courtA : state.courtB;
          const rotated = rotateForwardForTeam(teamId, court);
          return { ...state, [key]: rotated };
        }),

      rotateTeamBackward: (teamId) =>
        set((state) => {
          const key: "courtA" | "courtB" = teamId === "A" ? "courtA" : "courtB";
          const court = teamId === "A" ? state.courtA : state.courtB;
          const rotated = rotateBackwardForTeam(teamId, court);
          return { ...state, [key]: rotated };
        }),

      // Scoresheet UI
      activeScoresheet: null,
      openScoresheet: (teamId, slot) => set({ activeScoresheet: { teamId, slot } }),
      closeScoresheet: () => set({ activeScoresheet: null }),

      // SCOREBOARD
      scoreA: 0,
      scoreB: 0,
      servingTeam: "A",
      setServingTeam: (teamId) => set({ servingTeam: teamId }),

      // Event log
      events: [],

      logEvent: ({ teamId, slot, skill, outcome }) =>
        set((state) => {
          const court = teamId === "A" ? state.courtA : state.courtB;
          const playerId = court[slot];
          if (!playerId) return state;

          // Normalize once (IMPORTANT: your UI uses SUCCESS a lot)
          const skillKey = normKey(skill);
          const outcomeKey = normKey(outcome);

          // --- Point decision (skill + outcome) ---
          let pointWinner: TeamId | undefined;

          const ERROR_OUTCOMES = new Set([
            "ERROR",
            "ATTACK_ERROR",
            "SERVE_ERROR",
            "SERVICE_ERROR",
            "BLOCK_ERROR",
            "RECEIVE_ERROR",
            "DIG_ERROR",
            "FAULT",
            "OUT",
            "NET",
          ]);

          const isError =
            ERROR_OUTCOMES.has(outcomeKey) ||
            outcomeKey.includes("ERROR") ||
            outcomeKey.includes("FAULT");

          if (isError) {
            pointWinner = opponentOf(teamId);
          } else {
            const WIN_OUTCOMES = new Set([
              "SUCCESS", // <- your buttons send this
              "KILL",
              "KILL_BLOCK",
              "ACE",
              "POINT",
              "WIN",
              "STUFF",
              "BLOCK_POINT",
            ]);

            const isWin =
              WIN_OUTCOMES.has(outcomeKey) ||
              outcomeKey.includes("KILL") ||
              outcomeKey.includes("ACE");

            const isServe = skillKey.includes("SERVE");
            const isSpike =
              skillKey.includes("SPIKE") ||
              skillKey.includes("ATTACK") ||
              skillKey === "HIT";
            const isBlock = skillKey.includes("BLOCK");

            // Only these skills can directly award a rally point
            if ((isServe || isSpike || isBlock) && isWin) {
              pointWinner = teamId;
            }
          }

          // --- Snapshot for undo ---
          const prevScoreA = state.scoreA;
          const prevScoreB = state.scoreB;
          const prevServingTeam = state.servingTeam;

          let nextScoreA = state.scoreA;
          let nextScoreB = state.scoreB;
          let nextServingTeam = state.servingTeam;

          let nextCourtA = state.courtA;
          let nextCourtB = state.courtB;

          let didSideoutRotate = false;

          // --- Apply scoring + sideout (rotation mirrored for Team B) ---
          if (pointWinner) {
            if (pointWinner === "A") nextScoreA += 1;
            else nextScoreB += 1;

            // Side-out: if winner wasn't serving, they gain serve and rotate
            if (pointWinner !== state.servingTeam) {
              didSideoutRotate = true;
              nextServingTeam = pointWinner;

              if (pointWinner === "A") {
                nextCourtA = rotateForwardForTeam("A", state.courtA);
              } else {
                nextCourtB = rotateForwardForTeam("B", state.courtB);
              }
            }
          }

          // --- Log event (must include skillKey/outcomeKey) ---
          const e: InternalEvent = {
            id: crypto.randomUUID(),
            ts: Date.now(),
            teamId,
            playerId,
            slot,
            skill,
            outcome,
            pointWinner,
            prevScoreA,
            prevScoreB,
            prevServingTeam,
            didSideoutRotate,
            skillKey,
            outcomeKey,
          };

          return {
            ...state,
            scoreA: nextScoreA,
            scoreB: nextScoreB,
            servingTeam: nextServingTeam,
            courtA: nextCourtA,
            courtB: nextCourtB,
            events: [e, ...state.events],
          };
        }),

      undoLastEvent: () =>
        set((state) => {
          if (state.events.length === 0) return state;

          const [last, ...rest] = state.events;

          let nextCourtA = state.courtA;
          let nextCourtB = state.courtB;

          // If last event caused sideout rotation, undo it (mirrored for Team B)
          if (last.didSideoutRotate && last.pointWinner) {
            if (last.pointWinner === "A") {
              nextCourtA = rotateBackwardForTeam("A", state.courtA);
            } else {
              nextCourtB = rotateBackwardForTeam("B", state.courtB);
            }
          }

          return {
            ...state,
            scoreA: last.prevScoreA,
            scoreB: last.prevScoreB,
            servingTeam: last.prevServingTeam,
            courtA: nextCourtA,
            courtB: nextCourtB,
            events: rest,
          };
        }),

      // Resets
      resetCourt: (teamId) =>
        set((state) => {
          if (teamId === "A") return { ...state, courtA: emptyCourt() };
          return { ...state, courtB: emptyCourt() };
        }),

      resetMatch: () =>
        set((state) => ({
          ...state,
          // keep roster, but clear match state
          courtA: emptyCourt(),
          courtB: emptyCourt(),
          selected: null,
          activeScoresheet: null,
          events: [],
          scoreA: 0,
          scoreB: 0,
          servingTeam: "A",
        })),
    }),
    {
      name: "vb-match-store",
      version: 1,
      // Persist only what you need; avoids stale UI popups after refresh
      partialize: (state) => ({
        players: state.players,
        courtA: state.courtA,
        courtB: state.courtB,
        scoreA: state.scoreA,
        scoreB: state.scoreB,
        servingTeam: state.servingTeam,
        events: state.events,
      }),
    }
  )
);
