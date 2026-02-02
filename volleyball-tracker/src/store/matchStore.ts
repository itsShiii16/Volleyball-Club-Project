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
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s-]+/g, "_");

// Rotation order used everywhere
const ROTATION_ORDER: RotationSlot[] = [1, 6, 5, 4, 3, 2];

// Forward rotation = "shift right by 1"
const rotateCourtForward = (court: CourtState): CourtState => {
  const next: CourtState = { ...court };
  const current = ROTATION_ORDER.map((s) => next[s]);
  current.unshift(current.pop()!);
  ROTATION_ORDER.forEach((s, idx) => {
    next[s] = current[idx] ?? null;
  });
  return next;
};

// Backward rotation = inverse (shift left by 1)
const rotateCourtBackward = (court: CourtState): CourtState => {
  const next: CourtState = { ...court };
  const current = ROTATION_ORDER.map((s) => next[s]);
  current.push(current.shift()!);
  ROTATION_ORDER.forEach((s, idx) => {
    next[s] = current[idx] ?? null;
  });
  return next;
};

/** Court rules helpers */
const isFrontRowSlot = (slot: RotationSlot) => slot === 2 || slot === 3 || slot === 4;

const isLiberoPlayer = (p: Player | null | undefined) => {
  const pos = normKey(p?.position ?? "");
  return pos === "L" || pos === "LIBERO";
};

const hasIllegalLiberoFrontRow = (court: CourtState, players: Player[]) => {
  const frontSlots: RotationSlot[] = [2, 3, 4];
  for (const s of frontSlots) {
    const pid = court[s];
    if (!pid) continue;
    const p = players.find((x) => x.id === pid);
    if (p && isLiberoPlayer(p)) return true;
  }
  return false;
};

// Skill classification
const isBlockSkill = (skill: Skill) => normKey(skill).includes("BLOCK");
const isServeSkill = (skill: Skill) => normKey(skill).includes("SERVE");
const isSpikeSkill = (skill: Skill) => {
  const k = normKey(skill);
  return k.includes("SPIKE") || k.includes("ATTACK") || k === "HIT";
};

type ToastType = "info" | "warn" | "error";

export type ToastState = {
  id: string;
  message: string;
  type: ToastType;
};

const makeToast = (message: string, type: ToastType = "warn"): ToastState => ({
  id: crypto.randomUUID(),
  message,
  type,
});

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

  skillKey: string;
  outcomeKey: string;
};

type MatchStore = {
  // Rosters
  players: Player[];

  // Courts
  courtA: CourtState;
  courtB: CourtState;

  // Which team is drawn on the LEFT side of the court
  leftTeam: TeamId;
  setLeftTeam: (teamId: TeamId) => void;
  swapSides: () => void;

  // UI selection
  selected: { teamId: TeamId; slot: RotationSlot; mode?: "default" | "bench" } | null;
  selectSlot: (teamId: TeamId, slot: RotationSlot, mode?: "default" | "bench") => void;
  clearSelection: () => void;

  // Toasts (UI feedback for rule blocks)
  toast: ToastState | null;
  setToast: (message: string, type?: ToastType) => void;
  clearToast: () => void;

  // Roster actions
  setPlayers: (players: Player[]) => void;
  addPlayer: (player: Player) => void;
  updatePlayer: (id: string, patch: Partial<Player>) => void;
  removePlayer: (id: string) => void;

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
    (set, get) => {
      // Rotation direction depends on WHICH SIDE the team is on
      const isTeamOnLeft = (teamId: TeamId) => get().leftTeam === teamId;

      const rotateForwardForTeam = (teamId: TeamId, court: CourtState) =>
        isTeamOnLeft(teamId) ? rotateCourtForward(court) : rotateCourtBackward(court);

      const rotateBackwardForTeam = (teamId: TeamId, court: CourtState) =>
        isTeamOnLeft(teamId) ? rotateCourtBackward(court) : rotateCourtForward(court);

      return {
        players: [],
        courtA: emptyCourt(),
        courtB: emptyCourt(),

        // Default layout: A on left, B on right
        leftTeam: "A",
        setLeftTeam: (teamId) => set({ leftTeam: teamId }),
        swapSides: () => set((state) => ({ leftTeam: state.leftTeam === "A" ? "B" : "A" })),

        selected: null,
        selectSlot: (teamId, slot, mode = "default") => set({ selected: { teamId, slot, mode } }),
        clearSelection: () => set({ selected: null }),

        // Toasts (not persisted)
        toast: null,
        setToast: (message, type = "warn") => set({ toast: makeToast(message, type) }),
        clearToast: () => set({ toast: null }),

        // Roster actions
        setPlayers: (players) => set({ players }),
        addPlayer: (player) => set((state) => ({ players: [...state.players, player] })),
        updatePlayer: (id, patch) =>
          set((state) => ({
            players: state.players.map((p) => (p.id === id ? { ...p, ...patch } : p)),
          })),
        removePlayer: (id) => set((state) => ({ players: state.players.filter((p) => p.id !== id) })),

        // Court slot actions
        assignPlayerToSlot: (teamId, slot, playerId) =>
          set((state) => {
            const key: "courtA" | "courtB" = teamId === "A" ? "courtA" : "courtB";
            const court: CourtState = { ...state[key] };

            // Prevent duplicates on same team's court
            const alreadyOnCourt = Object.values(court).includes(playerId);
            if (alreadyOnCourt) {
              return {
                ...state,
                toast: makeToast("That player is already on the court.", "info"),
              };
            }

            // RULE: Libero cannot be assigned to front row
            const p = state.players.find((x) => x.id === playerId) || null;
            if (p && isLiberoPlayer(p) && isFrontRowSlot(slot)) {
              return {
                ...state,
                toast: makeToast("Illegal assignment: Libero cannot be placed in the front row.", "error"),
              };
            }

            court[slot] = playerId;

            // Extra safety
            if (hasIllegalLiberoFrontRow(court, state.players)) {
              return {
                ...state,
                toast: makeToast("Illegal state prevented: Libero cannot be in the front row.", "error"),
              };
            }

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

        // Manual rotations (direction depends on side)
        rotateTeam: (teamId) =>
          set((state) => {
            const key: "courtA" | "courtB" = teamId === "A" ? "courtA" : "courtB";
            const court = teamId === "A" ? state.courtA : state.courtB;

            const rotated = rotateForwardForTeam(teamId, court);

            if (hasIllegalLiberoFrontRow(rotated, state.players)) {
              return {
                ...state,
                toast: makeToast("Illegal rotation: Libero cannot rotate into the front row.", "error"),
              };
            }

            return { ...state, [key]: rotated };
          }),

        rotateTeamBackward: (teamId) =>
          set((state) => {
            const key: "courtA" | "courtB" = teamId === "A" ? "courtA" : "courtB";
            const court = teamId === "A" ? state.courtA : state.courtB;

            const rotated = rotateBackwardForTeam(teamId, court);

            if (hasIllegalLiberoFrontRow(rotated, state.players)) {
              return {
                ...state,
                toast: makeToast("Illegal rotation: Libero cannot rotate into the front row.", "error"),
              };
            }

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

            const player = state.players.find((p) => p.id === playerId) || null;
            const libero = isLiberoPlayer(player);
            const frontRow = isFrontRowSlot(slot);

            const skillKey = normKey(skill);

            // ✅ RULE: Back-row cannot block
            if (isBlockSkill(skill) && !frontRow) {
              return {
                ...state,
                toast: makeToast("Illegal action: Back-row players cannot block.", "error"),
              };
            }

            // ✅ RULE: Libero cannot serve/spike/block
            if (libero && (isBlockSkill(skill) || isServeSkill(skill) || isSpikeSkill(skill))) {
              return {
                ...state,
                toast: makeToast("Illegal action: Libero cannot serve, spike, or block.", "error"),
              };
            }

            const outcomeKey = normKey(outcome);

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
                "SUCCESS",
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

              const isServe = isServeSkill(skill);
              const isSpike = isSpikeSkill(skill);
              const isBlock = isBlockSkill(skill);

              // Only these skills can directly award a rally point
              if ((isServe || isSpike || isBlock) && isWin) {
                pointWinner = teamId;
              }
            }

            const prevScoreA = state.scoreA;
            const prevScoreB = state.scoreB;
            const prevServingTeam = state.servingTeam;

            let nextScoreA = state.scoreA;
            let nextScoreB = state.scoreB;
            let nextServingTeam = state.servingTeam;

            let nextCourtA = state.courtA;
            let nextCourtB = state.courtB;

            let didSideoutRotate = false;
            let toast: ToastState | null = null;

            if (pointWinner) {
              if (pointWinner === "A") nextScoreA += 1;
              else nextScoreB += 1;

              // Side-out: winner gains serve and rotates (if legal)
              if (pointWinner !== state.servingTeam) {
                nextServingTeam = pointWinner;

                if (pointWinner === "A") {
                  const rotated = rotateForwardForTeam("A", state.courtA);
                  if (!hasIllegalLiberoFrontRow(rotated, state.players)) {
                    didSideoutRotate = true;
                    nextCourtA = rotated;
                  } else {
                    toast = makeToast(
                      "Side-out rotation blocked: Libero cannot rotate into the front row.",
                      "warn"
                    );
                  }
                } else {
                  const rotated = rotateForwardForTeam("B", state.courtB);
                  if (!hasIllegalLiberoFrontRow(rotated, state.players)) {
                    didSideoutRotate = true;
                    nextCourtB = rotated;
                  } else {
                    toast = makeToast(
                      "Side-out rotation blocked: Libero cannot rotate into the front row.",
                      "warn"
                    );
                  }
                }
              }
            }

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
              toast: toast ?? state.toast,
            };
          }),

        undoLastEvent: () =>
          set((state) => {
            if (state.events.length === 0) return state;

            const [last, ...rest] = state.events;

            let nextCourtA = state.courtA;
            let nextCourtB = state.courtB;

            if (last.didSideoutRotate && last.pointWinner) {
              if (last.pointWinner === "A") nextCourtA = rotateBackwardForTeam("A", state.courtA);
              else nextCourtB = rotateBackwardForTeam("B", state.courtB);
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
            courtA: emptyCourt(),
            courtB: emptyCourt(),
            selected: null,
            activeScoresheet: null,
            events: [],
            scoreA: 0,
            scoreB: 0,
            servingTeam: "A",
            toast: null,
          })),
      };
    },
    {
      name: "vb-match-store",
      version: 1,
      partialize: (state) => ({
        players: state.players,
        courtA: state.courtA,
        courtB: state.courtB,
        scoreA: state.scoreA,
        scoreB: state.scoreB,
        servingTeam: state.servingTeam,
        events: state.events,
        leftTeam: state.leftTeam,
        // toast intentionally NOT persisted
      }),
    }
  )
);
