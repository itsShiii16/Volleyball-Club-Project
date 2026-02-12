"use client";

import Court from "@/components/Court/Court";
import SlotPanel from "@/components/Court/SlotPanel";
import BenchRail from "@/components/Court/Bench/BenchRail";
import MatchSummaryModal from "@/components/MatchSummary/MatchSummaryModal";
import EventLogRail from "@/components/EventLogRail";
import ActionSidebar from "@/components/ActionSidebar";
import ScoresheetPanel from "@/components/Court/Scoresheet/ScoresheetPanel";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useMatchStore } from "@/store/matchStore";
import { useRouter } from "next/navigation";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DragCancelEvent,
} from "@dnd-kit/core";

const opponentOf = (teamId: "A" | "B") => (teamId === "A" ? "B" : "A");

export default function Home() {
  const router = useRouter();
  
  // -- Store Selectors --
  const players = useMatchStore((s) => s.players);
  const assign = useMatchStore((s) => s.assignPlayerToSlot);
  const resetMatch = useMatchStore((s) => s.resetMatch);
  
  // Undo Logic
  const undoLastEvent = useMatchStore((s) => s.undoLastEvent);
  const canUndo = useMatchStore((s) => {
    if ((s.events?.length ?? 0) > 0) return true;
    if ((s.savedSets?.length ?? 0) > 0 && s.scoreA === 0 && s.scoreB === 0) return true;
    return false;
  });
  
  // Navigation & Layout Actions
  const rotateTeam = useMatchStore((s) => s.rotateTeam);
  const resetCourt = useMatchStore((s) => s.resetCourt);
  const swapSides = useMatchStore((s) => s.swapSides);
  
  // Game State
  const servingTeam = useMatchStore((s) => s.servingTeam);
  const setServingTeam = useMatchStore((s) => s.setServingTeam);
  const leftTeam = useMatchStore((s) => s.leftTeam);
  const rightTeam = opponentOf(leftTeam);
  
  // Scores
  const scoreA = useMatchStore((s) => s.scoreA);
  const scoreB = useMatchStore((s) => s.scoreB);
  
  // ✅ DYNAMIC SCORE GETTERS
  const leftScore = leftTeam === "A" ? scoreA : scoreB;
  const rightScore = rightTeam === "A" ? scoreA : scoreB;

  const setsWonA = useMatchStore((s) => s.setsWonA);
  const setsWonB = useMatchStore((s) => s.setsWonB);
  const setNumber = useMatchStore((s) => s.setNumber);

  // Rules
  const setRules = useMatchStore((s) => s.setRules);
  const updateSetRules = useMatchStore((s) => s.updateSetRules);

  // Actions
  const incrementScore = useMatchStore((s) => s.incrementScore);
  const decrementScore = useMatchStore((s) => s.decrementScore);
  const manualSetSets = useMatchStore((s) => s.manualSetSets);
  const endSet = useMatchStore((s) => s.endSet);

  // Match Summary
  const openMatchSummary = useMatchStore((s) => s.openMatchSummary);
  const savedSetsCount = useMatchStore((s) => (s.savedSets?.length ?? 0));

  // Toast
  const toast = useMatchStore((s) => s.toast);
  const clearToast = useMatchStore((s) => s.clearToast);

  // Local State
  const [teamNameA, setTeamNameA] = useState("TEAM A NAME");
  const [teamNameB, setTeamNameB] = useState("TEAM B NAME");
  const [timeoutsA, setTimeoutsA] = useState([false, false, false]);
  const [timeoutsB, setTimeoutsB] = useState([false, false, false]);
  const [isRulesOpen, setIsRulesOpen] = useState(false);

  // Computed
  const currentTargetPoints = isDecidingSet(setsWonA, setsWonB, setRules.bestOf) 
    ? setRules.decidingPoints 
    : setRules.regularPoints;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } })
  );

  const restoreScroll = useCallback(() => {
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
    document.body.style.touchAction = "";
  }, []);

  useEffect(() => {
    return () => restoreScroll();
  }, [restoreScroll]);

  function onDragStart(_: DragStartEvent) {
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
  }

  function onDragCancel(_: DragCancelEvent) { restoreScroll(); }

  function onDragEnd(event: DragEndEvent) {
    restoreScroll();
    const { active, over } = event;
    if (!over) return;
    const playerId = String(active.id);
    const overId = String(over.id);
    const [teamIdRaw, slotRaw] = overId.split("-");
    const slotNum = Number(slotRaw);
    const teamId = teamIdRaw === "A" || teamIdRaw === "B" ? teamIdRaw : null;
    if (!teamId || ![1, 2, 3, 4, 5, 6].includes(slotNum)) return;
    const p = players.find((x) => x.id === playerId);
    if (!p || p.teamId !== teamId) return;
    assign(teamId, slotNum as any, playerId);
  }

  function rotateLeftSide() { rotateTeam(leftTeam); }
  function rotateRightSide() { rotateTeam(rightTeam); }
  function clearLeftSide() { resetCourt(leftTeam); }
  function clearRightSide() { resetCourt(rightTeam); }

  function toggleTimeout(team: "A" | "B", idx: number) {
    if (team === "A") setTimeoutsA((prev) => prev.map((v, i) => (i === idx ? !v : v)));
    else setTimeoutsB((prev) => prev.map((v, i) => (i === idx ? !v : v)));
  }

  function useNextTimeout(team: "A" | "B") {
    if (team === "A") {
      const idx = timeoutsA.findIndex((used) => !used);
      if (idx !== -1) toggleTimeout("A", idx);
    } else {
      const idx = timeoutsB.findIndex((used) => !used);
      if (idx !== -1) toggleTimeout("B", idx);
    }
  }

  const handleReset = useCallback(() => {
    if (confirm("Reset current match scores and sets?")) {
      resetMatch();
      setTimeoutsA([false, false, false]);
      setTimeoutsB([false, false, false]);
    }
  }, [resetMatch]);

  const adjustSets = (teamId: "A" | "B", delta: number) => {
    const current = teamId === "A" ? setsWonA : setsWonB;
    const newVal = Math.max(0, Math.min(5, current + delta));
    manualSetSets(teamId, newVal);
  };

  const toastTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!toast) return;
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => { clearToast(); }, 2600);
    return () => { if (toastTimer.current) window.clearTimeout(toastTimer.current); };
  }, [toast, clearToast]);

  const btnBase = "px-3 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-sm font-bold rounded-xl shadow-sm transition-all active:scale-95 border border-transparent tracking-wide";
  const btnWhite = `${btnBase} bg-white text-gray-900 hover:bg-gray-100 hover:shadow-md`;
  const btnDark = `${btnBase} bg-gray-800 text-white hover:bg-gray-700`;
  const btnBlue = `${btnBase} bg-sky-500 text-white hover:bg-sky-600 ring-2 ring-sky-900/20 text-sm sm:text-base`;
  const btnRed = `${btnBase} bg-red-600 text-white hover:bg-red-700`;
  const btnDisabled = `${btnBase} bg-gray-700 text-gray-500 cursor-not-allowed shadow-none opacity-50`;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--background)] text-white">
      
      {/* 🟢 LEFT: Event Log Rail */}
      <div className="hidden xl:block w-64 shrink-0 border-r border-white/10 shadow-sm z-10 overflow-hidden bg-white/5 backdrop-blur-sm">
        <EventLogRail />
      </div>

      {/* 🟢 CENTER: Main Content */}
      <div className="flex-1 overflow-y-auto">
        <main className="min-h-full p-2 sm:p-6 flex flex-col">
          <DndContext sensors={sensors} onDragStart={onDragStart} onDragCancel={onDragCancel} onDragEnd={onDragEnd}>
            <div className="w-full max-w-[1600px] mx-auto flex flex-col gap-4 sm:gap-6 pb-20 flex-1">
              <MatchSummaryModal />

              {toast && (
                <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[999] px-4 pointer-events-none">
                  <div className={`w-full max-w-md rounded-xl shadow-2xl border-2 px-5 py-3 flex items-start gap-4 pointer-events-auto transition-all animate-in fade-in slide-in-from-top-4 ${toast.type === "error" ? "bg-red-600 text-white border-red-400" : "bg-sky-600 text-white border-sky-400"}`} role="status">
                    <div className="text-sm font-bold leading-snug flex-1">{toast.message}</div>
                    <button type="button" onClick={clearToast} className="shrink-0 rounded-lg bg-white/20 hover:bg-white/30 px-2 py-0.5 text-xs font-black">✕</button>
                  </div>
                </div>
              )}

              {/* ROW 1: HEADER */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2 flex-wrap">
                  <button onClick={openMatchSummary} disabled={savedSetsCount === 0} className={savedSetsCount > 0 ? btnWhite : btnDisabled}>
                    SUMMARY {savedSetsCount > 0 && `(${savedSetsCount})`}
                  </button>
                  <button onClick={() => router.push("/setup")} className={btnWhite}>ROSTER</button>
                  <button onClick={() => setIsRulesOpen(true)} className={`${btnDark} flex items-center gap-2`}>
                    <span>⚙️</span>
                    <span className="bg-gray-700 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider">Bo{setRules.bestOf}</span>
                  </button>
                </div>

                <div className="flex gap-2">
                  <button onClick={handleReset} className={btnRed}>RESET</button>
                  <button onClick={() => endSet()} className={`${btnBase} bg-amber-500 text-white hover:bg-amber-600 shadow-md`}>END SET</button>
                  <button onClick={undoLastEvent} disabled={!canUndo} className={canUndo ? btnDark : btnDisabled}>UNDO</button>
                  <button onClick={swapSides} className={btnWhite}>SWAP</button>
                  <div className="hidden sm:flex gap-2">
                    <button onClick={rotateLeftSide} className={btnWhite}>ROT L</button>
                    <button onClick={rotateRightSide} className={btnWhite}>ROT R</button>
                  </div>
                </div>
              </div>

              {/* ROW 2: SERVE BUTTONS (Dynamic) */}
              <div className="flex justify-center gap-4 py-1">
                 <button onClick={() => setServingTeam(leftTeam)} className={servingTeam === leftTeam ? btnBlue : btnWhite}>
                    Serve Left
                  </button>
                  <button onClick={() => setServingTeam(rightTeam)} className={servingTeam === rightTeam ? btnBlue : btnWhite}>
                    Serve Right
                  </button>
              </div>

              {/* ROW 3: SCOREBOARD */}
              <div className="flex flex-col gap-4 items-center w-full">
                
                <div className="flex items-center gap-4 bg-gray-900/40 px-6 py-2 rounded-full border border-white/5">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                      Set {setNumber} • Target {currentTargetPoints}
                    </div>
                    <div className="h-4 w-px bg-white/10" />
                    
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => adjustSets("A", -1)} className="w-5 h-5 rounded hover:bg-white/10 text-white font-bold flex items-center justify-center text-xs">-</button>
                        <span className="text-sm font-black text-white">{setsWonA}</span>
                        <button onClick={() => adjustSets("A", 1)} className="w-5 h-5 rounded hover:bg-white/10 text-white font-bold flex items-center justify-center text-xs">+</button>
                      </div>
                      <span className="text-[10px] font-bold text-gray-500 uppercase">SETS</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => adjustSets("B", -1)} className="w-5 h-5 rounded hover:bg-white/10 text-white font-bold flex items-center justify-center text-xs">-</button>
                        <span className="text-sm font-black text-white">{setsWonB}</span>
                        <button onClick={() => adjustSets("B", 1)} className="w-5 h-5 rounded hover:bg-white/10 text-white font-bold flex items-center justify-center text-xs">+</button>
                      </div>
                    </div>
                </div>

                <div className="flex flex-col lg:grid lg:grid-cols-[1fr_auto_1fr] w-full gap-4 items-center lg:items-end">
                  
                  {/* LEFT TEAM (Dynamic) */}
                  <div className="flex flex-col items-center lg:items-start gap-2 w-full">
                    <input 
                      value={leftTeam === "A" ? teamNameA : teamNameB} 
                      onChange={(e) => leftTeam === "A" ? setTeamNameA(e.target.value) : setTeamNameB(e.target.value)} 
                      className="w-full text-center lg:text-left font-black bg-transparent text-white text-2xl sm:text-3xl uppercase tracking-tight focus:bg-white/10 rounded px-2 outline-none border-b-2 border-transparent focus:border-white/50 transition-all"
                    />
                    <div className="flex items-center gap-3 px-2">
                      <TimeoutPips value={leftTeam === "A" ? timeoutsA : timeoutsB} onToggle={(idx) => toggleTimeout(leftTeam, idx)} />
                      <button onClick={() => useNextTimeout(leftTeam)} className="text-[10px] font-bold bg-white/10 hover:bg-white/20 px-2 py-1 rounded text-gray-300 uppercase tracking-wider transition">Timeout</button>
                    </div>
                  </div>

                  {/* CENTER SCORE DISPLAY */}
                  <div className="flex items-end gap-4 pb-2">
                    <button onClick={clearLeftSide} className="mb-4 text-[10px] font-bold text-gray-500 hover:text-red-400 uppercase tracking-wide">Clear</button>

                    <div className="flex items-center gap-3 bg-gray-900/80 p-3 rounded-3xl border border-white/10 shadow-2xl">
                      
                      {/* LEFT SCORE CONTROLS (Dynamic) */}
                      <div className="flex flex-col items-center gap-1">
                        <button onClick={() => incrementScore(leftTeam)} className="w-full h-8 bg-white/5 hover:bg-white/20 rounded-t-xl flex items-center justify-center text-[10px] text-gray-400 hover:text-white transition">▲</button>
                        <ScoreControl value={leftScore} />
                        <button onClick={() => decrementScore(leftTeam)} className="w-full h-8 bg-white/5 hover:bg-white/10 rounded-b-xl flex items-center justify-center text-[10px] text-gray-400 hover:text-white transition">▼</button>
                      </div>

                      <span className="text-4xl font-black text-gray-700 pb-2">-</span>
                      
                      {/* RIGHT SCORE CONTROLS (Dynamic) */}
                      <div className="flex flex-col items-center gap-1">
                        <button onClick={() => incrementScore(rightTeam)} className="w-full h-8 bg-white/5 hover:bg-white/20 rounded-t-xl flex items-center justify-center text-[10px] text-gray-400 hover:text-white transition">▲</button>
                        <ScoreControl value={rightScore} />
                        <button onClick={() => decrementScore(rightTeam)} className="w-full h-8 bg-white/5 hover:bg-white/10 rounded-b-xl flex items-center justify-center text-[10px] text-gray-400 hover:text-white transition">▼</button>
                      </div>

                    </div>

                    <button onClick={clearRightSide} className="mb-4 text-[10px] font-bold text-gray-500 hover:text-red-400 uppercase tracking-wide">Clear</button>
                  </div>

                  {/* RIGHT TEAM (Dynamic) */}
                  <div className="flex flex-col items-center lg:items-end gap-2 w-full">
                    <input 
                      value={rightTeam === "A" ? teamNameA : teamNameB} 
                      onChange={(e) => rightTeam === "A" ? setTeamNameA(e.target.value) : setTeamNameB(e.target.value)} 
                      className="w-full text-center lg:text-right font-black bg-transparent text-white text-2xl sm:text-3xl uppercase tracking-tight focus:bg-white/10 rounded px-2 outline-none border-b-2 border-transparent focus:border-white/50 transition-all"
                    />
                    <div className="flex items-center gap-3 px-2">
                      <TimeoutPips value={rightTeam === "A" ? timeoutsA : timeoutsB} onToggle={(idx) => toggleTimeout(rightTeam, idx)} />
                      <button onClick={() => useNextTimeout(rightTeam)} className="text-[10px] font-bold bg-white/10 hover:bg-white/20 px-2 py-1 rounded text-gray-300 uppercase tracking-wider transition">Timeout</button>
                    </div>
                  </div>

                </div>
              </div>

              {/* ROW 4: COURT */}
              <div className="flex flex-col lg:grid lg:grid-cols-[160px_1fr_160px] gap-4 items-start flex-1 min-h-0">
                <div className="order-2 lg:order-1 flex justify-center w-full lg:w-auto">
                  <BenchRail teamId={leftTeam} />
                </div>
                <div className="order-1 lg:order-2 w-full h-full min-h-[350px]">
                  <Court />
                </div>
                <div className="order-3 flex justify-center w-full lg:w-auto">
                  <BenchRail teamId={rightTeam} />
                </div>
              </div>

              <SlotPanel />
              <div className="lg:hidden">
                <ScoresheetPanel />
              </div>
            </div>
          </DndContext>
        </main>
      </div>

      <div className="hidden lg:block w-72 shrink-0 border-l border-white/10 shadow-sm z-10 overflow-hidden bg-white/5 backdrop-blur-sm">
        <ActionSidebar />
      </div>

      {isRulesOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden text-gray-900 border-4 border-gray-100">
            <div className="bg-gray-900 px-6 py-4 flex justify-between items-center">
              <h3 className="text-white font-black text-lg tracking-tight">MATCH RULES</h3>
              <button onClick={() => setIsRulesOpen(false)} className="text-white/50 hover:text-white font-bold text-xl">✕</button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-2 tracking-widest">Match Type</label>
                <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
                  {[1, 3, 5].map((bo) => (
                    <button key={bo} onClick={() => updateSetRules({ bestOf: bo as 3 | 5 })} className={`flex-1 py-2 rounded text-sm font-bold transition ${setRules.bestOf === bo ? "bg-white text-black shadow-sm" : "text-gray-400 hover:text-gray-600"}`}>
                      Best of {bo}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1 tracking-widest">Points / Set</label>
                  <input type="number" className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 font-black text-xl text-center focus:border-blue-500 outline-none text-gray-900" value={setRules.regularPoints} onChange={(e) => updateSetRules({ regularPoints: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1 tracking-widest">Deciding Set</label>
                  <input type="number" className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 font-black text-xl text-center focus:border-blue-500 outline-none text-gray-900" value={setRules.decidingPoints} onChange={(e) => updateSetRules({ decidingPoints: Number(e.target.value) })} />
                </div>
              </div>
              <button onClick={() => setIsRulesOpen(false)} className="w-full bg-gray-900 text-white font-bold py-3 rounded-xl hover:bg-black transition shadow-lg">SAVE RULES</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function isDecidingSet(setsA: number, setsB: number, bestOf: number) {
  const needToWin = Math.ceil(bestOf / 2);
  return setsA === needToWin - 1 && setsB === needToWin - 1;
}

function ScoreControl({ value }: { value: number }) {
  return (
    <div className="bg-white min-w-[100px] text-center py-2 sm:py-4 rounded-2xl shadow-xl border-4 border-white/50">
      <span className="text-6xl font-black text-gray-900 tracking-tighter leading-none block">
        {value}
      </span>
    </div>
  );
}

function TimeoutPips({ value, onToggle }: { value: boolean[]; onToggle: (idx: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {value.map((used, idx) => (
        <button
          key={idx}
          type="button"
          onClick={() => onToggle(idx)}
          className={[
            "h-3 w-3 rounded-full shadow-sm transition-all duration-300 border hover:scale-125", 
            used ? "bg-red-500 border-red-500" : "bg-white/20 border-white/40"
          ].join(" ")}
          title={used ? "Timeout used" : "Timeout available"}
        />
      ))}
    </div>
  );
}