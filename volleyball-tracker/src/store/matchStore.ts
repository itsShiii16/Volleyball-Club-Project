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
const isFrontRowSlot = (slot: RotationSlot) =>
  slot === 2 || slot === 3 || slot === 4;
const isBackRowSlot = (slot: RotationSlot) =>
  slot === 1 || slot === 5 || slot === 6;

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
 * ✅ UPDATED (2-MB):
 * Libero auto-sub config:
 * - choose a Libero + TWO MBs they replace (alternating)
 * - enabled toggles feature per team
 */
type LiberoConfig = {
  enabled: boolean;
  liberoId: string | null;
  mbIds: string[]; // expects up to 2 MB ids
};

/**
 * ✅ UPDATED (2-MB):
 * Tracks an active libero swap for a team.
 * slot = where the Libero is currently playing IN PLACE of a specific MB.
 * replacedMbId = which MB is currently off-court due to the swap.
 */
type LiberoSwap = {
  active: boolean;
  slot: RotationSlot | null;
  liberoId: string | null;
  replacedMbId: string | null;
};

const defaultLiberoConfig = (): LiberoConfig => ({
  enabled: false,
  liberoId: null,
  mbIds: [],
});

const defaultLiberoSwap = (): LiberoSwap => ({
  active: false,
  slot: null,
  liberoId: null,
  replacedMbId: null,
});

// Slot mapping helper: where does a player move when a FORWARD rotation happens?
// Value at ROTATION_ORDER[i] moves to ROTATION_ORDER[(i+1) % len]
const mapSlotForward = (slot: RotationSlot): RotationSlot => {
  const idx = ROTATION_ORDER.indexOf(slot);
  if (idx < 0) return slot;
  return ROTATION_ORDER[(idx + 1) % ROTATION_ORDER.length];
};

// For BACKWARD rotation: value at ROTATION_ORDER[i] moves to ROTATION_ORDER[(i-1+len)%len]
const mapSlotBackward = (slot: RotationSlot): RotationSlot => {
  const idx = ROTATION_ORDER.indexOf(slot);
  if (idx < 0) return slot;
  return ROTATION_ORDER[
    (idx - 1 + ROTATION_ORDER.length) % ROTATION_ORDER.length
  ];
};

/**
 * ✅ UPDATED (2-MB):
 * Apply/maintain the libero swap for a given team:
 * - If swap is active, keep it consistent and end it when it reaches front row (MB returns).
 * - If swap is not active and config is enabled, start swap when ANY configured MB reaches back row.
 * - If BOTH MBs are in back row simultaneously, we pick in config order (mbIds[0] then mbIds[1]).
 */
function applyLiberoAutomation(params: {
  teamId: TeamId;
  court: CourtState;
  players: Player[];
  config: LiberoConfig;
  swap: LiberoSwap;
  rotationMapping?: "FORWARD" | "BACKWARD";
}): { court: CourtState; swap: LiberoSwap; toast?: ToastState } {
  const { court, players, config, teamId } = params;
  let nextCourt: CourtState = { ...court };
  let nextSwap: LiberoSwap = { ...params.swap };

  // Basic config gate
  if (!config.enabled || !config.liberoId || config.mbIds.length === 0) {
    if (nextSwap.active) nextSwap = defaultLiberoSwap();
    return { court: nextCourt, swap: nextSwap };
  }

  // Normalize mbIds: unique, max 2, non-empty
  const mbIds = Array.from(new Set(config.mbIds.filter(Boolean))).slice(0, 2);

  const libero = players.find((p) => p.id === config.liberoId) || null;
  const mbPlayers = mbIds
    .map((id) => players.find((p) => p.id === id) || null)
    .filter(Boolean) as Player[];

  if (!libero) {
    if (nextSwap.active) nextSwap = defaultLiberoSwap();
    return {
      court: nextCourt,
      swap: nextSwap,
      toast: makeToast("Libero config invalid: Libero not found.", "warn"),
    };
  }

  if (!isLiberoPlayer(libero)) {
    return {
      court: nextCourt,
      swap: defaultLiberoSwap(),
      toast: makeToast("Selected Libero is not a Libero position.", "warn"),
    };
  }

  if (mbPlayers.length === 0) {
    if (nextSwap.active) nextSwap = defaultLiberoSwap();
    return {
      court: nextCourt,
      swap: nextSwap,
      toast: makeToast("Libero config invalid: MB(s) not found.", "warn"),
    };
  }

  const findSlotOf = (pid: string) => {
    const entries = Object.entries(nextCourt) as Array<[string, string | null]>;
    const found = entries.find(([, v]) => v === pid);
    return found ? (Number(found[0]) as RotationSlot) : null;
  };

  // If a rotation happened, tracked swap slot should move too
  if (nextSwap.active && nextSwap.slot && params.rotationMapping) {
    nextSwap.slot =
      params.rotationMapping === "FORWARD"
        ? mapSlotForward(nextSwap.slot)
        : mapSlotBackward(nextSwap.slot);
  }

  // -------------------------
  // ACTIVE SWAP MAINTENANCE
  // -------------------------
  if (
    nextSwap.active &&
    nextSwap.slot &&
    nextSwap.liberoId &&
    nextSwap.replacedMbId
  ) {
    // If swap slot reached front row -> END swap: put MB back, libero out
    if (isFrontRowSlot(nextSwap.slot)) {
      if (nextCourt[nextSwap.slot] === nextSwap.liberoId) {
        nextCourt[nextSwap.slot] = nextSwap.replacedMbId;
      }
      const ended = defaultLiberoSwap();
      return {
        court: nextCourt,
        swap: ended,
        toast: makeToast(
          `Auto-sub: ${teamId} Libero out (MB returns to front row).`,
          "info"
        ),
      };
    }

    // Ensure libero is on tracked slot. If not, attempt repair.
    if (nextCourt[nextSwap.slot] !== nextSwap.liberoId) {
      // If replaced MB is in that slot, swap it back to libero
      if (nextCourt[nextSwap.slot] === nextSwap.replacedMbId) {
        nextCourt[nextSwap.slot] = nextSwap.liberoId;
      } else {
        // manual edits made it inconsistent -> drop swap
        nextSwap = defaultLiberoSwap();
      }
    }

    // Hard safety
    if (hasIllegalLiberoFrontRow(nextCourt, players)) {
      return {
        court,
        swap: defaultLiberoSwap(),
        toast: makeToast(
          "Illegal state prevented: Libero in front row.",
          "error"
        ),
      };
    }

    return { court: nextCourt, swap: nextSwap };
  }

  // -------------------------
  // START NEW SWAP (NOT ACTIVE)
  // -------------------------
  const liberoSlot = config.liberoId ? findSlotOf(config.liberoId) : null;

  // Only start swap if libero is NOT already on-court
  if (!liberoSlot) {
    // Find a candidate MB (in config order) that is on-court AND in back row
    let chosenMbId: string | null = null;
    let chosenMbSlot: RotationSlot | null = null;

    for (const mbId of mbIds) {
      const mbSlot = findSlotOf(mbId);
      if (mbSlot && isBackRowSlot(mbSlot)) {
        chosenMbId = mbId;
        chosenMbSlot = mbSlot;
        break;
      }
    }

    if (chosenMbId && chosenMbSlot) {
      // Replace that MB with Libero at that slot (MB goes “off-court”)
      nextCourt[chosenMbSlot] = config.liberoId;

      const started: LiberoSwap = {
        active: true,
        slot: chosenMbSlot,
        liberoId: config.liberoId,
        replacedMbId: chosenMbId,
      };

      if (hasIllegalLiberoFrontRow(nextCourt, players)) {
        return {
          court,
          swap: defaultLiberoSwap(),
          toast: makeToast(
            "Illegal state prevented: Libero in front row.",
            "error"
          ),
        };
      }

      // Nice message showing which MB got replaced (if we can find jersey)
      const mbP = players.find((p) => p.id === chosenMbId) || null;
      const mbLabel = mbP ? `#${mbP.jerseyNumber} ${mbP.name}` : "MB";

      return {
        court: nextCourt,
        swap: started,
        toast: makeToast(
          `Auto-sub: ${teamId} Libero in (replacing ${mbLabel} in back row).`,
          "info"
        ),
      };
    }
  }

  // Safety
  if (hasIllegalLiberoFrontRow(nextCourt, players)) {
    return {
      court,
      swap: defaultLiberoSwap(),
      toast: makeToast("Illegal state prevented: Libero in front row.", "error"),
    };
  }

  return { court: nextCourt, swap: nextSwap };
}

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
  selected: {
    teamId: TeamId;
    slot: RotationSlot;
    mode?: "default" | "bench";
  } | null;
  selectSlot: (
    teamId: TeamId,
    slot: RotationSlot,
    mode?: "default" | "bench"
  ) => void;
  clearSelection: () => void;

  // Toasts
  toast: ToastState | null;
  setToast: (message: string, type?: ToastType) => void;
  clearToast: () => void;

  // Libero automation (Phase 2 #4) - UPDATED
  liberoConfigA: LiberoConfig;
  liberoConfigB: LiberoConfig;
  setLiberoConfig: (teamId: TeamId, cfg: Partial<LiberoConfig>) => void;

  // internal tracking (not persisted) - UPDATED
  liberoSwapA: LiberoSwap;
  liberoSwapB: LiberoSwap;

  // Phase 2 #5 Rally helpers
  rallyCount: number;
  rallyInProgress: boolean;
  serviceRunTeam: TeamId;
  serviceRunCount: number;

  // Roster actions
  setPlayers: (players: Player[]) => void;
  addPlayer: (player: Player) => void;
  updatePlayer: (id: string, patch: Partial<Player>) => void;
  removePlayer: (id: string) => void;

  // Court slot actions
  assignPlayerToSlot: (
    teamId: TeamId,
    slot: RotationSlot,
    playerId: string
  ) => void;
  substituteInSlot: (
    teamId: TeamId,
    slot: RotationSlot,
    newPlayerId: string
  ) => void;
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
  logEvent: (input: {
    teamId: TeamId;
    slot: RotationSlot;
    skill: Skill;
    outcome: Outcome;
  }) => void;
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

      // IMPORTANT: mapping is for tracking swap.slot movement
      const rotationMappingForForward = (
        teamId: TeamId
      ): "FORWARD" | "BACKWARD" => (isTeamOnLeft(teamId) ? "FORWARD" : "BACKWARD");

      const rotationMappingForBackward = (
        teamId: TeamId
      ): "FORWARD" | "BACKWARD" => (isTeamOnLeft(teamId) ? "BACKWARD" : "FORWARD");

      const getConfig = (state: MatchStore, teamId: TeamId) =>
        teamId === "A" ? state.liberoConfigA : state.liberoConfigB;

      const getSwap = (state: MatchStore, teamId: TeamId) =>
        teamId === "A" ? state.liberoSwapA : state.liberoSwapB;

      const setSwapPatch = (teamId: TeamId, swap: LiberoSwap) => {
        if (teamId === "A") return { liberoSwapA: swap };
        return { liberoSwapB: swap };
      };

      return {
        players: [],
        courtA: emptyCourt(),
        courtB: emptyCourt(),

        leftTeam: "A",
        setLeftTeam: (teamId) => set({ leftTeam: teamId }),
        swapSides: () =>
          set((state) => ({ leftTeam: state.leftTeam === "A" ? "B" : "A" })),

        selected: null,
        selectSlot: (teamId, slot, mode = "default") =>
          set({ selected: { teamId, slot, mode } }),
        clearSelection: () => set({ selected: null }),

        toast: null,
        setToast: (message, type = "warn") => set({ toast: makeToast(message, type) }),
        clearToast: () => set({ toast: null }),

        // Libero automation (UPDATED)
        liberoConfigA: defaultLiberoConfig(),
        liberoConfigB: defaultLiberoConfig(),
        setLiberoConfig: (teamId, cfg) =>
          set((state) => {
            const sanitize = (c: Partial<LiberoConfig>) => {
              const next: Partial<LiberoConfig> = { ...c };
              if (Array.isArray(next.mbIds)) {
                next.mbIds = Array.from(new Set(next.mbIds.filter(Boolean))).slice(0, 2);
              }
              return next;
            };

            const patch = sanitize(cfg);

            if (teamId === "A") {
              return {
                ...state,
                liberoConfigA: { ...state.liberoConfigA, ...patch },
              };
            }
            return {
              ...state,
              liberoConfigB: { ...state.liberoConfigB, ...patch },
            };
          }),

        // internal swap trackers (UPDATED)
        liberoSwapA: defaultLiberoSwap(),
        liberoSwapB: defaultLiberoSwap(),

        // Rally helpers
        rallyCount: 0,
        rallyInProgress: false,
        serviceRunTeam: "A",
        serviceRunCount: 0,

        // Roster actions
        setPlayers: (players) => set({ players }),
        addPlayer: (player) => set((state) => ({ players: [...state.players, player] })),
        updatePlayer: (id, patch) =>
          set((state) => ({
            players: state.players.map((p) => (p.id === id ? { ...p, ...patch } : p)),
          })),
        removePlayer: (id) =>
          set((state) => ({ players: state.players.filter((p) => p.id !== id) })),

        // Court slot actions
        assignPlayerToSlot: (teamId, slot, playerId) =>
          set((state) => {
            const key: "courtA" | "courtB" = teamId === "A" ? "courtA" : "courtB";
            const court: CourtState = { ...state[key] };

            // Prevent duplicates on same team's court
            if (Object.values(court).includes(playerId)) {
              return { ...state, toast: makeToast("That player is already on the court.", "info") };
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

            // safety: never allow libero in front row
            if (hasIllegalLiberoFrontRow(court, state.players)) {
              return {
                ...state,
                toast: makeToast("Illegal state prevented: Libero cannot be in the front row.", "error"),
              };
            }

            // Apply auto-libero after assignment (so MB in back row can trigger swap)
            const cfg = getConfig(state, teamId);
            const swap = getSwap(state, teamId);

            const applied = applyLiberoAutomation({
              teamId,
              court,
              players: state.players,
              config: cfg,
              swap,
            });

            const next: any = {
              ...state,
              [key]: applied.court,
              ...setSwapPatch(teamId, applied.swap),
            };
            if (applied.toast) next.toast = applied.toast;
            return next;
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

        getOnCourtPlayerIds: (teamId) => {
          const state = get();
          const court = teamId === "A" ? state.courtA : state.courtB;
          return Object.values(court).filter(Boolean) as string[];
        },

        /**
         * ✅ PATCHED (kept):
         * We DO NOT block rotation BEFORE applying libero automation.
         */
        rotateTeam: (teamId) =>
          set((state) => {
            const key: "courtA" | "courtB" = teamId === "A" ? "courtA" : "courtB";
            const court = teamId === "A" ? state.courtA : state.courtB;

            // Step 1: rotate
            const rotated = rotateForwardForTeam(teamId, court);

            // Step 2: apply automation
            const cfg = getConfig(state, teamId);
            const swap = getSwap(state, teamId);
            const applied = applyLiberoAutomation({
              teamId,
              court: rotated,
              players: state.players,
              config: cfg,
              swap,
              rotationMapping: rotationMappingForForward(teamId),
            });

            // Step 3: final safety check
            if (hasIllegalLiberoFrontRow(applied.court, state.players)) {
              return {
                ...state,
                toast: makeToast("Illegal rotation: Libero cannot rotate into the front row.", "error"),
              };
            }

            const next: any = {
              ...state,
              [key]: applied.court,
              ...setSwapPatch(teamId, applied.swap),
            };
            if (applied.toast) next.toast = applied.toast;
            return next;
          }),

        rotateTeamBackward: (teamId) =>
          set((state) => {
            const key: "courtA" | "courtB" = teamId === "A" ? "courtA" : "courtB";
            const court = teamId === "A" ? state.courtA : state.courtB;

            // Step 1: rotate
            const rotated = rotateBackwardForTeam(teamId, court);

            // Step 2: apply automation
            const cfg = getConfig(state, teamId);
            const swap = getSwap(state, teamId);
            const applied = applyLiberoAutomation({
              teamId,
              court: rotated,
              players: state.players,
              config: cfg,
              swap,
              rotationMapping: rotationMappingForBackward(teamId),
            });

            // Step 3: final safety check
            if (hasIllegalLiberoFrontRow(applied.court, state.players)) {
              return {
                ...state,
                toast: makeToast("Illegal rotation: Libero cannot rotate into the front row.", "error"),
              };
            }

            const next: any = {
              ...state,
              [key]: applied.court,
              ...setSwapPatch(teamId, applied.swap),
            };
            if (applied.toast) next.toast = applied.toast;
            return next;
          }),

        // Scoresheet UI
        activeScoresheet: null,
        openScoresheet: (teamId, slot) => set({ activeScoresheet: { teamId, slot } }),
        closeScoresheet: () => set({ activeScoresheet: null }),

        // SCOREBOARD
        scoreA: 0,
        scoreB: 0,
        servingTeam: "A",
        setServingTeam: (teamId) =>
          set((state) => ({
            servingTeam: teamId,
            serviceRunTeam: teamId,
            serviceRunCount: 0,
            rallyInProgress: false,
          })),

        // Event log
        events: [],

        /**
         * ✅ PATCHED (kept):
         * Side-out rotation applies libero automation BEFORE checking illegal libero front-row.
         */
        logEvent: ({ teamId, slot, skill, outcome }) =>
          set((state) => {
            const court = teamId === "A" ? state.courtA : state.courtB;
            const playerId = court[slot];
            if (!playerId) return state;

            const skillKey = normKey(skill);
            const outcomeKey = normKey(outcome);

            // Back-row cannot block
            if (skillKey.includes("BLOCK") && isBackRowSlot(slot)) {
              return { ...state, toast: makeToast("Illegal action: Back-row players cannot block.", "error") };
            }

            // Rally start heuristic: mark rally as in-progress when a SERVE is logged
            let nextRallyInProgress = state.rallyInProgress;
            if (!nextRallyInProgress && skillKey.includes("SERVE")) nextRallyInProgress = true;

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

              const isServe = skillKey.includes("SERVE");
              const isSpike =
                skillKey.includes("SPIKE") || skillKey.includes("ATTACK") || skillKey === "HIT";
              const isBlock = skillKey.includes("BLOCK");

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

            // Service run / streak
            let nextServiceRunTeam = state.serviceRunTeam;
            let nextServiceRunCount = state.serviceRunCount;

            // Rally helpers
            let nextRallyCount = state.rallyCount;

            // Optional toast produced by automation
            let nextToast: ToastState | null = null;

            // Swap patch (apply only if rotation succeeded)
            let swapPatch: Partial<Pick<MatchStore, "liberoSwapA" | "liberoSwapB">> = {};

            if (pointWinner) {
              // rally ended
              nextRallyCount += 1;
              nextRallyInProgress = false;

              // score
              if (pointWinner === "A") nextScoreA += 1;
              else nextScoreB += 1;

              // service run
              if (pointWinner === prevServingTeam) {
                nextServiceRunTeam = prevServingTeam;
                nextServiceRunCount = Math.max(0, state.serviceRunCount) + 1;
              } else {
                nextServiceRunTeam = pointWinner;
                nextServiceRunCount = 1;
              }

              // side-out (winner wasn't serving)
              if (pointWinner !== prevServingTeam) {
                nextServingTeam = pointWinner;

                if (pointWinner === "A") {
                  const rotated = rotateForwardForTeam("A", state.courtA);

                  // Apply automation FIRST
                  const applied = applyLiberoAutomation({
                    teamId: "A",
                    court: rotated,
                    players: state.players,
                    config: state.liberoConfigA,
                    swap: state.liberoSwapA,
                    rotationMapping: rotationMappingForForward("A"),
                  });

                  // Validate AFTER automation
                  if (hasIllegalLiberoFrontRow(applied.court, state.players)) {
                    nextCourtA = state.courtA;
                    nextToast = makeToast(
                      "Side-out rotation blocked: Libero cannot rotate into the front row.",
                      "warn"
                    );
                  } else {
                    didSideoutRotate = true;
                    nextCourtA = applied.court;
                    swapPatch = { ...swapPatch, ...setSwapPatch("A", applied.swap) };
                    if (applied.toast) nextToast = applied.toast;
                  }
                } else {
                  const rotated = rotateForwardForTeam("B", state.courtB);

                  const applied = applyLiberoAutomation({
                    teamId: "B",
                    court: rotated,
                    players: state.players,
                    config: state.liberoConfigB,
                    swap: state.liberoSwapB,
                    rotationMapping: rotationMappingForForward("B"),
                  });

                  if (hasIllegalLiberoFrontRow(applied.court, state.players)) {
                    nextCourtB = state.courtB;
                    nextToast = makeToast(
                      "Side-out rotation blocked: Libero cannot rotate into the front row.",
                      "warn"
                    );
                  } else {
                    didSideoutRotate = true;
                    nextCourtB = applied.court;
                    swapPatch = { ...swapPatch, ...setSwapPatch("B", applied.swap) };
                    if (applied.toast) nextToast = applied.toast;
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
              rallyCount: nextRallyCount,
              rallyInProgress: nextRallyInProgress,
              serviceRunTeam: nextServiceRunTeam,
              serviceRunCount: nextServiceRunCount,
              events: [e, ...state.events],
              ...(swapPatch as any),
              toast: nextToast ?? state.toast,
            };
          }),

        undoLastEvent: () =>
          set((state) => {
            if (state.events.length === 0) return state;
            const [last, ...rest] = state.events;

            // Note: this undo only reverts scoreboard & serving, and reverses sideout rotation by inverse rotation.
            // For perfect undo with libero automation, store prev courts per event (future enhancement).
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
              toast: makeToast("Undid last event.", "info"),
            };
          }),

        // Resets
        resetCourt: (teamId) =>
          set((state) => {
            if (teamId === "A")
              return { ...state, courtA: emptyCourt(), liberoSwapA: defaultLiberoSwap() };
            return { ...state, courtB: emptyCourt(), liberoSwapB: defaultLiberoSwap() };
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
            rallyCount: 0,
            rallyInProgress: false,
            serviceRunTeam: "A",
            serviceRunCount: 0,
            liberoSwapA: defaultLiberoSwap(),
            liberoSwapB: defaultLiberoSwap(),
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
        liberoConfigA: state.liberoConfigA,
        liberoConfigB: state.liberoConfigB,
        rallyCount: state.rallyCount,
        rallyInProgress: state.rallyInProgress,
        serviceRunTeam: state.serviceRunTeam,
        serviceRunCount: state.serviceRunCount,
        // toast + swap are intentionally NOT persisted
      }),
    }
  )
);
