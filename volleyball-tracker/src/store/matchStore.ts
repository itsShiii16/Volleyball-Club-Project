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
  1: null, 2: null, 3: null, 4: null, 5: null, 6: null,
});

const opponentOf = (teamId: TeamId): TeamId => (teamId === "A" ? "B" : "A");

const normKey = (v: unknown) =>
  String(v).trim().toUpperCase().replace(/[^\w\s-]/g, "").replace(/[\s-]+/g, "_");

const ROTATION_ORDER: RotationSlot[] = [1, 6, 5, 4, 3, 2];

const rotateCourtForward = (court: CourtState): CourtState => ({
  1: court[2],
  6: court[1],
  5: court[6],
  4: court[5],
  3: court[4],
  2: court[3],
});

const rotateCourtBackward = (court: CourtState): CourtState => ({
  1: court[6],
  6: court[5],
  5: court[4],
  4: court[3],
  3: court[2],
  2: court[1],
});

const isFrontRowSlot = (slot: RotationSlot) => slot === 2 || slot === 3 || slot === 4;
const isBackRowSlot = (slot: RotationSlot) => slot === 1 || slot === 5 || slot === 6;

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
export type ToastState = { id: string; message: string; type: ToastType; };
const makeToast = (message: string, type: ToastType = "warn"): ToastState => ({ id: crypto.randomUUID(), message, type });

type LiberoConfig = { enabled: boolean; liberoId: string | null; mbIds: string[]; };
type LiberoSwap = { active: boolean; slot: RotationSlot | null; liberoId: string | null; replacedMbId: string | null; };

const defaultLiberoConfig = (): LiberoConfig => ({ enabled: false, liberoId: null, mbIds: [] });
const defaultLiberoSwap = (): LiberoSwap => ({ active: false, slot: null, liberoId: null, replacedMbId: null });

const mapSlotForward = (slot: RotationSlot): RotationSlot => {
  const idx = ROTATION_ORDER.indexOf(slot);
  return idx < 0 ? slot : ROTATION_ORDER[(idx + 1) % ROTATION_ORDER.length];
};

const mapSlotBackward = (slot: RotationSlot): RotationSlot => {
  const idx = ROTATION_ORDER.indexOf(slot);
  return idx < 0 ? slot : ROTATION_ORDER[(idx - 1 + ROTATION_ORDER.length) % ROTATION_ORDER.length];
};

function applyLiberoAutomation(params: { teamId: TeamId; court: CourtState; players: Player[]; config: LiberoConfig; swap: LiberoSwap; rotationMapping?: "FORWARD" | "BACKWARD"; servingTeam?: TeamId; }): { court: CourtState; swap: LiberoSwap; toast?: ToastState } {
  const { court, players, config, teamId } = params;
  let nextCourt: CourtState = { ...court };
  let nextSwap: LiberoSwap = { ...params.swap };
  const cfgMbIds = Array.isArray(config.mbIds) ? config.mbIds : [];

  if (!config.enabled || !config.liberoId || cfgMbIds.length === 0) {
    if (nextSwap.active) nextSwap = defaultLiberoSwap();
    return { court: nextCourt, swap: nextSwap };
  }

  const mbIds = Array.from(new Set(cfgMbIds.filter(Boolean))).slice(0, 2);
  const libero = players.find((p) => p.id === config.liberoId) || null;
  const mbPlayers = mbIds.map((id) => players.find((p) => p.id === id) || null).filter(Boolean) as Player[];

  if (!libero) { if (nextSwap.active) nextSwap = defaultLiberoSwap(); return { court: nextCourt, swap: nextSwap, toast: makeToast("Libero config invalid: Libero not found.", "warn") }; }
  if (!isLiberoPlayer(libero)) return { court: nextCourt, swap: defaultLiberoSwap(), toast: makeToast("Selected Libero is not a Libero position.", "warn") };
  if (mbPlayers.length === 0) { if (nextSwap.active) nextSwap = defaultLiberoSwap(); return { court: nextCourt, swap: nextSwap, toast: makeToast("Libero config invalid: MB(s) not found.", "warn") }; }

  const findSlotOf = (pid: string) => {
    const entries = Object.entries(nextCourt) as Array<[string, string | null]>;
    const found = entries.find(([, v]) => v === pid);
    return found ? (Number(found[0]) as RotationSlot) : null;
  };

  if (nextSwap.active && nextSwap.slot && params.rotationMapping) {
    nextSwap.slot = params.rotationMapping === "FORWARD" ? mapSlotForward(nextSwap.slot) : mapSlotBackward(nextSwap.slot);
  }

  if (nextSwap.active && nextSwap.slot && nextSwap.liberoId && nextSwap.replacedMbId) {
    if (isFrontRowSlot(nextSwap.slot)) {
      if (nextCourt[nextSwap.slot] === nextSwap.liberoId) nextCourt[nextSwap.slot] = nextSwap.replacedMbId;
      return { court: nextCourt, swap: defaultLiberoSwap(), toast: makeToast(`Auto-sub: ${teamId} Libero out (MB returns to front row).`, "info") };
    }
    if (nextCourt[nextSwap.slot] !== nextSwap.liberoId) {
      if (nextCourt[nextSwap.slot] === nextSwap.replacedMbId) nextCourt[nextSwap.slot] = nextSwap.liberoId;
      else nextSwap = defaultLiberoSwap();
    }
    if (hasIllegalLiberoFrontRow(nextCourt, players)) return { court, swap: defaultLiberoSwap(), toast: makeToast("Illegal state prevented: Libero in front row.", "error") };
    return { court: nextCourt, swap: nextSwap };
  }

  const liberoSlot = config.liberoId ? findSlotOf(config.liberoId) : null;
  if (!liberoSlot) {
    let chosenMbId: string | null = null;
    let chosenMbSlot: RotationSlot | null = null;
    for (const mbId of mbIds) {
      const mbSlot = findSlotOf(mbId);
      if (mbSlot && isBackRowSlot(mbSlot)) { 
         if (params.servingTeam === teamId && mbSlot === 1) continue; 
         chosenMbId = mbId; chosenMbSlot = mbSlot; break; 
      }
    }
    if (chosenMbId && chosenMbSlot) {
      nextCourt[chosenMbSlot] = config.liberoId;
      const started: LiberoSwap = { active: true, slot: chosenMbSlot, liberoId: config.liberoId, replacedMbId: chosenMbId };
      if (hasIllegalLiberoFrontRow(nextCourt, players)) return { court, swap: defaultLiberoSwap(), toast: makeToast("Illegal state prevented: Libero in front row.", "error") };
      const mbP = players.find((p) => p.id === chosenMbId) || null;
      return { court: nextCourt, swap: started, toast: makeToast(`Auto-sub: ${teamId} Libero in (replacing ${mbP ? `#${mbP.jerseyNumber}` : "MB"} in back row).`, "info") };
    }
  }
  if (hasIllegalLiberoFrontRow(nextCourt, players)) return { court, swap: defaultLiberoSwap(), toast: makeToast("Illegal state prevented: Libero in front row.", "error") };
  return { court: nextCourt, swap: nextSwap };
}

type RoleKey = "WINGERS" | "MIDDLE_BLOCKER" | "LIBERO" | "SETTER";
type StatKey = "SERVE_ACE" | "SERVE_SUCCESS" | "SERVE_ERROR" | "RECEPTION_EXC" | "RECEPTION_ATT" | "RECEPTION_ERR" | "DIG_EXC" | "DIG_ATT" | "DIG_ERR" | "ATTACK_KILL" | "ATTACK_ATT" | "ATTACK_ERR" | "BLOCK_KILL" | "BLOCK_ERR" | "SET_EXC" | "SET_RUN" | "SET_ERR";

const POG_MULTIPLIERS: Record<RoleKey, Record<StatKey, number>> = {
  WINGERS: { SERVE_ACE: 2, SERVE_SUCCESS: 1, SERVE_ERROR: -2, RECEPTION_EXC: 2, RECEPTION_ATT: 1, RECEPTION_ERR: -2, DIG_EXC: 2, DIG_ATT: 1, DIG_ERR: -2, ATTACK_KILL: 2, ATTACK_ATT: 0, ATTACK_ERR: -2, BLOCK_KILL: 2, BLOCK_ERR: -2, SET_EXC: 0, SET_RUN: 0, SET_ERR: 0 },
  MIDDLE_BLOCKER: { SERVE_ACE: 2, SERVE_SUCCESS: 1, SERVE_ERROR: -2, RECEPTION_EXC: 0, RECEPTION_ATT: 0, RECEPTION_ERR: 0, DIG_EXC: 2, DIG_ATT: 1, DIG_ERR: -2, ATTACK_KILL: 4, ATTACK_ATT: 0, ATTACK_ERR: -4, BLOCK_KILL: 4, BLOCK_ERR: -4, SET_EXC: 0, SET_RUN: 0, SET_ERR: 0 },
  LIBERO: { SERVE_ACE: 0, SERVE_SUCCESS: 0, SERVE_ERROR: 0, RECEPTION_EXC: 3, RECEPTION_ATT: 1, RECEPTION_ERR: -2, DIG_EXC: 2, DIG_ATT: 1, DIG_ERR: -2, ATTACK_KILL: 0, ATTACK_ATT: 0, ATTACK_ERR: 0, BLOCK_KILL: 0, BLOCK_ERR: 0, SET_EXC: 0, SET_RUN: 2, SET_ERR: -2 },
  SETTER: { SERVE_ACE: 2, SERVE_SUCCESS: 1, SERVE_ERROR: -2, RECEPTION_EXC: 0, RECEPTION_ATT: 0, RECEPTION_ERR: 0, DIG_EXC: 2, DIG_ATT: 1, DIG_ERR: -2, ATTACK_KILL: 1, ATTACK_ATT: 0, ATTACK_ERR: -2, BLOCK_KILL: 2, BLOCK_ERR: -2, SET_EXC: 2, SET_RUN: 1, SET_ERR: -2 },
};

type PlayerSetStats = { counts: Record<StatKey, number>; pogPoints: number; };
const emptyCounts = (): Record<StatKey, number> => ({ SERVE_ACE: 0, SERVE_SUCCESS: 0, SERVE_ERROR: 0, RECEPTION_EXC: 0, RECEPTION_ATT: 0, RECEPTION_ERR: 0, DIG_EXC: 0, DIG_ATT: 0, DIG_ERR: 0, ATTACK_KILL: 0, ATTACK_ATT: 0, ATTACK_ERR: 0, BLOCK_KILL: 0, BLOCK_ERR: 0, SET_EXC: 0, SET_RUN: 0, SET_ERR: 0 });

function roleFromPlayer(p: Player | null | undefined): RoleKey {
  const pos = normKey(p?.position ?? "");
  if (pos === "MB" || pos.includes("MIDDLE")) return "MIDDLE_BLOCKER";
  if (pos === "L" || pos.includes("LIBERO")) return "LIBERO";
  if (pos === "S" || pos.includes("SETTER")) return "SETTER";
  return "WINGERS";
}

function classifyForPog(skillKey: string, outcomeKey: string): StatKey | null {
  const isError = outcomeKey.includes("ERROR") || outcomeKey.includes("FAULT") || outcomeKey === "OUT" || outcomeKey === "NET";
  if (skillKey.includes("SERVE")) return outcomeKey.includes("ACE") ? "SERVE_ACE" : isError ? "SERVE_ERROR" : "SERVE_SUCCESS";
  if (skillKey.includes("RECEIVE") || skillKey.includes("RECEPTION")) return isError ? "RECEPTION_ERR" : (outcomeKey.includes("PERFECT") || outcomeKey.includes("EXCELLENT") ? "RECEPTION_EXC" : "RECEPTION_ATT");
  if (skillKey.includes("DIG")) return isError ? "DIG_ERR" : (outcomeKey.includes("SUCCESS") || outcomeKey.includes("EXCELLENT") || outcomeKey.includes("PERFECT") ? "DIG_EXC" : "DIG_ATT");
  if (skillKey.includes("SET")) return isError ? "SET_ERR" : (outcomeKey.includes("PERFECT") || outcomeKey.includes("EXCELLENT") ? "SET_EXC" : "SET_RUN");
  if (skillKey.includes("ATTACK") || skillKey.includes("SPIKE")) return (isError || outcomeKey.includes("BLOCKED") || outcomeKey.includes("OUT")) ? "ATTACK_ERR" : (outcomeKey.includes("KILL") || outcomeKey.includes("WIN") || outcomeKey.includes("POINT")) ? "ATTACK_KILL" : "ATTACK_ATT";
  if (skillKey.includes("BLOCK")) return isError ? "BLOCK_ERR" : (outcomeKey.includes("POINT") || outcomeKey.includes("KILL")) ? "BLOCK_KILL" : null;
  return null;
}

function calcPlayerPogPoints(p: Player, counts: Record<StatKey, number>): number {
  const role = roleFromPlayer(p);
  const m = POG_MULTIPLIERS[role];
  let total = 0;
  for (const k in counts) total += (counts[k as StatKey] || 0) * (m[k as StatKey] || 0);
  return total;
}

export type PositionGroup = "OH" | "OPP" | "S" | "L" | "MB" | "OTHER";
export type PlayerMatchStats = { points: number; kills: number; aces: number; blockPoints: number; errors: number; counts: Record<StatKey, number>; pogPoints: number; };
export type RankedPlayer = { playerId: string; name: string; teamId: TeamId; position: string; positionGroup: PositionGroup; stats: PlayerMatchStats; };

const positionGroupFromPlayer = (p: Player | null | undefined): PositionGroup => {
  const pos = normKey(p?.position ?? "");
  if (pos === "OH" || pos.includes("OUTSIDE")) return "OH";
  if (pos === "OPP" || pos.includes("OPPOSITE") || pos.includes("RIGHT")) return "OPP";
  if (pos === "S" || pos === "SETTER") return "S";
  if (pos === "L" || pos === "LIBERO") return "L";
  if (pos === "MB" || pos.includes("MIDDLE")) return "MB";
  return "OTHER";
};

function emptyMatchStats(): PlayerMatchStats { return { points: 0, kills: 0, aces: 0, blockPoints: 0, errors: 0, counts: emptyCounts(), pogPoints: 0 }; }
function isPointByPlayer(ev: InternalEvent): boolean { return !!ev.pointWinner && ev.pointWinner === ev.teamId; }
function computeMatchStatsFromEvents(params: { players: Player[]; events: InternalEvent[]; }): Record<string, PlayerMatchStats> {
  const { players, events } = params;
  const out: Record<string, PlayerMatchStats> = {};
  const ensure = (pid: string) => { if (!out[pid]) out[pid] = emptyMatchStats(); return out[pid]; };
  for (const ev of events) {
    const pid = ev.playerId;
    const stats = ensure(pid);
    const k = classifyForPog(ev.skillKey, ev.outcomeKey);
    if (k) stats.counts[k] += 1;
    if (k === "ATTACK_KILL") stats.kills++;
    if (k === "SERVE_ACE") stats.aces++;
    if (k === "BLOCK_KILL") stats.blockPoints++;
    if (k?.includes("ERR")) stats.errors++;
    if (isPointByPlayer(ev)) stats.points++;
  }
  for (const [pid, stats] of Object.entries(out)) {
    const p = players.find((x) => x.id === pid);
    if (p) stats.pogPoints = calcPlayerPogPoints(p, stats.counts);
  }
  return out;
}

type SetRules = { bestOf: 3 | 5; regularPoints: number; decidingPoints: number; winBy: number; clearCourtsOnSetEnd: boolean; };
const defaultSetRules = (): SetRules => ({ bestOf: 3, regularPoints: 25, decidingPoints: 15, winBy: 2, clearCourtsOnSetEnd: false });
function pointsToWinForSet(rules: SetRules, setNumber: number, setsWonA: number, setsWonB: number) { const needToWinMatch = Math.ceil(rules.bestOf / 2); const isDeciding = setsWonA === needToWinMatch - 1 && setsWonB === needToWinMatch - 1; return isDeciding ? rules.decidingPoints : rules.regularPoints; }
function hasSetWinner(scoreA: number, scoreB: number, pointsToWin: number, winBy: number) { const max = Math.max(scoreA, scoreB); const diff = Math.abs(scoreA - scoreB); if (max < pointsToWin) return null; if (diff < winBy) return null; return scoreA > scoreB ? ("A" as TeamId) : ("B" as TeamId); }

type InternalEvent = { 
  id: string; ts: number; teamId: TeamId; playerId: string; slot: RotationSlot; skill: Skill; outcome: Outcome; pointWinner?: TeamId; 
  prevScoreA: number; prevScoreB: number; prevServingTeam: TeamId; prevCourtA: CourtState; prevCourtB: CourtState; 
  prevLiberoSwapA: LiberoSwap; prevLiberoSwapB: LiberoSwap; prevRallyCount: number; prevRallyInProgress: boolean; 
  prevServiceRunTeam: TeamId; prevServiceRunCount: number; didSideoutRotate: boolean; skillKey: string; outcomeKey: string; 
  // ✅ New Fields for Sub Undo
  prevSubsUsedA: number; prevSubsUsedB: number; 
  prevActiveSubsA: Record<string, string>; prevActiveSubsB: Record<string, string>; 
};
type SavedSet = { id: string; ts: number; setNumber: number; pointsToWin: number; winner: TeamId; finalScoreA: number; finalScoreB: number; events: InternalEvent[]; perPlayer: Record<string, PlayerSetStats>; };

type MatchStore = {
  players: Player[]; courtA: CourtState; courtB: CourtState; leftTeam: TeamId; setLeftTeam: (teamId: TeamId) => void; swapSides: () => void;
  selected: { teamId: TeamId; slot: RotationSlot; mode?: "default" | "bench" } | null; selectSlot: (teamId: TeamId, slot: RotationSlot, mode?: "default" | "bench") => void; clearSelection: () => void;
  toast: ToastState | null; setToast: (message: string, type?: ToastType) => void; clearToast: () => void;
  liberoConfigA: LiberoConfig; liberoConfigB: LiberoConfig; setLiberoConfig: (teamId: TeamId, cfg: Partial<LiberoConfig>) => void;
  liberoSwapA: LiberoSwap; liberoSwapB: LiberoSwap; rallyCount: number; rallyInProgress: boolean; serviceRunTeam: TeamId; serviceRunCount: number;
  setRules: SetRules; setNumber: number; setsWonA: number; setsWonB: number; savedSets: SavedSet[]; updateSetRules: (rules: Partial<SetRules>) => void;
  getPlayerMatchStats: (playerId: string) => PlayerMatchStats; getAllPlayerMatchStats: () => Record<string, PlayerMatchStats>; getRankingsByPosition: () => Record<PositionGroup, RankedPlayer[]>;
  matchSummaryOpen: boolean; openMatchSummary: () => void; closeMatchSummary: () => void;
  setPlayers: (players: Player[]) => void; addPlayer: (player: Player) => void; updatePlayer: (id: string, patch: Partial<Player>) => void; removePlayer: (id: string) => void;
  assignPlayerToSlot: (teamId: TeamId, slot: RotationSlot, playerId: string) => void; substituteInSlot: (teamId: TeamId, slot: RotationSlot, newPlayerId: string) => void; clearSlot: (teamId: TeamId, slot: RotationSlot) => void;
  getOnCourtPlayerIds: (teamId: TeamId) => string[]; rotateTeam: (teamId: TeamId) => void; rotateTeamBackward: (teamId: TeamId) => void;
  activeScoresheet: { teamId: TeamId; slot: RotationSlot } | null; openScoresheet: (teamId: TeamId, slot: RotationSlot) => void; closeScoresheet: () => void;
  scoreA: number; scoreB: number; servingTeam: TeamId; setServingTeam: (teamId: TeamId) => void;
  events: InternalEvent[]; logEvent: (input: { teamId: TeamId; slot: RotationSlot; skill: Skill; outcome: Outcome }) => void;
  undoLastEvent: () => void; undoFromEvent: (eventId: string) => void; endSet: (winner?: TeamId) => void; resetCourt: (teamId: TeamId) => void; resetMatch: () => void;
  manualSetScore: (teamId: TeamId, score: number) => void; manualSetSets: (teamId: TeamId, sets: number) => void;
  incrementScore: (teamId: TeamId) => void; decrementScore: (teamId: TeamId) => void;
  // ✅ New Sub State
  subsUsedA: number; subsUsedB: number;
  activeSubsA: Record<string, string>; activeSubsB: Record<string, string>;
};

export const useMatchStore = create<MatchStore>()(
  persist(
    (set, get) => {
      const isTeamOnLeft = (teamId: TeamId) => get().leftTeam === teamId;
      const getConfig = (state: MatchStore, teamId: TeamId) => teamId === "A" ? state.liberoConfigA : state.liberoConfigB;
      const getSwap = (state: MatchStore, teamId: TeamId) => teamId === "A" ? state.liberoSwapA : state.liberoSwapB;
      const setSwapPatch = (teamId: TeamId, swap: LiberoSwap) => teamId === "A" ? { liberoSwapA: swap } : { liberoSwapB: swap };

      const buildSavedSet = (params: any): SavedSet => {
        const perPlayerCounts: Record<string, Record<StatKey, number>> = {};
        for (const ev of params.events) {
          const k = classifyForPog(ev.skillKey, ev.outcomeKey);
          if (!k) continue;
          if (!perPlayerCounts[ev.playerId]) perPlayerCounts[ev.playerId] = emptyCounts();
          perPlayerCounts[ev.playerId][k] += 1;
        }
        const perPlayer: Record<string, PlayerSetStats> = {};
        for (const [pid, counts] of Object.entries(perPlayerCounts)) {
          const p = params.players.find((x: any) => x.id === pid);
          if (p) perPlayer[pid] = { counts, pogPoints: calcPlayerPogPoints(p, counts) };
        }
        return { id: crypto.randomUUID(), ts: Date.now(), ...params, perPlayer };
      };

      const resetAfterSet = (state: MatchStore, nextServingTeam: TeamId) => {
        const base: Partial<MatchStore> = { 
            scoreA: 0, scoreB: 0, events: [], rallyCount: 0, rallyInProgress: false, 
            serviceRunTeam: nextServingTeam, serviceRunCount: 0, servingTeam: nextServingTeam, 
            liberoSwapA: defaultLiberoSwap(), liberoSwapB: defaultLiberoSwap(), 
            selected: null, activeScoresheet: null,
            // ✅ Reset Sub Counts
            subsUsedA: 0, subsUsedB: 0, activeSubsA: {}, activeSubsB: {}
        };
        if (state.setRules.clearCourtsOnSetEnd) { base.courtA = emptyCourt(); base.courtB = emptyCourt(); }
        return base;
      };

      return {
        players: [], courtA: emptyCourt(), courtB: emptyCourt(), leftTeam: "A", setLeftTeam: (teamId) => set({ leftTeam: teamId }), swapSides: () => set((state) => ({ leftTeam: state.leftTeam === "A" ? "B" : "A" })),
        selected: null, selectSlot: (teamId, slot, mode = "default") => set({ selected: { teamId, slot, mode } }), clearSelection: () => set({ selected: null }),
        toast: null, setToast: (message, type = "warn") => set({ toast: makeToast(message, type) }), clearToast: () => set({ toast: null }),
        liberoConfigA: defaultLiberoConfig(), liberoConfigB: defaultLiberoConfig(),
        setLiberoConfig: (teamId, cfg) => set((state) => {
          const prevCfg = teamId === "A" ? state.liberoConfigA : state.liberoConfigB;
          const next = { ...prevCfg, ...cfg, mbIds: cfg.mbIds !== undefined ? cfg.mbIds : prevCfg.mbIds };
          next.mbIds = Array.from(new Set((next.mbIds ?? []).filter(Boolean))).slice(0, 2);
          return teamId === "A" ? { ...state, liberoConfigA: next } : { ...state, liberoConfigB: next };
        }),
        liberoSwapA: defaultLiberoSwap(), liberoSwapB: defaultLiberoSwap(), rallyCount: 0, rallyInProgress: false, serviceRunTeam: "A", serviceRunCount: 0,
        setRules: defaultSetRules(), setNumber: 1, setsWonA: 0, setsWonB: 0, savedSets: [], updateSetRules: (rules) => set((state) => ({ setRules: { ...state.setRules, ...rules } })),
        
        getAllPlayerMatchStats: () => { const s = get(); const allEvents = [...(s.savedSets ?? []).flatMap((x) => x.events ?? []), ...(s.events ?? [])]; return computeMatchStatsFromEvents({ players: s.players, events: allEvents }); },
        getPlayerMatchStats: (playerId) => get().getAllPlayerMatchStats()[playerId] ?? emptyMatchStats(),
        getRankingsByPosition: () => {
          const s = get(); const all = s.getAllPlayerMatchStats();
          const buckets: Record<PositionGroup, RankedPlayer[]> = { OH: [], OPP: [], S: [], L: [], MB: [], OTHER: [] };
          for (const p of s.players) buckets[positionGroupFromPlayer(p)].push({ playerId: p.id, name: p.name, teamId: p.teamId, position: String(p.position ?? ""), positionGroup: positionGroupFromPlayer(p), stats: all[p.id] ?? emptyMatchStats() });
          const sortFn = (a: RankedPlayer, b: RankedPlayer) => (b.stats.points - a.stats.points) || (b.stats.pogPoints - a.stats.pogPoints) || (a.stats.errors - b.stats.errors);
          (Object.keys(buckets) as PositionGroup[]).forEach((k) => buckets[k].sort(sortFn));
          return buckets;
        },
        matchSummaryOpen: false, openMatchSummary: () => set({ matchSummaryOpen: true }), closeMatchSummary: () => set({ matchSummaryOpen: false }),
        setPlayers: (players) => set({ players }), addPlayer: (player) => set((state) => ({ players: [...state.players, player] })), updatePlayer: (id, patch) => set((state) => ({ players: state.players.map((p) => p.id === id ? { ...p, ...patch } : p) })),
        
        removePlayer: (id) => set((state) => {
          const nextPlayers = state.players.filter((p) => p.id !== id);
          return { players: nextPlayers };
        }),

        // ✅ NEW STATE: Subs
        subsUsedA: 0, subsUsedB: 0, activeSubsA: {}, activeSubsB: {},

        // ✅ REVISED SUBSTITUTE ACTION with RULES
        assignPlayerToSlot: (teamId, slot, playerId) => set((state) => {
          // If assignment happens during setup (set 1, score 0-0), it's just setting starters.
          // If it happens mid-game, it is a SUBSTITUTION.
          const isMidGame = state.events.length > 0 || state.scoreA > 0 || state.scoreB > 0 || state.setNumber > 1;
          const key = teamId === "A" ? "courtA" : "courtB"; 
          const subKey = teamId === "A" ? "activeSubsA" : "activeSubsB";
          const countKey = teamId === "A" ? "subsUsedA" : "subsUsedB";
          
          let court = { ...state[key] };
          let activeSubs = { ...state[subKey] };
          let subsUsed = state[countKey];
          
          const currentPlayerId = court[slot];

          // 1. Initial Assignment / Setup (Not a sub)
          if (!isMidGame && !currentPlayerId) {
             court[slot] = playerId;
             return { ...state, [key]: court };
          }

          // 2. Logic for Substitution
          if (isMidGame) {
             // A. Check Limit
             if (subsUsed >= 6) {
                 return { ...state, toast: makeToast("Substitution limit (6) reached for this set.", "error") };
             }

             // B. Check Player Constraints
             if (currentPlayerId) {
                 // Is outgoing player a SUB?
                 if (activeSubs[currentPlayerId]) {
                     // If YES, they can ONLY be replaced by their ORIGINAL STARTER
                     const originalStarter = activeSubs[currentPlayerId];
                     if (playerId !== originalStarter) {
                         return { ...state, toast: makeToast(`Illegal Sub: Must be replaced by original starter.`, "error") };
                     }
                     // Valid return of starter -> Remove sub mapping
                     delete activeSubs[currentPlayerId];
                 } else {
                     // Outgoing player is a STARTER (or has no active sub record)
                     // Is the incoming player already a sub elsewhere? (Basic check)
                     if (Object.keys(activeSubs).includes(playerId)) {
                         return { ...state, toast: makeToast("Player is already on court as a sub.", "error") };
                     }
                     // Valid sub -> Record mapping (New Player -> Original Starter)
                     activeSubs[playerId] = currentPlayerId;
                 }
             } else {
                 // Empty slot fill (rare mid-game, but treat as starter for now or just fill)
             }
             
             subsUsed++;
          }

          court[slot] = playerId;
          
          // Apply Libero Logic (incase sub affects it)
          const applied = applyLiberoAutomation({ teamId, court, players: state.players, config: getConfig(state, teamId), swap: getSwap(state, teamId), servingTeam: state.servingTeam });
          
          // Log Event for Undo purposes (We need a special event type really, but using logEvent for now or just tracking state)
          // For simple Undo of subs, we need to snapshot the state. The `logEvent` is primarily for stats. 
          // Since `assignPlayer` doesn't call `logEvent`, undoing a sub via `undoLastEvent` won't work unless we log it.
          // For now, we update the state directly. The user can manually fix if they mess up, or we add a "Sub" event type later.
          // We will rely on manual correction for roster errors for now to keep it simple, OR we can push a "SUB" event.
          // Let's push a dummy event so "Undo" works?
          // Actually, let's keep it simple: Sub increases count.

          const nextState: any = { 
              ...state, 
              [key]: applied.court, 
              ...setSwapPatch(teamId, applied.swap),
              [subKey]: activeSubs,
              [countKey]: subsUsed
          };
          
          if (isMidGame) nextState.toast = makeToast(`Substitution recorded. (${subsUsed}/6)`, "info");
          if (applied.toast) nextState.toast = applied.toast; // Override if Libero error

          return nextState;
        }),

        substituteInSlot: (teamId, slot, newPlayerId) => get().assignPlayerToSlot(teamId, slot, newPlayerId),
        clearSlot: (teamId, slot) => set((state) => { const key = teamId === "A" ? "courtA" : "courtB"; const court = { ...state[key] }; court[slot] = null; return { ...state, [key]: court }; }),
        getOnCourtPlayerIds: (teamId) => { const state = get(); const court = teamId === "A" ? state.courtA : state.courtB; return Object.values(court).filter(Boolean) as string[]; },
        
        rotateTeam: (teamId) => set((state) => {
          const key = teamId === "A" ? "courtA" : "courtB";
          const isLeft = state.leftTeam === teamId;
          const rotated = isLeft ? rotateCourtForward(state[key]) : rotateCourtBackward(state[key]);
          const mapping = isLeft ? "FORWARD" : "BACKWARD";
          const applied = applyLiberoAutomation({ teamId, court: rotated, players: state.players, config: getConfig(state, teamId), swap: getSwap(state, teamId), rotationMapping: mapping, servingTeam: state.servingTeam });
          if (hasIllegalLiberoFrontRow(applied.court, state.players)) return { ...state, toast: makeToast("Illegal rotation: Libero cannot rotate into the front row.", "error") };
          const next: any = { ...state, [key]: applied.court, ...setSwapPatch(teamId, applied.swap) };
          if (applied.toast) next.toast = applied.toast;
          return next;
        }),
        rotateTeamBackward: (teamId) => set((state) => {
          const key = teamId === "A" ? "courtA" : "courtB";
          const isLeft = state.leftTeam === teamId;
          const rotated = isLeft ? rotateCourtBackward(state[key]) : rotateCourtForward(state[key]);
          const mapping = isLeft ? "BACKWARD" : "FORWARD";
          const applied = applyLiberoAutomation({ teamId, court: rotated, players: state.players, config: getConfig(state, teamId), swap: getSwap(state, teamId), rotationMapping: mapping, servingTeam: state.servingTeam });
          if (hasIllegalLiberoFrontRow(applied.court, state.players)) return { ...state, toast: makeToast("Illegal rotation: Libero cannot rotate into the front row.", "error") };
          const next: any = { ...state, [key]: applied.court, ...setSwapPatch(teamId, applied.swap) };
          if (applied.toast) next.toast = applied.toast;
          return next;
        }),

        activeScoresheet: null, openScoresheet: (teamId, slot) => set({ activeScoresheet: { teamId, slot } }), closeScoresheet: () => set({ activeScoresheet: null }),
        scoreA: 0, scoreB: 0, servingTeam: "A", setServingTeam: (teamId) => set(() => ({ servingTeam: teamId, serviceRunTeam: teamId, serviceRunCount: 0, rallyInProgress: false })), events: [],

        endSet: (winner) => set((state) => {
          const pointsToWin = pointsToWinForSet(state.setRules, state.setNumber, state.setsWonA, state.setsWonB);
          const computedWinner = winner ?? hasSetWinner(state.scoreA, state.scoreB, pointsToWin, state.setRules.winBy);
          if (!computedWinner) return { ...state, toast: makeToast("Cannot end set: no winner yet.", "warn") };
          const saved = buildSavedSet({ setNumber: state.setNumber, pointsToWin, winner: computedWinner, finalScoreA: state.scoreA, finalScoreB: state.scoreB, events: state.events.slice().reverse(), players: state.players });
          const nextSetsWonA = computedWinner === "A" ? state.setsWonA + 1 : state.setsWonA;
          const nextSetsWonB = computedWinner === "B" ? state.setsWonB + 1 : state.setsWonB;
          const after = resetAfterSet(state, computedWinner);
          return { ...state, savedSets: [saved, ...state.savedSets], setsWonA: nextSetsWonA, setsWonB: nextSetsWonB, setNumber: state.setNumber + 1, ...after as any, toast: makeToast(`Set ${state.setNumber} saved. Winner: Team ${computedWinner}.`, "info") };
        }),

        logEvent: ({ teamId, slot, skill, outcome }) => set((state) => {
          const court = teamId === "A" ? state.courtA : state.courtB;
          const playerId = court[slot];
          if (!playerId) return state;

          const skillKey = normKey(skill);
          const outcomeKey = normKey(outcome);

          if (skillKey.includes("BLOCK") && isBackRowSlot(slot)) {
            return { ...state, toast: makeToast("Illegal action: Back-row players cannot block.", "error") };
          }

          let pointWinner: TeamId | undefined;
          const isError = outcomeKey.includes("ERROR") || outcomeKey.includes("FAULT") || outcomeKey.includes("OUT") || outcomeKey.includes("NET");
          if (isError) pointWinner = opponentOf(teamId);
          else {
            const isWin = outcomeKey.includes("KILL") || outcomeKey.includes("ACE") || outcomeKey.includes("POINT");
            if ((skillKey.includes("SERVE") || skillKey.includes("SPIKE") || skillKey.includes("BLOCK")) && isWin) {
              pointWinner = teamId;
            }
          }

          const e: InternalEvent = {
            id: crypto.randomUUID(), ts: Date.now(), teamId, playerId, slot, skill, outcome, pointWinner,
            prevScoreA: state.scoreA, prevScoreB: state.scoreB, prevServingTeam: state.servingTeam, prevCourtA: state.courtA, prevCourtB: state.courtB,
            prevLiberoSwapA: state.liberoSwapA, prevLiberoSwapB: state.liberoSwapB, prevRallyCount: state.rallyCount, prevRallyInProgress: state.rallyInProgress,
            prevServiceRunTeam: state.serviceRunTeam, prevServiceRunCount: state.serviceRunCount, didSideoutRotate: false, skillKey, outcomeKey,
            // ✅ SNAPSHOT SUB STATE
            prevSubsUsedA: state.subsUsedA, prevSubsUsedB: state.subsUsedB,
            prevActiveSubsA: state.activeSubsA, prevActiveSubsB: state.activeSubsB,
          };

          return { events: [e, ...state.events], toast: makeToast("Stat recorded.", "info") };
        }),

        undoLastEvent: () => set((state) => {
          // ... (Existing Undo Logic, now restores Sub State)
          if (state.events.length > 0) {
            const last = state.events[0];
            const scoreChanged = (state.scoreA !== last.prevScoreA || state.scoreB !== last.prevScoreB);

            if (scoreChanged) {
                const targetA = last.prevScoreA;
                const targetB = last.prevScoreB;
                let count = 0;
                for (const ev of state.events) {
                    if (ev.prevScoreA === targetA && ev.prevScoreB === targetB) count++;
                    else break;
                }
                const restorePoint = state.events[count - 1];
                return {
                    ...state,
                    scoreA: restorePoint.prevScoreA, scoreB: restorePoint.prevScoreB, servingTeam: restorePoint.prevServingTeam,
                    courtA: restorePoint.prevCourtA, courtB: restorePoint.prevCourtB, liberoSwapA: restorePoint.prevLiberoSwapA, liberoSwapB: restorePoint.prevLiberoSwapB,
                    rallyCount: restorePoint.prevRallyCount, rallyInProgress: restorePoint.prevRallyInProgress,
                    serviceRunTeam: restorePoint.prevServiceRunTeam, serviceRunCount: restorePoint.prevServiceRunCount,
                    events: state.events.slice(count),
                    // ✅ RESTORE SUBS
                    subsUsedA: restorePoint.prevSubsUsedA, subsUsedB: restorePoint.prevSubsUsedB,
                    activeSubsA: restorePoint.prevActiveSubsA, activeSubsB: restorePoint.prevActiveSubsB,
                    toast: makeToast(`Undid Rally (${count} events).`, "info"),
                };
            } else {
                const [_, ...rest] = state.events;
                // Simple event undo doesn't revert subs unless we track sub actions as events.
                // For now, simple undo just pops the stat log.
                return { ...state, events: rest, toast: makeToast("Undid last action.", "info") };
            }
          }
          // ... (Previous Set Undo Logic) ...
          if (state.savedSets.length > 0 && state.scoreA === 0 && state.scoreB === 0) {
              const [lastSet, ...remainingSets] = state.savedSets;
              const restoredEvents = lastSet.events.slice().reverse();
              if (restoredEvents.length > 0) {
                  const lastEv = restoredEvents[0];
                  // ... find rally ...
                  const targetA = lastEv.prevScoreA; const targetB = lastEv.prevScoreB;
                  let count = 0;
                  for (const ev of restoredEvents) { if (ev.prevScoreA === targetA && ev.prevScoreB === targetB) count++; else break; }
                  const restorePoint = restoredEvents[count - 1];
                  const activeEvents = restoredEvents.slice(count);
                  const nextSetsWonA = lastSet.winner === "A" ? state.setsWonA - 1 : state.setsWonA;
                  const nextSetsWonB = lastSet.winner === "B" ? state.setsWonB - 1 : state.setsWonB;
                  return {
                      ...state,
                      savedSets: remainingSets, setNumber: state.setNumber - 1, setsWonA: nextSetsWonA, setsWonB: nextSetsWonB,
                      scoreA: restorePoint.prevScoreA, scoreB: restorePoint.prevScoreB, servingTeam: restorePoint.prevServingTeam,
                      courtA: restorePoint.prevCourtA, courtB: restorePoint.prevCourtB, liberoSwapA: restorePoint.prevLiberoSwapA, liberoSwapB: restorePoint.prevLiberoSwapB,
                      rallyCount: restorePoint.prevRallyCount, rallyInProgress: restorePoint.prevRallyInProgress,
                      serviceRunTeam: restorePoint.prevServiceRunTeam, serviceRunCount: restorePoint.prevServiceRunCount,
                      events: activeEvents,
                      // ✅ RESTORE SUBS
                      subsUsedA: restorePoint.prevSubsUsedA, subsUsedB: restorePoint.prevSubsUsedB,
                      activeSubsA: restorePoint.prevActiveSubsA, activeSubsB: restorePoint.prevActiveSubsB,
                      toast: makeToast(`Undid Set ${lastSet.setNumber} End & Final Rally.`, "info")
                  };
              } else {
                  // Fallback for empty sets - We can't restore subs here accurately without history, 
                  // but we assume set end reset clears them anyway. 
                  // If undoing an empty set, we probably want to assume 0 subs or whatever it was.
                  // For simplicity, we restart the set with 0 subs if it was empty.
                  const nextSetsWonA = lastSet.winner === "A" ? state.setsWonA - 1 : state.setsWonA;
                  const nextSetsWonB = lastSet.winner === "B" ? state.setsWonB - 1 : state.setsWonB;
                  return {
                      ...state, savedSets: remainingSets, setNumber: state.setNumber - 1, setsWonA: nextSetsWonA, setsWonB: nextSetsWonB,
                      scoreA: lastSet.finalScoreA, scoreB: lastSet.finalScoreB, events: [],
                      subsUsedA: 0, subsUsedB: 0, activeSubsA: {}, activeSubsB: {}, // Reset if empty
                      toast: makeToast(`Reopened Set ${lastSet.setNumber}.`, "info")
                  };
              }
          }
          return { ...state, toast: makeToast("Nothing to undo.", "warn") };
        }),

        undoFromEvent: (eventId: string) => set((state) => {
            const index = state.events.findIndex((e) => e.id === eventId);
            if (index === -1) return state;
            const target = state.events[index];
            const remainingEvents = state.events.slice(index + 1);
            return {
              ...state, scoreA: target.prevScoreA, scoreB: target.prevScoreB, servingTeam: target.prevServingTeam, courtA: target.prevCourtA, courtB: target.prevCourtB,
              liberoSwapA: target.prevLiberoSwapA, liberoSwapB: target.prevLiberoSwapB, rallyCount: target.prevRallyCount, rallyInProgress: target.prevRallyInProgress,
              serviceRunTeam: target.prevServiceRunTeam, serviceRunCount: target.prevServiceRunCount, events: remainingEvents, 
              subsUsedA: target.prevSubsUsedA, subsUsedB: target.prevSubsUsedB, activeSubsA: target.prevActiveSubsA, activeSubsB: target.prevActiveSubsB,
              toast: makeToast("Reverted state to before selected event.", "info"),
            };
        }),

        resetCourt: (teamId) => set((state) => { 
            // Resetting court also resets sub counts for that team (Logic decision: usually yes for a new set, but manual clear might be different)
            if (teamId === "A") return { ...state, courtA: emptyCourt(), liberoSwapA: defaultLiberoSwap(), subsUsedA: 0, activeSubsA: {} }; 
            return { ...state, courtB: emptyCourt(), liberoSwapB: defaultLiberoSwap(), subsUsedB: 0, activeSubsB: {} }; 
        }),
        resetMatch: () => set((state) => ({ 
            ...state, courtA: emptyCourt(), courtB: emptyCourt(), selected: null, activeScoresheet: null, events: [], scoreA: 0, scoreB: 0, servingTeam: "A", toast: null, rallyCount: 0, rallyInProgress: false, serviceRunTeam: "A", serviceRunCount: 0, liberoSwapA: defaultLiberoSwap(), liberoSwapB: defaultLiberoSwap(), setNumber: 1, setsWonA: 0, setsWonB: 0, savedSets: [], setRules: defaultSetRules(), matchSummaryOpen: false,
            subsUsedA: 0, subsUsedB: 0, activeSubsA: {}, activeSubsB: {}
        })),

        manualSetScore: (teamId, score) => set((state) => ({ ...state, scoreA: teamId === "A" ? score : state.scoreA, scoreB: teamId === "B" ? score : state.scoreB })),
        manualSetSets: (teamId, sets) => set((state) => ({ ...state, setsWonA: teamId === "A" ? sets : state.setsWonA, setsWonB: teamId === "B" ? sets : state.setsWonB })),

        incrementScore: (teamId: TeamId) => set((state) => {
          let { scoreA, scoreB, servingTeam, courtA, courtB, liberoConfigA, liberoConfigB, liberoSwapA, liberoSwapB, players } = state;
          
          let nextScoreA = scoreA; let nextScoreB = scoreB;
          let nextServingTeam = servingTeam;
          let nextCourtA = { ...courtA }; let nextCourtB = { ...courtB };
          let nextSwapA = { ...liberoSwapA }; let nextSwapB = { ...liberoSwapB };
          let toast: ToastState | null = null;

          if (teamId === "A") nextScoreA++; else nextScoreB++;

          if (teamId !== servingTeam) {
            nextServingTeam = teamId;
            const sideoutTeamId = teamId;
            const courtToRotate = sideoutTeamId === "A" ? nextCourtA : nextCourtB;
            const isLeft = state.leftTeam === sideoutTeamId;
            const rotated = isLeft ? rotateCourtForward(courtToRotate) : rotateCourtBackward(courtToRotate);
            const mapping = isLeft ? "FORWARD" : "BACKWARD";
            const config = sideoutTeamId === "A" ? liberoConfigA : liberoConfigB;
            const swap = sideoutTeamId === "A" ? liberoSwapA : liberoSwapB;

            const applied = applyLiberoAutomation({
              teamId: sideoutTeamId, court: rotated, players, config, swap, rotationMapping: mapping, servingTeam: nextServingTeam
            });

            if (hasIllegalLiberoFrontRow(applied.court, players)) {
              toast = makeToast("Rotation blocked: Libero in front row", "error");
            } else {
              if (sideoutTeamId === "A") { nextCourtA = applied.court; nextSwapA = applied.swap; }
              else { nextCourtB = applied.court; nextSwapB = applied.swap; }
              if (applied.toast) toast = applied.toast;
            }

            const losingTeamId = opponentOf(teamId);
            const configL = losingTeamId === "A" ? liberoConfigA : liberoConfigB;
            const swapL = losingTeamId === "A" ? nextSwapA : nextSwapB;
            const courtL = losingTeamId === "A" ? nextCourtA : nextCourtB;

            const appliedL = applyLiberoAutomation({
                teamId: losingTeamId, court: courtL, players, config: configL, swap: swapL, servingTeam: nextServingTeam
            });

            if (!hasIllegalLiberoFrontRow(appliedL.court, players)) {
               if (losingTeamId === "A") { nextCourtA = appliedL.court; nextSwapA = appliedL.swap; }
               else { nextCourtB = appliedL.court; nextSwapB = appliedL.swap; }
               if (appliedL.toast && !toast) toast = appliedL.toast;
            }
          }

          const rules = state.setRules;
          const pointsToWin = pointsToWinForSet(rules, state.setNumber, state.setsWonA, state.setsWonB);
          const autoWinner = hasSetWinner(nextScoreA, nextScoreB, pointsToWin, rules.winBy);
          
          const baseNext = { scoreA: nextScoreA, scoreB: nextScoreB, servingTeam: nextServingTeam, courtA: nextCourtA, courtB: nextCourtB, liberoSwapA: nextSwapA, liberoSwapB: nextSwapB, rallyInProgress: false, toast: toast || state.toast };

          if (!autoWinner) return baseNext;

          const saved = buildSavedSet({ setNumber: state.setNumber, pointsToWin, winner: autoWinner, finalScoreA: nextScoreA, finalScoreB: nextScoreB, events: state.events.slice().reverse(), players: state.players });
          const nextSetsWonA = autoWinner === "A" ? state.setsWonA + 1 : state.setsWonA;
          const nextSetsWonB = autoWinner === "B" ? state.setsWonB + 1 : state.setsWonB;
          const after = resetAfterSet({ ...state, ...baseNext, setRules: rules } as any, autoWinner);

          return { ...baseNext, savedSets: [saved, ...state.savedSets], setsWonA: nextSetsWonA, setsWonB: nextSetsWonB, setNumber: state.setNumber + 1, ...after as any, toast: makeToast(`Set ${state.setNumber} saved. Winner: Team ${autoWinner}.`, "info") };
        }),

        decrementScore: (teamId) => set((state) => {
            const nextScore = teamId === "A" ? Math.max(0, state.scoreA - 1) : Math.max(0, state.scoreB - 1);
            let partial: Partial<MatchStore> = {
                scoreA: teamId === "A" ? nextScore : state.scoreA,
                scoreB: teamId === "B" ? nextScore : state.scoreB,
            };

            if (state.servingTeam === teamId) {
                const prevServing = opponentOf(teamId);
                partial.servingTeam = prevServing;

                const currentCourt = teamId === "A" ? state.courtA : state.courtB;
                const isLeft = state.leftTeam === teamId;
                const rotated = isLeft ? rotateCourtBackward(currentCourt) : rotateCourtForward(currentCourt);
                const mapping = isLeft ? "BACKWARD" : "FORWARD";
                
                const config = teamId === "A" ? state.liberoConfigA : state.liberoConfigB;
                const swap = teamId === "A" ? state.liberoSwapA : state.liberoSwapB;

                const applied = applyLiberoAutomation({
                    teamId,
                    court: rotated,
                    players: state.players,
                    config,
                    swap,
                    rotationMapping: mapping,
                    servingTeam: prevServing
                });

                if (teamId === "A") {
                    partial.courtA = applied.court;
                    partial.liberoSwapA = applied.swap;
                } else {
                    partial.courtB = applied.court;
                    partial.liberoSwapB = applied.swap;
                }
                if (applied.toast) partial.toast = applied.toast;
            }

            return partial;
        }),
      };
    },
    {
      name: "vb-match-store",
      version: 17,
      migrate: (persisted: any) => {
        const state = persisted?.state ?? persisted ?? {};
        const players = Array.isArray(state.players) ? state.players : [];
        const validPlayerIds = new Set(players.map((p: any) => p.id));
        const cleanMbIds = (ids: any) => (Array.isArray(ids) ? ids.filter((id: string) => validPlayerIds.has(id)) : []);
        const cleanLiberoId = (id: any) => (validPlayerIds.has(id) ? id : null);
        return {
          ...state,
          liberoConfigA: { ...defaultLiberoConfig(), ...(state.liberoConfigA ?? {}), liberoId: cleanLiberoId(state.liberoConfigA?.liberoId), mbIds: cleanMbIds(state.liberoConfigA?.mbIds) },
          liberoConfigB: { ...defaultLiberoConfig(), ...(state.liberoConfigB ?? {}), liberoId: cleanLiberoId(state.liberoConfigB?.liberoId), mbIds: cleanMbIds(state.liberoConfigB?.mbIds) },
          setRules: { ...defaultSetRules(), ...(state.setRules ?? {}) },
          setNumber: typeof state.setNumber === "number" ? state.setNumber : 1,
          setsWonA: typeof state.setsWonA === "number" ? state.setsWonA : 0,
          setsWonB: typeof state.setsWonB === "number" ? state.setsWonB : 0,
          savedSets: Array.isArray(state.savedSets) ? state.savedSets : [],
          matchSummaryOpen: false,
          subsUsedA: 0, subsUsedB: 0, activeSubsA: {}, activeSubsB: {} // Init new fields
        };
      },
      partialize: (state) => ({
        players: state.players, courtA: state.courtA, courtB: state.courtB, scoreA: state.scoreA, scoreB: state.scoreB, servingTeam: state.servingTeam, events: state.events, leftTeam: state.leftTeam, liberoConfigA: state.liberoConfigA, liberoConfigB: state.liberoConfigB, rallyCount: state.rallyCount, rallyInProgress: state.rallyInProgress, serviceRunTeam: state.serviceRunTeam, serviceRunCount: state.serviceRunCount, liberoSwapA: state.liberoSwapA, liberoSwapB: state.liberoSwapB, setRules: state.setRules, setNumber: state.setNumber, setsWonA: state.setsWonA, setsWonB: state.setsWonB, savedSets: state.savedSets,
        subsUsedA: state.subsUsedA, subsUsedB: state.subsUsedB, activeSubsA: state.activeSubsA, activeSubsB: state.activeSubsB
      }),
    }
  )
);