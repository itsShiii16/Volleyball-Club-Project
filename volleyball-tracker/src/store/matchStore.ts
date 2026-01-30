import { create } from "zustand";
import type {
  ActionEvent,
  CourtState,
  Outcome,
  Player,
  RotationSlot,
  Skill,
  TeamId,
} from "@/lib/volleyball";

const emptyCourt = (): CourtState => ({
  1: null,
  2: null,
  3: null,
  4: null,
  5: null,
  6: null,
});

type MatchStore = {
  // Rosters
  players: Player[];

  // On-court assignments per team
  courtA: CourtState;
  courtB: CourtState;

  // UI selection (SlotPanel)
  selected: { teamId: TeamId; slot: RotationSlot } | null;

  // Roster actions (UI-driven, not DB)
  setPlayers: (players: Player[]) => void;
  addPlayer: (player: Player) => void;
  updatePlayer: (id: string, patch: Partial<Player>) => void;
  removePlayer: (id: string) => void;

  // Slot selection actions
  selectSlot: (teamId: TeamId, slot: RotationSlot) => void;
  clearSelection: () => void;

  // Court slot actions
  assignPlayerToSlot: (teamId: TeamId, slot: RotationSlot, playerId: string) => void;
  substituteInSlot: (teamId: TeamId, slot: RotationSlot, newPlayerId: string) => void;
  clearSlot: (teamId: TeamId, slot: RotationSlot) => void;

  // Helpers
  getOnCourtPlayerIds: (teamId: TeamId) => string[];

  // Rotation
  rotateTeam: (teamId: TeamId) => void;

  // Reset actions
  resetCourt: (teamId: TeamId) => void;
  resetMatch: () => void;

  // Scoresheet UI
  activeScoresheet: { teamId: TeamId; slot: RotationSlot } | null;
  openScoresheet: (teamId: TeamId, slot: RotationSlot) => void;
  closeScoresheet: () => void;

  // Event log
  events: ActionEvent[];
  logEvent: (input: { teamId: TeamId; slot: RotationSlot; skill: Skill; outcome: Outcome }) => void;
  undoLastEvent: () => void;
};

export const useMatchStore = create<MatchStore>((set, get) => ({
  // Rosters
  players: [],

  // Courts
  courtA: emptyCourt(),
  courtB: emptyCourt(),

  // UI selection
  selected: null,

  // Roster actions
  setPlayers: (players) => set({ players }),

  addPlayer: (player) =>
    set((state) => ({
      players: [...state.players, player],
    })),

  updatePlayer: (id, patch) =>
    set((state) => ({
      players: state.players.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })),

  removePlayer: (id) =>
    set((state) => ({
      players: state.players.filter((p) => p.id !== id),
    })),

  // Slot selection
  selectSlot: (teamId, slot) => set({ selected: { teamId, slot } }),
  clearSelection: () => set({ selected: null }),

  // Court slot actions
  assignPlayerToSlot: (teamId, slot, playerId) =>
    set((state) => {
      const key = teamId === "A" ? "courtA" : "courtB";
      const court = { ...state[key] };

      // Prevent duplicates on the same team's court
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
      const key = teamId === "A" ? "courtA" : "courtB";
      const court = { ...state[key] };
      court[slot] = null;
      return { ...state, [key]: court };
    }),

  // Helpers
  getOnCourtPlayerIds: (teamId) => {
    const state = get();
    const court = teamId === "A" ? state.courtA : state.courtB;
    return Object.values(court).filter(Boolean) as string[];
  },

  // Rotation
  rotateTeam: (teamId) =>
    set((state) => {
      const key = teamId === "A" ? "courtA" : "courtB";
      const court = { ...state[key] };

      // Rotation order: 1 → 6 → 5 → 4 → 3 → 2 → 1
      const order: RotationSlot[] = [1, 6, 5, 4, 3, 2];
      const current = order.map((s) => court[s]);

      // shift right by 1
      current.unshift(current.pop()!);

      order.forEach((s, idx) => {
        court[s] = current[idx] ?? null;
      });

      return { ...state, [key]: court };
    }),

  // Reset actions
  resetCourt: (teamId) =>
    set((state) => {
      const key = teamId === "A" ? "courtA" : "courtB";
      return { ...state, [key]: emptyCourt() };
    }),

  resetMatch: () =>
    set((state) => ({
      ...state,
      courtA: emptyCourt(),
      courtB: emptyCourt(),
      selected: null,
      activeScoresheet: null,
      events: [],
    })),

  // Scoresheet UI
  activeScoresheet: null,
  openScoresheet: (teamId, slot) => set({ activeScoresheet: { teamId, slot } }),
  closeScoresheet: () => set({ activeScoresheet: null }),

  // Event log
  events: [],

  logEvent: ({ teamId, slot, skill, outcome }) =>
    set((state) => {
      const court = teamId === "A" ? state.courtA : state.courtB;
      const playerId = court[slot];
      if (!playerId) return state;

      const e: ActionEvent = {
        id: crypto.randomUUID(),
        ts: Date.now(),
        teamId,
        playerId,
        slot,
        skill,
        outcome,
      };

      return { ...state, events: [e, ...state.events] };
    }),

  undoLastEvent: () =>
    set((state) => {
      if (state.events.length === 0) return state;
      return { ...state, events: state.events.slice(1) };
    }),
}));
