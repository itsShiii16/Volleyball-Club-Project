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

// ✅ Tracker Modes
export type TrackerMode = "SCORING" | "NON_SCORING" | "FULL";

const emptyCourt = (): CourtState => ({
  1: null, 2: null, 3: null, 4: null, 5: null, 6: null,
});

const opponentOf = (teamId: TeamId): TeamId => (teamId === "A" ? "B" : "A");

const normKey = (v: unknown) =>
  String(v).trim().toUpperCase().replace(/[^\w\s-]/g, "").replace(/[\s-]+/g, "_");

const ROTATION_ORDER: RotationSlot[] = [1, 6, 5, 4, 3, 2];

// --- ROTATION HELPERS ---
const rotateCourtForward = (court: CourtState): CourtState => ({
  1: court[2], 6: court[1], 5: court[6], 4: court[5], 3: court[4], 2: court[3],
});

const rotateCourtBackward = (court: CourtState): CourtState => ({
  1: court[6], 6: court[5], 5: court[4], 4: court[3], 3: court[2], 2: court[1],
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

// --- TOASTS ---
type ToastType = "info" | "warn" | "error";
export type ToastState = { id: string; message: string; type: ToastType; };
const makeToast = (message: string, type: ToastType = "warn"): ToastState => ({ id: crypto.randomUUID(), message, type });

// --- LIBERO CONFIG ---
type LiberoConfig = { 
  enabled: boolean; 
  mode: "CLASSIC" | "DUAL"; 
  liberoId: string | null; 
  secondLiberoId: string | null; 
  replacementIds: string[]; 
};

type LiberoSwap = { active: boolean; slot: RotationSlot | null; liberoId: string | null; replacedPlayerId: string | null; };

const defaultLiberoConfig = (): LiberoConfig => ({ 
  enabled: false, 
  mode: "CLASSIC",
  liberoId: null, 
  secondLiberoId: null,
  replacementIds: [] 
});

const defaultLiberoSwap = (): LiberoSwap => ({ active: false, slot: null, liberoId: null, replacedPlayerId: null });

const mapSlotForward = (slot: RotationSlot): RotationSlot => {
  const idx = ROTATION_ORDER.indexOf(slot);
  return idx < 0 ? slot : ROTATION_ORDER[(idx + 1) % ROTATION_ORDER.length];
};

const mapSlotBackward = (slot: RotationSlot): RotationSlot => {
  const idx = ROTATION_ORDER.indexOf(slot);
  return idx < 0 ? slot : ROTATION_ORDER[(idx - 1 + ROTATION_ORDER.length) % ROTATION_ORDER.length];
};

// --- LIBERO AUTOMATION LOGIC ---
function applyLiberoAutomation(params: { teamId: TeamId; court: CourtState; players: Player[]; config: LiberoConfig; swap: LiberoSwap; rotationMapping?: "FORWARD" | "BACKWARD"; servingTeam?: TeamId; }): { court: CourtState; swap: LiberoSwap; toast?: ToastState } {
  const { court, players, config, teamId, servingTeam } = params;
  let nextCourt: CourtState = { ...court };
  let nextSwap: LiberoSwap = { ...params.swap };
  const cfgTargetIds = Array.isArray(config.replacementIds) ? config.replacementIds : [];

  if (!config.enabled || !config.liberoId || cfgTargetIds.length === 0) {
    if (nextSwap.active) nextSwap = defaultLiberoSwap();
    return { court: nextCourt, swap: nextSwap };
  }

  let targetLiberoId = config.liberoId;
  const isServing = servingTeam === teamId;
  
  if (config.mode === "DUAL" && config.secondLiberoId) {
      targetLiberoId = isServing ? config.secondLiberoId : config.liberoId;
  }

  const targetIds = Array.from(new Set(cfgTargetIds.filter(Boolean))).slice(0, 2);
  const libero = players.find((p) => p.id === targetLiberoId) || null;
  const targetPlayers = targetIds.map((id) => players.find((p) => p.id === id) || null).filter(Boolean) as Player[];

  if (!libero) { if (nextSwap.active) nextSwap = defaultLiberoSwap(); return { court: nextCourt, swap: nextSwap, toast: makeToast("Libero config invalid.", "warn") }; }
  if (!isLiberoPlayer(libero)) return { court: nextCourt, swap: defaultLiberoSwap(), toast: makeToast("Selected player is not a Libero.", "warn") };

  const findSlotOf = (pid: string) => {
    const entries = Object.entries(nextCourt) as Array<[string, string | null]>;
    const found = entries.find(([, v]) => v === pid);
    return found ? (Number(found[0]) as RotationSlot) : null;
  };

  if (nextSwap.active && nextSwap.slot && params.rotationMapping) {
    nextSwap.slot = params.rotationMapping === "FORWARD" ? mapSlotForward(nextSwap.slot) : mapSlotBackward(nextSwap.slot);
  }

  if (nextSwap.active && nextSwap.slot && nextSwap.liberoId && nextSwap.replacedPlayerId) {
    if (isFrontRowSlot(nextSwap.slot)) {
      if (nextCourt[nextSwap.slot] === nextSwap.liberoId || nextCourt[nextSwap.slot] === config.liberoId || nextCourt[nextSwap.slot] === config.secondLiberoId) {
          nextCourt[nextSwap.slot] = nextSwap.replacedPlayerId;
      }
      return { court: nextCourt, swap: defaultLiberoSwap(), toast: makeToast(`Auto-sub: Libero out (Front Row).`, "info") };
    }
    
    if (nextSwap.active && nextSwap.liberoId !== targetLiberoId) {
        if (nextCourt[nextSwap.slot] === nextSwap.liberoId) {
            nextCourt[nextSwap.slot] = targetLiberoId;
            nextSwap.liberoId = targetLiberoId;
        }
    }

    if (nextCourt[nextSwap.slot] === nextSwap.replacedPlayerId) nextSwap = defaultLiberoSwap();
    return { court: nextCourt, swap: nextSwap };
  }

  if (!nextSwap.active) {
    let chosenTargetId: string | null = null;
    let chosenTargetSlot: RotationSlot | null = null;
    
    for (const targetId of targetIds) {
      const targetSlot = findSlotOf(targetId);
      if (targetSlot && isBackRowSlot(targetSlot)) { 
         if (params.servingTeam === teamId && targetSlot === 1) continue; 
         chosenTargetId = targetId; chosenTargetSlot = targetSlot; break; 
      }
    }

    if (chosenTargetId && chosenTargetSlot) {
      nextCourt[chosenTargetSlot] = targetLiberoId;
      const started: LiberoSwap = { active: true, slot: chosenTargetSlot, liberoId: targetLiberoId, replacedPlayerId: chosenTargetId };
      const pOut = players.find((p) => p.id === chosenTargetId) || null;
      return { court: nextCourt, swap: started, toast: makeToast(`Libero in: #${pOut?.jerseyNumber}`, "info") };
    }
  }
  
  return { court: nextCourt, swap: nextSwap };
}

// --- STATS & POG ---
type RoleKey = "WINGERS" | "MIDDLE_BLOCKER" | "LIBERO" | "SETTER";
type StatKey = "SERVE_ACE" | "SERVE_SUCCESS" | "SERVE_ERROR" | "RECEPTION_EXC" | "RECEPTION_ATT" | "RECEPTION_ERR" | "DIG_EXC" | "DIG_ATT" | "DIG_ERR" | "ATTACK_KILL" | "ATTACK_ATT" | "ATTACK_ERR" | "BLOCK_KILL" | "BLOCK_ERR" | "SET_EXC" | "SET_RUN" | "SET_ERR";

const POG_MULTIPLIERS: Record<RoleKey, Record<StatKey, number>> = {
  WINGERS: { SERVE_ACE: 2, SERVE_SUCCESS: 0, SERVE_ERROR: -2, RECEPTION_EXC: 2, RECEPTION_ATT: 1, RECEPTION_ERR: -2, DIG_EXC: 2, DIG_ATT: 1, DIG_ERR: 0, ATTACK_KILL: 2, ATTACK_ATT: 0, ATTACK_ERR: -2, BLOCK_KILL: 2, BLOCK_ERR: -2, SET_EXC: 0, SET_RUN: 0, SET_ERR: 0 },
  MIDDLE_BLOCKER: { SERVE_ACE: 2, SERVE_SUCCESS: 0, SERVE_ERROR: -2, RECEPTION_EXC: 2, RECEPTION_ATT: 1, RECEPTION_ERR: 0, DIG_EXC: 2, DIG_ATT: 1, DIG_ERR: 0, ATTACK_KILL: 4, ATTACK_ATT: 0, ATTACK_ERR: -4, BLOCK_KILL: 4, BLOCK_ERR: -4, SET_EXC: 0, SET_RUN: 0, SET_ERR: 0 },
  LIBERO: { SERVE_ACE: 0, SERVE_SUCCESS: 0, SERVE_ERROR: 0, RECEPTION_EXC: 3, RECEPTION_ATT: 1, RECEPTION_ERR: -2, DIG_EXC: 2, DIG_ATT: 1, DIG_ERR: -2, ATTACK_KILL: 0, ATTACK_ATT: 0, ATTACK_ERR: 0, BLOCK_KILL: 0, BLOCK_ERR: 0, SET_EXC: 0, SET_RUN: 2, SET_ERR: -2 },
  SETTER: { SERVE_ACE: 2, SERVE_SUCCESS: 0, SERVE_ERROR: -2, RECEPTION_EXC: 0, RECEPTION_ATT: 0, RECEPTION_ERR: 0, DIG_EXC: 2, DIG_ATT: 1, DIG_ERR: 0, ATTACK_KILL: 1, ATTACK_ATT: 0, ATTACK_ERR: -2, BLOCK_KILL: 2, BLOCK_ERR: -2, SET_EXC: 2, SET_RUN: 0, SET_ERR: -2 },
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
  if (p?.position === "MB" || pos.includes("MIDDLE")) return "MB";
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

// --- RULES & LOGIC ---
type SetRules = { bestOf: 3 | 5 | 1; regularPoints: number; decidingPoints: number; winBy: number; clearCourtsOnSetEnd: boolean; };
const defaultSetRules = (): SetRules => ({ bestOf: 3, regularPoints: 25, decidingPoints: 15, winBy: 2, clearCourtsOnSetEnd: false });

function pointsToWinForSet(rules: SetRules, setNumber: number) { 
  const maxSets = rules.bestOf;
  const isDeciding = setNumber === maxSets; 
  return isDeciding ? rules.decidingPoints : rules.regularPoints; 
}

function hasSetWinner(scoreA: number, scoreB: number, pointsToWin: number, winBy: number) { 
  const max = Math.max(scoreA, scoreB); 
  const diff = Math.abs(scoreA - scoreB); 
  if (max < pointsToWin) return null; 
  if (diff < winBy) return null; 
  return scoreA > scoreB ? ("A" as TeamId) : ("B" as TeamId); 
}

type InternalEvent = { 
  id: string; ts: number; teamId: TeamId; playerId: string; slot: RotationSlot; skill: Skill; outcome: Outcome; pointWinner?: TeamId; 
  prevScoreA: number; prevScoreB: number; prevServingTeam: TeamId; prevCourtA: CourtState; prevCourtB: CourtState; 
  prevLiberoSwapA: LiberoSwap; prevLiberoSwapB: LiberoSwap; prevRallyCount: number; prevRallyInProgress: boolean; 
  prevServiceRunTeam: TeamId; prevServiceRunCount: number; didSideoutRotate: boolean; skillKey: string; outcomeKey: string; 
  prevSubsUsedA: number; prevSubsUsedB: number; 
  prevActiveSubsA: Record<string, string>; prevActiveSubsB: Record<string, string>;
  trackerMode?: TrackerMode;
  prevSetNumber?: number;
  prevSetsWonA?: number;
  prevSetsWonB?: number;
};

type SavedSet = { id: string; ts: number; setNumber: number; pointsToWin: number; winner: TeamId; finalScoreA: number; finalScoreB: number; events: InternalEvent[]; perPlayer: Record<string, PlayerSetStats>; };

type MatchStore = {
  trackerMode: TrackerMode; 
  setTrackerMode: (mode: TrackerMode) => void; 
  importEvents: (externalEvents: InternalEvent[]) => void; 
  getExportableEvents: () => InternalEvent[]; 

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
  undoLastEvent: () => void; undoFromEvent: (eventId: string) => void; 
  endSet: (winner?: TeamId) => void; resetCourt: (teamId: TeamId) => void; resetMatch: () => void;
  manualSetScore: (teamId: TeamId, score: number) => void; manualSetSets: (teamId: TeamId, sets: number) => void;
  incrementScore: (teamId: TeamId) => void; decrementScore: (teamId: TeamId) => void;
  subsUsedA: number; subsUsedB: number;
  activeSubsA: Record<string, string>; activeSubsB: Record<string, string>;
};

export const useMatchStore = create<MatchStore>()(
  persist(
    (set, get) => {
      const getConfig = (state: MatchStore, teamId: TeamId) => teamId === "A" ? state.liberoConfigA : state.liberoConfigB;
      const getSwap = (state: MatchStore, teamId: TeamId) => teamId === "A" ? state.liberoSwapA : state.liberoSwapB;
      const setSwapPatch = (teamId: TeamId, swap: LiberoSwap) => teamId === "A" ? { liberoSwapA: swap } : { liberoSwapB: swap };

      const buildSavedSet = (params: any): SavedSet => {
        const participatedPlayerIds = new Set<string>();
        for (const ev of params.events) { if (ev.playerId) participatedPlayerIds.add(ev.playerId); }
        if (params.courtA) Object.values(params.courtA as CourtState).forEach(pid => pid && participatedPlayerIds.add(pid));
        if (params.courtB) Object.values(params.courtB as CourtState).forEach(pid => pid && participatedPlayerIds.add(pid));
        if (params.activeSubsA) Object.values(params.activeSubsA as Record<string,string>).forEach(pid => pid && participatedPlayerIds.add(pid));
        if (params.activeSubsB) Object.values(params.activeSubsB as Record<string,string>).forEach(pid => pid && participatedPlayerIds.add(pid));
        if (params.liberoConfigA?.enabled) {
            if (params.liberoConfigA.liberoId) participatedPlayerIds.add(params.liberoConfigA.liberoId);
            if (params.liberoConfigA.secondLiberoId) participatedPlayerIds.add(params.liberoConfigA.secondLiberoId);
        }
        if (params.liberoConfigB?.enabled) {
            if (params.liberoConfigB.liberoId) participatedPlayerIds.add(params.liberoConfigB.liberoId);
            if (params.liberoConfigB.secondLiberoId) participatedPlayerIds.add(params.liberoConfigB.secondLiberoId);
        }

        const perPlayerCounts: Record<string, Record<StatKey, number>> = {};
        for (const ev of params.events) {
          const k = classifyForPog(ev.skillKey, ev.outcomeKey);
          if (k) {
            if (!perPlayerCounts[ev.playerId]) perPlayerCounts[ev.playerId] = emptyCounts();
            perPlayerCounts[ev.playerId][k] += 1;
          }
        }

        const perPlayer: Record<string, PlayerSetStats> = {};
        participatedPlayerIds.forEach(pid => {
             const p = params.players.find((x: any) => x.id === pid);
             const counts = perPlayerCounts[pid] || emptyCounts();
             if (p) perPlayer[pid] = { counts, pogPoints: calcPlayerPogPoints(p, counts) };
        });

        return { id: crypto.randomUUID(), ts: Date.now(), ...params, perPlayer };
      };

      const resetAfterSet = (state: MatchStore, nextServingTeam: TeamId) => {
        const base: Partial<MatchStore> = { 
            scoreA: 0, scoreB: 0, events: [], rallyCount: 0, rallyInProgress: false, 
            serviceRunTeam: nextServingTeam, serviceRunCount: 0, servingTeam: nextServingTeam, 
            liberoSwapA: defaultLiberoSwap(), liberoSwapB: defaultLiberoSwap(), 
            selected: null, activeScoresheet: null,
            subsUsedA: 0, subsUsedB: 0, activeSubsA: {}, activeSubsB: {}
        };
        if (state.setRules.clearCourtsOnSetEnd) { base.courtA = emptyCourt(); base.courtB = emptyCourt(); }
        return base;
      };

      return {
        trackerMode: "FULL",
        setTrackerMode: (mode) => set({ trackerMode: mode }),
        
        getExportableEvents: () => {
            const s = get();
            return [...s.savedSets.flatMap(set => set.events), ...s.events];
        },

        // ✅ FIXED IMPORT: Strict Authority Guards
        importEvents: (externalEvents) => set((state) => {
            const currentSetNumber = state.setNumber;
            const allSetNumbers = new Set(externalEvents.map(e => e.prevSetNumber || 1));
            
            // 1. RECONSTRUCT MISSING SETS
            const newSavedSets: SavedSet[] = [];
            const existingSavedNumbers = new Set(state.savedSets.map(s => s.setNumber));

            allSetNumbers.forEach(setNum => {
                if (existingSavedNumbers.has(setNum)) return; 
                // Do not reconstruct the currently active, unfinished set
                if (setNum === currentSetNumber && !state.savedSets.some(s => s.setNumber === currentSetNumber)) return; 

                const setEvents = externalEvents
                    .filter(e => (e.prevSetNumber || 1) === setNum)
                    .sort((a, b) => a.ts - b.ts);
                
                if (setEvents.length === 0) return;

                const lastEv = setEvents[setEvents.length - 1];
                let finalScoreA = lastEv.prevScoreA;
                let finalScoreB = lastEv.prevScoreB;
                const isScoring = lastEv.outcomeKey.includes("KILL") || lastEv.outcomeKey.includes("ACE") || lastEv.outcomeKey.includes("POINT");
                if (isScoring && lastEv.pointWinner) {
                    if (lastEv.pointWinner === "A") finalScoreA++; else finalScoreB++;
                }

                const pointsToWin = pointsToWinForSet(state.setRules, setNum);
                const winner = hasSetWinner(finalScoreA, finalScoreB, pointsToWin, state.setRules.winBy) || (finalScoreA > finalScoreB ? "A" : "B");

                const reconstructed = buildSavedSet({
                    setNumber: setNum,
                    pointsToWin,
                    winner,
                    finalScoreA,
                    finalScoreB,
                    events: setEvents,
                    players: state.players,
                    courtA: lastEv.prevCourtA || emptyCourt(),
                    courtB: lastEv.prevCourtB || emptyCourt(),
                    activeSubsA: lastEv.prevActiveSubsA || {},
                    activeSubsB: lastEv.prevActiveSubsB || {},
                    liberoConfigA: defaultLiberoConfig(),
                    liberoConfigB: defaultLiberoConfig()
                });
                newSavedSets.push(reconstructed);
            });

            // 2. UPDATE EXISTING SETS (Merge history perfectly)
            const updatedSavedSets = state.savedSets.map(savedSet => {
                const relevantIncoming = externalEvents.filter(e => (e.prevSetNumber || 1) === savedSet.setNumber);
                if (relevantIncoming.length === 0) return savedSet;

                const existingIds = new Set(savedSet.events.map(e => e.id));
                const uniqueNew = relevantIncoming.filter(e => {
                    if (existingIds.has(e.id)) return false;
                    const isScoring = e.outcomeKey.includes("KILL") || e.outcomeKey.includes("ACE") || e.outcomeKey.includes("POINT");
                    if (isScoring) {
                        const duplicateScore = savedSet.events.some(existing => {
                            const existingIsScoring = existing.outcomeKey.includes("KILL") || existing.outcomeKey.includes("ACE") || existing.outcomeKey.includes("POINT");
                            return existingIsScoring && Math.abs(existing.ts - e.ts) < 5000;
                        });
                        if (duplicateScore) return false;
                    }
                    return true; 
                });

                if (uniqueNew.length === 0) return savedSet;

                const mergedEvents = [...savedSet.events, ...uniqueNew].sort((a, b) => a.ts - b.ts);
                
                // Recalculate this set strictly based on its final merged array
                const participatedPlayerIds = new Set<string>();
                for (const ev of mergedEvents) { if (ev.playerId) participatedPlayerIds.add(ev.playerId); }
                const perPlayerCounts: Record<string, Record<StatKey, number>> = {};
                for (const ev of mergedEvents) {
                    const k = classifyForPog(ev.skillKey, ev.outcomeKey);
                    if (k) {
                        if (!perPlayerCounts[ev.playerId]) perPlayerCounts[ev.playerId] = emptyCounts();
                        perPlayerCounts[ev.playerId][k] += 1;
                    }
                }
                const perPlayer: Record<string, PlayerSetStats> = {};
                participatedPlayerIds.forEach(pid => {
                    const p = state.players.find((x: any) => x.id === pid);
                    const counts = perPlayerCounts[pid] || emptyCounts();
                    if (p) perPlayer[pid] = { counts, pogPoints: calcPlayerPogPoints(p, counts) };
                });

                return { ...savedSet, events: mergedEvents, perPlayer };
            });

            // 3. MERGE CURRENT SET
            // Guard: ONLY merge into state.events if the user has NOT already ended this set!
            let mergedCurrent = state.events;
            if (!existingSavedNumbers.has(currentSetNumber)) {
                const existingIds = new Set(state.events.map(e => e.id));
                const currentFreshEvents = externalEvents.filter(e => {
                    if ((e.prevSetNumber || 1) !== currentSetNumber) return false;
                    if (existingIds.has(e.id)) return false;
                    
                    const isScoring = e.outcomeKey.includes("KILL") || e.outcomeKey.includes("ACE") || e.outcomeKey.includes("POINT");
                    if (isScoring) {
                        const duplicateScore = state.events.some(existing => {
                            const existingIsScoring = existing.outcomeKey.includes("KILL") || existing.outcomeKey.includes("ACE") || existing.outcomeKey.includes("POINT");
                            return existingIsScoring && Math.abs(existing.ts - e.ts) < 5000; 
                        });
                        if (duplicateScore) return false; 
                    }
                    
                    const isFuzzyDuplicate = state.events.some(existing => 
                        existing.playerId === e.playerId &&
                        existing.skillKey === e.skillKey &&
                        existing.outcomeKey === e.outcomeKey &&
                        Math.abs(existing.ts - e.ts) < 2000
                    );
                    return !isFuzzyDuplicate;
                });
                mergedCurrent = [...state.events, ...currentFreshEvents].sort((a, b) => a.ts - b.ts);
            }
            
            const finalSavedSets = [...updatedSavedSets, ...newSavedSets].sort((a,b) => a.setNumber - b.setNumber);
            
            // 4. ACTIVE STATE CLEANUP (Kill the Ghost Events)
            // Automatically removes any events lingering in the active array that belong to a set we've already saved.
            const finalSavedSetNumbers = new Set(finalSavedSets.map(s => s.setNumber));
            const cleanedActiveEvents = mergedCurrent.filter(e => !finalSavedSetNumbers.has(e.prevSetNumber || 1));

            const wonA = finalSavedSets.filter(s => s.winner === "A").length;
            const wonB = finalSavedSets.filter(s => s.winner === "B").length;

            return { 
                events: cleanedActiveEvents, 
                savedSets: finalSavedSets,
                setsWonA: wonA,
                setsWonB: wonB,
                toast: makeToast(`Imported ${externalEvents.length} events (Ghost Data Cleared).`, "info") 
            };
        }),

        players: [], courtA: emptyCourt(), courtB: emptyCourt(), leftTeam: "A", setLeftTeam: (teamId) => set({ leftTeam: teamId }), swapSides: () => set((state) => ({ leftTeam: state.leftTeam === "A" ? "B" : "A" })),
        selected: null, selectSlot: (teamId, slot, mode = "default") => set({ selected: { teamId, slot, mode } }), clearSelection: () => set({ selected: null }),
        toast: null, setToast: (message, type = "warn") => set({ toast: makeToast(message, type) }), clearToast: () => set({ toast: null }),
        liberoConfigA: defaultLiberoConfig(), liberoConfigB: defaultLiberoConfig(),
        setLiberoConfig: (teamId, cfg) => set((state) => {
          const prevCfg = teamId === "A" ? state.liberoConfigA : state.liberoConfigB;
          const next = { ...prevCfg, ...cfg };
          if (cfg.replacementIds !== undefined) next.replacementIds = Array.from(new Set(cfg.replacementIds.filter(Boolean))).slice(0, 2);
          return teamId === "A" ? { liberoConfigA: next } : { liberoConfigB: next };
        }),
        liberoSwapA: defaultLiberoSwap(), liberoSwapB: defaultLiberoSwap(), rallyCount: 0, rallyInProgress: false, serviceRunTeam: "A", serviceRunCount: 0,
        setRules: defaultSetRules(), setNumber: 1, setsWonA: 0, setsWonB: 0, savedSets: [], updateSetRules: (rules) => set((state) => ({ setRules: { ...state.setRules, ...rules } })),
        
        // ✅ FIXED STATS: Double-protection against duplicates
        getAllPlayerMatchStats: () => { 
          const s = get(); 
          
          const savedEvents = s.savedSets.flatMap((x) => x.events);
          const savedSetNumbers = new Set(s.savedSets.map(set => set.setNumber));

          // Only merge events from state.events if they DON'T belong to a set we've already saved
          const validActiveEvents = s.events.filter(e => !savedSetNumbers.has(e.prevSetNumber || 1));

          const allEventsRaw = [...savedEvents, ...validActiveEvents].sort((a, b) => a.ts - b.ts);

          // Absolute ID deduplication
          const uniqueMap = new Map();
          for (const e of allEventsRaw) { uniqueMap.set(e.id, e); }
          const uniqueEvents = Array.from(uniqueMap.values());

          return computeMatchStatsFromEvents({ players: s.players, events: uniqueEvents }); 
        },
        
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
        removePlayer: (id) => set((state) => ({ players: state.players.filter((p) => p.id !== id) })),
        subsUsedA: 0, subsUsedB: 0, activeSubsA: {}, activeSubsB: {},
        assignPlayerToSlot: (teamId, slot, playerId) => set((state) => {
          const isMidGame = state.events.length > 0 || state.scoreA > 0 || state.scoreB > 0;
          const key = teamId === "A" ? "courtA" : "courtB"; 
          const subKey = teamId === "A" ? "activeSubsA" : "activeSubsB";
          const countKey = teamId === "A" ? "subsUsedA" : "subsUsedB";
          let court = { ...state[key] };
          let activeSubs = { ...state[subKey] };
          let subsUsed = state[countKey];
          const currentPlayerId = court[slot];
          const pIn = state.players.find(p => p.id === playerId);
          const pOut = state.players.find(p => p.id === currentPlayerId);
          const inIsLibero = isLiberoPlayer(pIn);
          const outIsLibero = isLiberoPlayer(pOut);
          const isLiberoRegularSwap = (inIsLibero && !outIsLibero) || (!inIsLibero && outIsLibero);
          const isSubstitution = isMidGame && !inIsLibero && !outIsLibero;
          
          if (isSubstitution) {
              if (subsUsed >= 6) return { ...state, toast: makeToast("Sub limit reached.", "error") };
              if (currentPlayerId) {
                  if (activeSubs[currentPlayerId]) {
                      if (playerId !== activeSubs[currentPlayerId]) return { ...state, toast: makeToast(`Illegal Sub.`, "error") };
                      delete activeSubs[currentPlayerId];
                  } else {
                      if (Object.keys(activeSubs).includes(playerId)) return { ...state, toast: makeToast("Player on court.", "error") };
                      activeSubs[playerId] = currentPlayerId;
                  }
              }
              subsUsed++;
          }
          
          court[slot] = playerId;
          const currentConfig = teamId === "A" ? state.liberoConfigA : state.liberoConfigB;
          let newConfig = { ...currentConfig };
          
          if (inIsLibero) {
              newConfig.liberoId = playerId;
              newConfig.enabled = true;
          }
          
          const applied = applyLiberoAutomation({ teamId, court, players: state.players, config: newConfig, swap: getSwap(state, teamId), servingTeam: state.servingTeam });
          const nextState: any = { ...state, [key]: applied.court, ...setSwapPatch(teamId, applied.swap), [subKey]: activeSubs, [countKey]: subsUsed };
          if (teamId === "A") nextState.liberoConfigA = newConfig; else nextState.liberoConfigB = newConfig;
          
          if (isSubstitution) {
              const subEvent: InternalEvent = {
                id: crypto.randomUUID(), ts: Date.now(), teamId, playerId, slot, skill: "SUBSTITUTION" as any, outcome: "None" as any, trackerMode: state.trackerMode,
                prevScoreA: state.scoreA, prevScoreB: state.scoreB, prevServingTeam: state.servingTeam, prevCourtA: state.courtA, prevCourtB: state.courtB,
                prevLiberoSwapA: state.liberoSwapA, prevLiberoSwapB: state.liberoSwapB, prevRallyCount: state.rallyCount, prevRallyInProgress: state.rallyInProgress,
                prevServiceRunTeam: state.serviceRunTeam, prevServiceRunCount: state.serviceRunCount, didSideoutRotate: false, skillKey: "SUBSTITUTION", outcomeKey: "NONE",
                prevSubsUsedA: state.subsUsedA, prevSubsUsedB: state.subsUsedB, prevActiveSubsA: state.activeSubsA, prevActiveSubsB: state.activeSubsB,
                prevSetNumber: state.setNumber, prevSetsWonA: state.setsWonA, prevSetsWonB: state.setsWonB
              };
              nextState.events = [subEvent, ...state.events];
          }
          if (applied.toast) nextState.toast = applied.toast;
          return nextState;
        }),
        
        substituteInSlot: (teamId, slot, newPlayerId) => get().assignPlayerToSlot(teamId, slot, newPlayerId),
        clearSlot: (teamId, slot) => set((state) => { const key = teamId === "A" ? "courtA" : "courtB"; const court = { ...state[key] }; court[slot] = null; return { ...state, [key]: court }; }),
        getOnCourtPlayerIds: (teamId) => { const state = get(); const court = teamId === "A" ? state.courtA : state.courtB; return Object.values(court).filter(Boolean) as string[]; },
        
        rotateTeam: (teamId) => set((state) => {
          const key = teamId === "A" ? "courtA" : "courtB";
          const rotated = rotateCourtForward(state[key]);
          const applied = applyLiberoAutomation({ teamId, court: rotated, players: state.players, config: getConfig(state, teamId), swap: getSwap(state, teamId), rotationMapping: "FORWARD", servingTeam: state.servingTeam });
          const next: any = { ...state, [key]: applied.court, ...setSwapPatch(teamId, applied.swap) };
          if (applied.toast) next.toast = applied.toast;
          return next;
        }),
        rotateTeamBackward: (teamId) => set((state) => {
          const key = teamId === "A" ? "courtA" : "courtB";
          const rotated = rotateCourtBackward(state[key]);
          const applied = applyLiberoAutomation({ teamId, court: rotated, players: state.players, config: getConfig(state, teamId), swap: getSwap(state, teamId), rotationMapping: "BACKWARD", servingTeam: state.servingTeam });
          const next: any = { ...state, [key]: applied.court, ...setSwapPatch(teamId, applied.swap) };
          if (applied.toast) next.toast = applied.toast;
          return next;
        }),
        activeScoresheet: null, openScoresheet: (teamId, slot) => set({ activeScoresheet: { teamId, slot } }), closeScoresheet: () => set({ activeScoresheet: null }),
        scoreA: 0, scoreB: 0, servingTeam: "A", setServingTeam: (teamId) => set(() => ({ servingTeam: teamId, serviceRunTeam: teamId, serviceRunCount: 0, rallyInProgress: false })), events: [],
        endSet: (winner) => set((state) => {
          const pointsToWin = pointsToWinForSet(state.setRules, state.setNumber);
          const computedWinner = winner ?? hasSetWinner(state.scoreA, state.scoreB, pointsToWin, state.setRules.winBy);
          if (!computedWinner) return { ...state, toast: makeToast("Set not finished.", "warn") };
          const saved = buildSavedSet({ 
              setNumber: state.setNumber, 
              pointsToWin, 
              winner: computedWinner, 
              finalScoreA: state.scoreA, 
              finalScoreB: state.scoreB, 
              events: state.events.slice().reverse(), 
              players: state.players,
              courtA: state.courtA,
              courtB: state.courtB,
              activeSubsA: state.activeSubsA,
              activeSubsB: state.activeSubsB,
              liberoConfigA: state.liberoConfigA,
              liberoConfigB: state.liberoConfigB
          });
          const nextSetsWonA = computedWinner === "A" ? state.setsWonA + 1 : state.setsWonA;
          const nextSetsWonB = computedWinner === "B" ? state.setsWonB + 1 : state.setsWonB;
          const setsNeeded = Math.ceil(state.setRules.bestOf / 2);
          if (nextSetsWonA >= setsNeeded || nextSetsWonB >= setsNeeded) return { ...state, savedSets: [saved, ...state.savedSets], setsWonA: nextSetsWonA, setsWonB: nextSetsWonB, events: [], toast: makeToast(`Match Over!`, "info") };
          const after = resetAfterSet(state, computedWinner === "A" ? "B" : "A");
          return { ...state, savedSets: [saved, ...state.savedSets], setsWonA: nextSetsWonA, setsWonB: nextSetsWonB, setNumber: state.setNumber + 1, ...after as any, toast: makeToast(`Set ${state.setNumber} won.`, "info") };
        }),
        logEvent: ({ teamId, slot, skill, outcome }) => set((state) => {
          const setsNeeded = Math.ceil(state.setRules.bestOf / 2);
          if (state.setsWonA >= setsNeeded || state.setsWonB >= setsNeeded) return { ...state, toast: makeToast("Match ended.", "warn") };
          const court = teamId === "A" ? state.courtA : state.courtB;
          const playerId = court[slot];
          if (!playerId) return state;
          const skillKey = normKey(skill);
          const outcomeKey = normKey(outcome);
          let pointWinner: TeamId | undefined;
          const isError = outcomeKey.includes("ERROR") || outcomeKey.includes("FAULT") || outcomeKey.includes("OUT") || outcomeKey.includes("NET");
          if (isError) pointWinner = opponentOf(teamId);
          else {
            const isWin = outcomeKey.includes("KILL") || outcomeKey.includes("ACE") || outcomeKey.includes("POINT");
            if ((skillKey.includes("SERVE") || skillKey.includes("SPIKE") || skillKey.includes("BLOCK")) && isWin) pointWinner = teamId;
          }
          const e: InternalEvent = {
            id: crypto.randomUUID(), ts: Date.now(), teamId, playerId, slot, skill, outcome, pointWinner, trackerMode: state.trackerMode,
            prevScoreA: state.scoreA, prevScoreB: state.scoreB, prevServingTeam: state.servingTeam, prevCourtA: state.courtA, prevCourtB: state.courtB,
            prevLiberoSwapA: state.liberoSwapA, prevLiberoSwapB: state.liberoSwapB, prevRallyCount: state.rallyCount, prevRallyInProgress: state.rallyInProgress,
            prevServiceRunTeam: state.serviceRunTeam, prevServiceRunCount: state.serviceRunCount, didSideoutRotate: false, skillKey, outcomeKey,
            prevSubsUsedA: state.subsUsedA, prevSubsUsedB: state.subsUsedB, prevActiveSubsA: state.activeSubsA, prevActiveSubsB: state.activeSubsB,
            prevSetNumber: state.setNumber, prevSetsWonA: state.setsWonA, prevSetsWonB: state.setsWonB
          };
          return { events: [e, ...state.events], toast: makeToast("Recorded.", "info") };
        }),
        undoLastEvent: () => set((state) => {
          if (state.events.length === 0 && state.savedSets.length > 0) {
             const lastSet = state.savedSets[0];
             return { ...state, savedSets: state.savedSets.slice(1), scoreA: lastSet.finalScoreA, scoreB: lastSet.finalScoreB, setNumber: lastSet.setNumber, setsWonA: lastSet.winner === "A" ? state.setsWonA - 1 : state.setsWonA, setsWonB: lastSet.winner === "B" ? state.setsWonB - 1 : state.setsWonB, events: [...lastSet.events].reverse(), toast: makeToast(`Re-opened Set ${lastSet.setNumber}`, "info") };
          }
          if (state.events.length > 0) {
            const last = state.events[0];
            return { ...state, scoreA: last.prevScoreA, scoreB: last.prevScoreB, servingTeam: last.prevServingTeam, courtA: last.prevCourtA, courtB: last.prevCourtB, liberoSwapA: last.prevLiberoSwapA, liberoSwapB: last.prevLiberoSwapB, rallyCount: last.prevRallyCount, rallyInProgress: last.prevRallyInProgress, serviceRunTeam: last.prevServiceRunTeam, serviceRunCount: last.prevServiceRunCount, events: state.events.slice(1), subsUsedA: last.prevSubsUsedA, subsUsedB: last.prevSubsUsedB, activeSubsA: last.prevActiveSubsA, activeSubsB: last.prevActiveSubsB };
          }
          return state;
        }),
        undoFromEvent: (eventId: string) => set((state) => {
            const index = state.events.findIndex(e => e.id === eventId);
            if (index === -1) return state;
            const targetEvent = state.events[index];
            return { ...state, scoreA: targetEvent.prevScoreA, scoreB: targetEvent.prevScoreB, servingTeam: targetEvent.prevServingTeam, courtA: targetEvent.prevCourtA, courtB: targetEvent.prevCourtB, liberoSwapA: targetEvent.prevLiberoSwapA, liberoSwapB: targetEvent.prevLiberoSwapB, rallyCount: targetEvent.prevRallyCount, rallyInProgress: targetEvent.prevRallyInProgress, serviceRunTeam: targetEvent.prevServiceRunTeam, serviceRunCount: targetEvent.prevServiceRunCount, subsUsedA: targetEvent.prevSubsUsedA, subsUsedB: targetEvent.prevSubsUsedB, activeSubsA: targetEvent.prevActiveSubsA, activeSubsB: targetEvent.prevActiveSubsB, events: state.events.slice(index + 1), toast: makeToast("State restored.", "info") };
        }),
        resetCourt: (teamId) => set((state) => { 
            if (teamId === "A") return { courtA: emptyCourt(), liberoSwapA: defaultLiberoSwap(), subsUsedA: 0, activeSubsA: {} }; 
            return { courtB: emptyCourt(), liberoSwapB: defaultLiberoSwap(), subsUsedB: 0, activeSubsB: {} }; 
        }),
        resetMatch: () => set((state) => ({ ...state, courtA: emptyCourt(), courtB: emptyCourt(), events: [], scoreA: 0, scoreB: 0, setNumber: 1, setsWonA: 0, setsWonB: 0, savedSets: [], subsUsedA: 0, subsUsedB: 0 })),
        manualSetScore: (teamId, score) => set((state) => ({ scoreA: teamId === "A" ? score : state.scoreA, scoreB: teamId === "B" ? score : state.scoreB })),
        manualSetSets: (teamId, sets) => set((state) => ({ setsWonA: teamId === "A" ? sets : state.setsWonA, setsWonB: teamId === "B" ? sets : state.setsWonB })),
        incrementScore: (teamId: TeamId) => set((state) => {
          const setsNeeded = Math.ceil(state.setRules.bestOf / 2);
          if (state.setsWonA >= setsNeeded || state.setsWonB >= setsNeeded) return { toast: makeToast("Match ended.", "warn") };
          let { scoreA, scoreB, servingTeam, courtA, courtB, players } = state;
          let nextScoreA = scoreA; let nextScoreB = scoreB; let nextServingTeam = servingTeam;
          let nextCourtA = { ...courtA }; let nextCourtB = { ...courtB };
          let nextSwapA = { ...state.liberoSwapA }; let nextSwapB = { ...state.liberoSwapB };
          if (teamId === "A") nextScoreA++; else nextScoreB++;
          if (teamId !== servingTeam) {
            nextServingTeam = teamId;
            const rotated = rotateCourtForward(teamId === "A" ? nextCourtA : nextCourtB);
            const applied = applyLiberoAutomation({ teamId, court: rotated, players, config: getConfig(state, teamId), swap: getSwap(state, teamId), rotationMapping: "FORWARD", servingTeam: nextServingTeam });
            if (teamId === "A") { nextCourtA = applied.court; nextSwapA = applied.swap; } else { nextCourtB = applied.court; nextSwapB = applied.swap; }
            const opp = opponentOf(teamId);
            const appliedL = applyLiberoAutomation({ teamId: opp, court: opp === "A" ? nextCourtA : nextCourtB, players, config: getConfig(state, opp), swap: getSwap(state, opp), servingTeam: nextServingTeam });
            if (opp === "A") { nextCourtA = appliedL.court; nextSwapA = appliedL.swap; } else { nextCourtB = appliedL.court; nextSwapB = appliedL.swap; }
          } else {
             const applied = applyLiberoAutomation({ teamId, court: teamId === "A" ? nextCourtA : nextCourtB, players, config: getConfig(state, teamId), swap: getSwap(state, teamId), servingTeam: nextServingTeam });
             if (teamId === "A") { nextCourtA = applied.court; nextSwapA = applied.swap; } else { nextCourtB = applied.court; nextSwapB = applied.swap; }
             const opp = opponentOf(teamId);
             const appliedL = applyLiberoAutomation({ teamId: opp, court: opp === "A" ? nextCourtA : nextCourtB, players, config: getConfig(state, opp), swap: getSwap(state, opp), servingTeam: nextServingTeam });
             if (opp === "A") { nextCourtA = appliedL.court; nextSwapA = appliedL.swap; } else { nextCourtB = appliedL.court; nextSwapB = appliedL.swap; }
          }
          const newState = { ...state, scoreA: nextScoreA, scoreB: nextScoreB, servingTeam: nextServingTeam, courtA: nextCourtA, courtB: nextCourtB, liberoSwapA: nextSwapA, liberoSwapB: nextSwapB };
          const pointsToWin = pointsToWinForSet(state.setRules, state.setNumber);
          const winner = hasSetWinner(nextScoreA, nextScoreB, pointsToWin, state.setRules.winBy);
          if (winner) {
             const saved = buildSavedSet({ 
                 setNumber: state.setNumber, 
                 pointsToWin, 
                 winner, 
                 finalScoreA: nextScoreA, 
                 finalScoreB: nextScoreB, 
                 events: state.events.slice().reverse(), 
                 players: state.players,
                 courtA: nextCourtA,
                 courtB: nextCourtB,
                 activeSubsA: state.activeSubsA,
                 activeSubsB: state.activeSubsB,
                 liberoConfigA: state.liberoConfigA,
                 liberoConfigB: state.liberoConfigB
             });
             const nextSetsWonA = winner === "A" ? state.setsWonA + 1 : state.setsWonA;
             const nextSetsWonB = winner === "B" ? state.setsWonB + 1 : state.setsWonB;
             if (nextSetsWonA >= setsNeeded || nextSetsWonB >= setsNeeded) return { ...newState, savedSets: [saved, ...state.savedSets], setsWonA: nextSetsWonA, setsWonB: nextSetsWonB, events: [], toast: makeToast(`Match Over!`, "info") };
             const after = resetAfterSet(newState as MatchStore, winner === "A" ? "B" : "A");
             return { ...newState, savedSets: [saved, ...state.savedSets], setsWonA: nextSetsWonA, setsWonB: nextSetsWonB, setNumber: state.setNumber + 1, ...after as any, toast: makeToast(`Set ${state.setNumber} won.`, "info") };
          }
          return newState;
        }),
        decrementScore: (teamId) => set((state) => {
            const nextScore = teamId === "A" ? Math.max(0, state.scoreA - 1) : Math.max(0, state.scoreB - 1);
            if (state.servingTeam === teamId && (teamId === "A" ? state.scoreA : state.scoreB) > 0) {
                return { scoreA: teamId === "A" ? nextScore : state.scoreA, scoreB: teamId === "B" ? nextScore : state.scoreB, servingTeam: opponentOf(teamId) };
            }
            return { scoreA: teamId === "A" ? nextScore : state.scoreA, scoreB: teamId === "B" ? nextScore : state.scoreB };
        }),
      };
    },
    {
      name: "vb-match-store",
      version: 40, // Bumped to force clearance of Ghost Events
      migrate: (persisted: any) => ({ ...persisted, trackerMode: persisted?.trackerMode || "FULL" }),
      partialize: (state) => ({ players: state.players, courtA: state.courtA, courtB: state.courtB, scoreA: state.scoreA, scoreB: state.scoreB, servingTeam: state.servingTeam, events: state.events, leftTeam: state.leftTeam, liberoConfigA: state.liberoConfigA, liberoConfigB: state.liberoConfigB, rallyCount: state.rallyCount, rallyInProgress: state.rallyInProgress, serviceRunTeam: state.serviceRunTeam, serviceRunCount: state.serviceRunCount, liberoSwapA: state.liberoSwapA, liberoSwapB: state.liberoSwapB, setRules: state.setRules, setNumber: state.setNumber, setsWonA: state.setsWonA, setsWonB: state.setsWonB, savedSets: state.savedSets, subsUsedA: state.subsUsedA, subsUsedB: state.subsUsedB, activeSubsA: state.activeSubsA, activeSubsB: state.activeSubsB, trackerMode: state.trackerMode }),
    }
  )
);