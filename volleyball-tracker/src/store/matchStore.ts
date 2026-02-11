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

const rotateCourtForward = (court: CourtState): CourtState => {
  const next: CourtState = { ...court };
  const current = ROTATION_ORDER.map((s) => next[s]);
  current.unshift(current.pop()!);
  ROTATION_ORDER.forEach((s, idx) => { next[s] = current[idx] ?? null; });
  return next;
};

const rotateCourtBackward = (court: CourtState): CourtState => {
  const next: CourtState = { ...court };
  const current = ROTATION_ORDER.map((s) => next[s]);
  current.push(current.shift()!);
  ROTATION_ORDER.forEach((s, idx) => { next[s] = current[idx] ?? null; });
  return next;
};

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
    // If the Libero is in the Front Row, they MUST swap out.
    if (isFrontRowSlot(nextSwap.slot)) {
      if (nextCourt[nextSwap.slot] === nextSwap.liberoId) nextCourt[nextSwap.slot] = nextSwap.replacedMbId;
      return { court: nextCourt, swap: defaultLiberoSwap(), toast: makeToast(`Auto-sub: ${teamId} Libero out (MB returns to front row).`, "info") };
    }
    // Integrity check
    if (nextCourt[nextSwap.slot] !== nextSwap.liberoId) {
      if (nextCourt[nextSwap.slot] === nextSwap.replacedMbId) nextCourt[nextSwap.slot] = nextSwap.liberoId;
      else nextSwap = defaultLiberoSwap();
    }
    if (hasIllegalLiberoFrontRow(nextCourt, players)) return { court, swap: defaultLiberoSwap(), toast: makeToast("Illegal state prevented: Libero in front row.", "error") };
    return { court: nextCourt, swap: nextSwap };
  }

  // If this team is Serving, the MB stays in to serve (Libero cannot serve in this logic).
  // Unless your rules allow Libero serve, usually MB serves then swaps.
  if (params.servingTeam === teamId) return { court: nextCourt, swap: nextSwap };

  // Try to swap Libero IN for a back-row MB
  const liberoSlot = config.liberoId ? findSlotOf(config.liberoId) : null;
  if (!liberoSlot) {
    let chosenMbId: string | null = null;
    let chosenMbSlot: RotationSlot | null = null;
    for (const mbId of mbIds) {
      const mbSlot = findSlotOf(mbId);
      if (mbSlot && isBackRowSlot(mbSlot)) { chosenMbId = mbId; chosenMbSlot = mbSlot; break; }
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
const POG_MULTIPLIERS: Record<RoleKey, any> = {
  WINGERS: { SERVE: 1, RECEPTION: 1, RECEPTION_FAULT: -1, DIG: 1, DIG_FAULT: -1, ATTACK: 1, BLOCK: 1, SET: 0, SET_FAULT: 0 },
  MIDDLE_BLOCKER: { SERVE: 1, RECEPTION: 0, RECEPTION_FAULT: 0, DIG: 1, DIG_FAULT: -1, ATTACK: 2, BLOCK: 2, SET: 0, SET_FAULT: 0 },
  LIBERO: { SERVE: 0, RECEPTION: 1.5, RECEPTION_FAULT: -1, DIG: 1, DIG_FAULT: -1, ATTACK: 0, BLOCK: 0, SET: 0.5, SET_FAULT: 0 },
  SETTER: { SERVE: 1, RECEPTION: 0, RECEPTION_FAULT: 0, DIG: 1, DIG_FAULT: -1, ATTACK: 0.5, BLOCK: 1, SET: 1, SET_FAULT: -1 },
};

type StatKey = "SERVE" | "RECEPTION" | "RECEPTION_FAULT" | "DIG" | "DIG_FAULT" | "ATTACK" | "BLOCK" | "SET" | "SET_FAULT";
type PlayerSetStats = { counts: Record<StatKey, number>; pogPoints: number; };
const emptyCounts = (): Record<StatKey, number> => ({ SERVE: 0, RECEPTION: 0, RECEPTION_FAULT: 0, DIG: 0, DIG_FAULT: 0, ATTACK: 0, BLOCK: 0, SET: 0, SET_FAULT: 0 });

function roleFromPlayer(p: Player | null | undefined): RoleKey {
  const pos = normKey(p?.position ?? "");
  if (pos === "MB" || pos.includes("MIDDLE")) return "MIDDLE_BLOCKER";
  if (pos === "L" || pos.includes("LIBERO")) return "LIBERO";
  if (pos === "S" || pos.includes("SETTER")) return "SETTER";
  return "WINGERS";
}

function classifyForPog(skillKey: string, outcomeKey: string): StatKey | null {
  const isFault = outcomeKey.includes("FAULT") || outcomeKey.includes("ERROR") || outcomeKey === "OUT" || outcomeKey === "NET";
  if (skillKey.includes("RECEIVE")) return isFault ? "RECEPTION_FAULT" : "RECEPTION";
  if (skillKey.includes("DIG")) return isFault ? "DIG_FAULT" : "DIG";
  if (skillKey.includes("SET")) return isFault ? "SET_FAULT" : "SET";
  if (skillKey.includes("SERVE")) return "SERVE";
  if (skillKey.includes("ATTACK") || skillKey.includes("SPIKE")) return (outcomeKey.includes("KILL") || outcomeKey === "POINT" || outcomeKey === "WIN") ? "ATTACK" : null;
  if (skillKey.includes("BLOCK")) return (outcomeKey.includes("BLOCK_POINT") || outcomeKey === "POINT") ? "BLOCK" : null;
  return null;
}

function calcPlayerPogPoints(p: Player, counts: Record<StatKey, number>): number {
  const role = roleFromPlayer(p);
  const m = POG_MULTIPLIERS[role];
  return counts.SERVE * m.SERVE + counts.RECEPTION * m.RECEPTION + counts.RECEPTION_FAULT * m.RECEPTION_FAULT +
    counts.DIG * m.DIG + counts.DIG_FAULT * m.DIG_FAULT + counts.ATTACK * m.ATTACK +
    counts.BLOCK * m.BLOCK + counts.SET * m.SET + counts.SET_FAULT * m.SET_FAULT;
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
const WIN_OUTCOMES = new Set(["SUCCESS", "KILL", "KILL_BLOCK", "ACE", "POINT", "WIN", "STUFF", "BLOCK_POINT"]);
const ERROR_OUTCOMES = new Set(["ERROR", "ATTACK_ERROR", "SERVE_ERROR", "SERVICE_ERROR", "BLOCK_ERROR", "RECEIVE_ERROR", "DIG_ERROR", "FAULT", "OUT", "NET"]);

function isPointByPlayer(ev: InternalEvent): boolean { return !!ev.pointWinner && ev.pointWinner === ev.teamId; }
function isErrorByPlayer(ev: InternalEvent): boolean { return !!ev.pointWinner && ev.pointWinner !== opponentOf(ev.teamId) && (ERROR_OUTCOMES.has(ev.outcomeKey) || ev.outcomeKey.includes("ERROR") || ev.outcomeKey.includes("FAULT")); }

function computeMatchStatsFromEvents(params: { players: Player[]; events: InternalEvent[]; }): Record<string, PlayerMatchStats> {
  const { players, events } = params;
  const out: Record<string, PlayerMatchStats> = {};
  const ensure = (pid: string) => { if (!out[pid]) out[pid] = emptyMatchStats(); return out[pid]; };

  for (const ev of events) {
    const pid = ev.playerId;
    const stats = ensure(pid);
    const k = classifyForPog(ev.skillKey, ev.outcomeKey);
    if (k) stats.counts[k] += 1;
    if (isPointByPlayer(ev)) {
      stats.points += 1;
      const sk = ev.skillKey; const ok = ev.outcomeKey;
      if (WIN_OUTCOMES.has(ok) || ok.includes("KILL") || ok.includes("ACE")) {
        if (sk.includes("SERVE") && ok.includes("ACE")) stats.aces += 1;
        else if (sk.includes("SPIKE") || sk.includes("ATTACK")) stats.kills += 1;
        else if (sk.includes("BLOCK")) stats.blockPoints += 1;
      }
    }
    if (isErrorByPlayer(ev)) stats.errors += 1;
  }
  for (const [pid, stats] of Object.entries(out)) {
    const p = players.find((x) => x.id === pid);
    if (p) stats.pogPoints = calcPlayerPogPoints(p, stats.counts);
  }
  return out;
}

type SetRules = { bestOf: 3 | 5; regularPoints: number; decidingPoints: number; winBy: number; clearCourtsOnSetEnd: boolean; };
const defaultSetRules = (): SetRules => ({ bestOf: 3, regularPoints: 25, decidingPoints: 15, winBy: 2, clearCourtsOnSetEnd: false });

function pointsToWinForSet(rules: SetRules, setNumber: number, setsWonA: number, setsWonB: number) {
  const needToWinMatch = Math.ceil(rules.bestOf / 2);
  const isDeciding = setsWonA === needToWinMatch - 1 && setsWonB === needToWinMatch - 1;
  return isDeciding ? rules.decidingPoints : rules.regularPoints;
}

function hasSetWinner(scoreA: number, scoreB: number, pointsToWin: number, winBy: number) {
  const max = Math.max(scoreA, scoreB);
  const diff = Math.abs(scoreA - scoreB);
  if (max < pointsToWin) return null;
  if (diff < winBy) return null;
  return scoreA > scoreB ? ("A" as TeamId) : ("B" as TeamId);
}

type InternalEvent = { id: string; ts: number; teamId: TeamId; playerId: string; slot: RotationSlot; skill: Skill; outcome: Outcome; pointWinner?: TeamId; prevScoreA: number; prevScoreB: number; prevServingTeam: TeamId; prevCourtA: CourtState; prevCourtB: CourtState; prevLiberoSwapA: LiberoSwap; prevLiberoSwapB: LiberoSwap; prevRallyCount: number; prevRallyInProgress: boolean; prevServiceRunTeam: TeamId; prevServiceRunCount: number; didSideoutRotate: boolean; skillKey: string; outcomeKey: string; };
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
  
  // ✅ NEW MANUAL SETTERS
  manualSetScore: (teamId: TeamId, score: number) => void;
  manualSetSets: (teamId: TeamId, sets: number) => void;
  incrementScore: (teamId: TeamId) => void;
  decrementScore: (teamId: TeamId) => void;
};

export const useMatchStore = create<MatchStore>()(
  persist(
    (set, get) => {
      const isTeamOnLeft = (teamId: TeamId) => get().leftTeam === teamId;
      const rotateForwardForTeam = (teamId: TeamId, court: CourtState) => isTeamOnLeft(teamId) ? rotateCourtForward(court) : rotateCourtBackward(court);
      const rotateBackwardForTeam = (teamId: TeamId, court: CourtState) => isTeamOnLeft(teamId) ? rotateCourtBackward(court) : rotateCourtForward(court);
      const rotationMappingForForward = (teamId: TeamId): "FORWARD" | "BACKWARD" => isTeamOnLeft(teamId) ? "FORWARD" : "BACKWARD";
      const rotationMappingForBackward = (teamId: TeamId): "FORWARD" | "BACKWARD" => isTeamOnLeft(teamId) ? "BACKWARD" : "FORWARD";
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
        const base: Partial<MatchStore> = { scoreA: 0, scoreB: 0, events: [], rallyCount: 0, rallyInProgress: false, serviceRunTeam: nextServingTeam, serviceRunCount: 0, servingTeam: nextServingTeam, liberoSwapA: defaultLiberoSwap(), liberoSwapB: defaultLiberoSwap(), selected: null, activeScoresheet: null };
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
          const cfgA = { ...state.liberoConfigA }; if (cfgA.liberoId === id) cfgA.liberoId = null; cfgA.mbIds = (cfgA.mbIds ?? []).filter((mbId) => mbId !== id);
          const cfgB = { ...state.liberoConfigB }; if (cfgB.liberoId === id) cfgB.liberoId = null; cfgB.mbIds = (cfgB.mbIds ?? []).filter((mbId) => mbId !== id);
          return { players: nextPlayers, liberoConfigA: cfgA, liberoConfigB: cfgB };
        }),

        assignPlayerToSlot: (teamId, slot, playerId) => set((state) => {
          const key = teamId === "A" ? "courtA" : "courtB"; const court = { ...state[key] };
          if (Object.values(court).includes(playerId)) return { ...state, toast: makeToast("That player is already on the court.", "info") };
          const p = state.players.find((x) => x.id === playerId);
          if (p && isLiberoPlayer(p) && isFrontRowSlot(slot)) return { ...state, toast: makeToast("Illegal assignment: Libero cannot be placed in the front row.", "error") };
          court[slot] = playerId;
          if (hasIllegalLiberoFrontRow(court, state.players)) return { ...state, toast: makeToast("Illegal state prevented: Libero cannot be in the front row.", "error") };
          const applied = applyLiberoAutomation({ teamId, court, players: state.players, config: getConfig(state, teamId), swap: getSwap(state, teamId), servingTeam: state.servingTeam });
          const next: any = { ...state, [key]: applied.court, ...setSwapPatch(teamId, applied.swap) };
          if (applied.toast) next.toast = applied.toast;
          return next;
        }),
        substituteInSlot: (teamId, slot, newPlayerId) => get().assignPlayerToSlot(teamId, slot, newPlayerId),
        clearSlot: (teamId, slot) => set((state) => { const key = teamId === "A" ? "courtA" : "courtB"; const court = { ...state[key] }; court[slot] = null; return { ...state, [key]: court }; }),
        getOnCourtPlayerIds: (teamId) => { const state = get(); const court = teamId === "A" ? state.courtA : state.courtB; return Object.values(court).filter(Boolean) as string[]; },
        
        rotateTeam: (teamId) => set((state) => {
          const key = teamId === "A" ? "courtA" : "courtB"; const rotated = rotateForwardForTeam(teamId, state[key]);
          const applied = applyLiberoAutomation({ teamId, court: rotated, players: state.players, config: getConfig(state, teamId), swap: getSwap(state, teamId), rotationMapping: rotationMappingForForward(teamId), servingTeam: state.servingTeam });
          if (hasIllegalLiberoFrontRow(applied.court, state.players)) return { ...state, toast: makeToast("Illegal rotation: Libero cannot rotate into the front row.", "error") };
          const next: any = { ...state, [key]: applied.court, ...setSwapPatch(teamId, applied.swap) };
          if (applied.toast) next.toast = applied.toast;
          return next;
        }),
        rotateTeamBackward: (teamId) => set((state) => {
          const key = teamId === "A" ? "courtA" : "courtB"; const rotated = rotateBackwardForTeam(teamId, state[key]);
          const applied = applyLiberoAutomation({ teamId, court: rotated, players: state.players, config: getConfig(state, teamId), swap: getSwap(state, teamId), rotationMapping: rotationMappingForBackward(teamId), servingTeam: state.servingTeam });
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
          const ERROR_OUTCOMES = new Set(["ERROR", "ATTACK_ERROR", "SERVE_ERROR", "SERVICE_ERROR", "BLOCK_ERROR", "RECEIVE_ERROR", "DIG_ERROR", "FAULT", "OUT", "NET"]);
          const isError = ERROR_OUTCOMES.has(outcomeKey) || outcomeKey.includes("ERROR") || outcomeKey.includes("FAULT");

          if (isError) pointWinner = opponentOf(teamId);
          else {
            const WIN_OUTCOMES = new Set(["SUCCESS", "KILL", "KILL_BLOCK", "ACE", "POINT", "WIN", "STUFF", "BLOCK_POINT"]);
            const isWin = WIN_OUTCOMES.has(outcomeKey) || outcomeKey.includes("KILL") || outcomeKey.includes("ACE");
            const isServe = skillKey.includes("SERVE");
            const isSpike = skillKey.includes("SPIKE") || skillKey.includes("ATTACK") || skillKey === "HIT";
            const isBlock = skillKey.includes("BLOCK");
            if ((isServe || isSpike || isBlock) && isWin) pointWinner = teamId;
          }

          const e: InternalEvent = {
            id: crypto.randomUUID(), ts: Date.now(), teamId, playerId, slot, skill, outcome, pointWinner,
            prevScoreA: state.scoreA, prevScoreB: state.scoreB, prevServingTeam: state.servingTeam, prevCourtA: state.courtA, prevCourtB: state.courtB,
            prevLiberoSwapA: state.liberoSwapA, prevLiberoSwapB: state.liberoSwapB, prevRallyCount: state.rallyCount, prevRallyInProgress: state.rallyInProgress,
            prevServiceRunTeam: state.serviceRunTeam, prevServiceRunCount: state.serviceRunCount, didSideoutRotate: false, skillKey, outcomeKey,
          };

          return { events: [e, ...state.events], toast: makeToast("Stat recorded.", "info") };
        }),

        undoLastEvent: () => set((state) => {
          if (state.events.length === 0) return state;
          const [last, ...rest] = state.events;
          return { ...state, events: rest, toast: makeToast("Undid last stat.", "info") };
        }),

        undoFromEvent: (eventId: string) => set((state) => {
          const index = state.events.findIndex((e) => e.id === eventId);
          if (index === -1) return state;
          return { ...state, events: state.events.slice(index + 1), toast: makeToast("Reverted stats.", "info") };
        }),

        resetCourt: (teamId) => set((state) => { if (teamId === "A") return { ...state, courtA: emptyCourt(), liberoSwapA: defaultLiberoSwap() }; return { ...state, courtB: emptyCourt(), liberoSwapB: defaultLiberoSwap() }; }),
        resetMatch: () => set((state) => ({ ...state, courtA: emptyCourt(), courtB: emptyCourt(), selected: null, activeScoresheet: null, events: [], scoreA: 0, scoreB: 0, servingTeam: "A", toast: null, rallyCount: 0, rallyInProgress: false, serviceRunTeam: "A", serviceRunCount: 0, liberoSwapA: defaultLiberoSwap(), liberoSwapB: defaultLiberoSwap(), setNumber: 1, setsWonA: 0, setsWonB: 0, savedSets: [], setRules: defaultSetRules(), matchSummaryOpen: false })),

        // ✅ MANUAL ACTIONS
        manualSetScore: (teamId, score) => set((state) => ({ ...state, scoreA: teamId === "A" ? score : state.scoreA, scoreB: teamId === "B" ? score : state.scoreB })),
        manualSetSets: (teamId, sets) => set((state) => ({ ...state, setsWonA: teamId === "A" ? sets : state.setsWonA, setsWonB: teamId === "B" ? sets : state.setsWonB })),

        // ✅ INCREMENT SCORE: Adds point, Rotates if sideout, Runs Libero logic (For BOTH TEAMS)
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
            // 1. Handle Sideout Team (Winner): Rotate + AutoSub
            const sideoutTeamId = teamId;
            const isLeft = state.leftTeam === sideoutTeamId;
            const courtToRotate = sideoutTeamId === "A" ? nextCourtA : nextCourtB;
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

            // 2. Handle Losing Team (Loser): AutoSub Only (e.g. MB finished serving)
            // They don't rotate, but they are no longer serving, so Libero might need to swap in.
            const losingTeamId = opponentOf(teamId);
            const configL = losingTeamId === "A" ? liberoConfigA : liberoConfigB;
            const swapL = losingTeamId === "A" ? nextSwapA : nextSwapB;
            const courtL = losingTeamId === "A" ? nextCourtA : nextCourtB;

            const appliedL = applyLiberoAutomation({
                teamId: losingTeamId, court: courtL, players, config: configL, swap: swapL, servingTeam: nextServingTeam
            });

            // We accept the swap if valid
            if (!hasIllegalLiberoFrontRow(appliedL.court, players)) {
               if (losingTeamId === "A") { nextCourtA = appliedL.court; nextSwapA = appliedL.swap; }
               else { nextCourtB = appliedL.court; nextSwapB = appliedL.swap; }
               // Priorities toast for winner if both trigger
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

        decrementScore: (teamId) => set(state => ({
            scoreA: teamId === "A" ? Math.max(0, state.scoreA - 1) : state.scoreA,
            scoreB: teamId === "B" ? Math.max(0, state.scoreB - 1) : state.scoreB,
        })),
      };
    },
    {
      name: "vb-match-store",
      version: 6,
      migrate: (persisted: any) => {
        const state = persisted?.state ?? persisted ?? {};
        const players = Array.isArray(state.players) ? state.players : [];
        const validPlayerIds = new Set(players.map((p: any) => p.id));
        const cleanMbIds = (ids: any) => {
          if (!Array.isArray(ids)) return [];
          return ids.filter((id: string) => validPlayerIds.has(id));
        };
        const cleanLiberoId = (id: any) => {
          return validPlayerIds.has(id) ? id : null;
        };
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
        };
      },
      partialize: (state) => ({
        players: state.players, courtA: state.courtA, courtB: state.courtB, scoreA: state.scoreA, scoreB: state.scoreB, servingTeam: state.servingTeam, events: state.events, leftTeam: state.leftTeam, liberoConfigA: state.liberoConfigA, liberoConfigB: state.liberoConfigB, rallyCount: state.rallyCount, rallyInProgress: state.rallyInProgress, serviceRunTeam: state.serviceRunTeam, serviceRunCount: state.serviceRunCount, liberoSwapA: state.liberoSwapA, liberoSwapB: state.liberoSwapB, setRules: state.setRules, setNumber: state.setNumber, setsWonA: state.setsWonA, setsWonB: state.setsWonB, savedSets: state.savedSets,
      }),
    }
  )
);