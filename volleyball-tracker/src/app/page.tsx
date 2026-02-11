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
  const players = useMatchStore((s) => s.players);
  const assign = useMatchStore((s) => s.assignPlayerToSlot);
  const resetCourt = useMatchStore((s) => s.resetCourt);
  const resetMatch = useMatchStore((s) => s.resetMatch);
  const undoLastEvent = useMatchStore((s) => s.undoLastEvent);
  const canUndo = useMatchStore((s) => (s.events?.length ?? 0) > 0);
  const rotateTeam = useMatchStore((s) => s.rotateTeam);
  const servingTeam = useMatchStore((s) => s.servingTeam);
  const setServingTeam = useMatchStore((s) => s.setServingTeam);
  const leftTeam = useMatchStore((s) => s.leftTeam);
  const swapSides = useMatchStore((s) => s.swapSides);
  const rightTeam = opponentOf(leftTeam);
  
  // Scoring
  const scoreA = useMatchStore((s) => s.scoreA);
  const scoreB = useMatchStore((s) => s.scoreB);
  
  // Rules & Sets
  const setRules = useMatchStore((s) => s.setRules);
  const updateSetRules = useMatchStore((s) => s.updateSetRules);
  const setNumber = useMatchStore((s) => s.setNumber);
  const setsWonA = useMatchStore((s) => s.setsWonA);
  const setsWonB = useMatchStore((s) => s.setsWonB);
  
  // Actions
  const incrementScore = useMatchStore((s) => s.incrementScore);
  const decrementScore = useMatchStore((s) => s.decrementScore);
  const manualSetSets = useMatchStore((s) => s.manualSetSets);

  // Match Summary
  const openMatchSummary = useMatchStore((s) => s.openMatchSummary);
  const savedSetsCount = useMatchStore((s) => (s.savedSets?.length ?? 0));

  // Toast
  const toast = useMatchStore((s) => s.toast);
  const clearToast = useMatchStore((s) => s.clearToast);

  const teamA = useMemo(() => players.filter((p) => p.teamId === "A"), [players]);
  const teamB = useMemo(() => players.filter((p) => p.teamId === "B"), [players]);

  const [teamNameA, setTeamNameA] = useState("TEAM A NAME");
  const [teamNameB, setTeamNameB] = useState("TEAM B NAME");
  
  const [timeoutsA, setTimeoutsA] = useState([false, false, false]);
  const [timeoutsB, setTimeoutsB] = useState([false, false, false]);

  const [isRulesOpen, setIsRulesOpen] = useState(false);

  const needToWinMatch = Math.ceil(setRules.bestOf / 2);
  const isDecidingSet = setsWonA === needToWinMatch - 1 && setsWonB === needToWinMatch - 1;
  const currentTargetPoints = isDecidingSet ? setRules.decidingPoints : setRules.regularPoints;

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

  const toastTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!toast) return;
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => { clearToast(); }, 2600);
    return () => { if (toastTimer.current) window.clearTimeout(toastTimer.current); };
  }, [toast, clearToast]);

  const btnBase = "px-4 py-2 sm:px-6 sm:py-3 text-xs sm:text-base font-bold rounded-xl shadow-md transition-all active:scale-95 border border-transparent tracking-wide";
  const btnWhite = `${btnBase} bg-white text-gray-900 hover:bg-gray-100 hover:shadow-lg`;
  const btnDark = `${btnBase} bg-gray-800 text-white hover:bg-gray-700`;
  const btnBlue = `${btnBase} bg-sky-500 text-white hover:bg-sky-600 scale-105 ring-4 ring-sky-900/30 sm:text-lg`;
  const btnRed = `${btnBase} bg-red-600 text-white hover:bg-red-700`;
  const btnDisabled = `${btnBase} bg-gray-700 text-gray-500 cursor-not-allowed shadow-none`;

  const adjustSets = (teamId: "A" | "B", delta: number) => {
    const current = teamId === "A" ? setsWonA : setsWonB;
    const newVal = Math.max(0, Math.min(5, current + delta));
    manualSetSets(teamId, newVal);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--background)] text-white">
      
      {/* 🟢 LEFT: Event Log Rail (Hidden on smaller laptops to save space, visible on large screens) */}
      <div className="hidden xl:block w-52 shrink-0 border-r border-white/10 shadow-sm z-10 overflow-hidden bg-white/5 backdrop-blur-sm">
        <EventLogRail />
      </div>

      {/* 🟢 CENTER: Main Content */}
      <div className="flex-1 overflow-y-auto">
        <main className="min-h-full p-3 sm:p-6 lg:p-8 flex flex-col">
          <DndContext sensors={sensors} onDragStart={onDragStart} onDragCancel={onDragCancel} onDragEnd={onDragEnd}>
            <div className="w-full max-w-[1800px] mx-auto flex flex-col gap-4 sm:gap-8 pb-20 flex-1">
              <MatchSummaryModal />

              {toast && (
                <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[999] px-4 pointer-events-none">
                  <div className={`w-full max-w-lg rounded-2xl shadow-2xl border-2 px-6 py-4 flex items-start gap-4 pointer-events-auto transition-all duration-200 ease-out animate-[toastIn_0.18s_ease-out] ${toast.type === "error" ? "bg-red-600 text-white border-red-400" : "bg-sky-600 text-white border-sky-400"}`} role="status">
                    <div className="text-lg font-bold leading-snug flex-1">{toast.message}</div>
                    <button type="button" onClick={clearToast} className="shrink-0 rounded-lg bg-white/20 hover:bg-white/30 px-3 py-1 text-sm font-black">✕</button>
                  </div>
                </div>
              )}

              {/* ROW 1: HEADER */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-2 sm:gap-3 flex-wrap">
                  <button onClick={openMatchSummary} disabled={savedSetsCount === 0} className={savedSetsCount > 0 ? btnWhite : btnDisabled}>
                    MATCH SUMMARY {savedSetsCount > 0 && `(${savedSetsCount})`}
                  </button>
                  <button onClick={() => router.push("/setup")} className={btnWhite}>ROSTER</button>
                  <button onClick={() => setIsRulesOpen(true)} className={`${btnDark} flex items-center gap-2`}>
                    <span>⚙️ RULES</span>
                    <span className="bg-gray-700 px-2 py-0.5 rounded text-xs uppercase tracking-wider">Bo{setRules.bestOf}</span>
                  </button>
                </div>
                <div className="flex gap-2 sm:gap-3">
                  <button onClick={handleReset} className={btnRed}>RESET MATCH</button>
                  <button onClick={undoLastEvent} disabled={!canUndo} className={canUndo ? btnDark : btnDisabled}>UNDO</button>
                </div>
                <div className="flex gap-2 sm:gap-3">
                  <button onClick={swapSides} className={btnWhite}>SWAP</button>
                  <button onClick={rotateLeftSide} className={btnWhite}>ROT L</button>
                  <button onClick={rotateRightSide} className={btnWhite}>ROT R</button>
                </div>
              </div>

              {/* ROW 2: SERVE */}
              <div className="flex flex-wrap justify-center gap-4 sm:gap-6 py-2">
                 <button onClick={() => setServingTeam("A")} className={servingTeam === "A" ? btnBlue : btnWhite}>Serve Team A</button>
                 <button onClick={() => setServingTeam("B")} className={servingTeam === "B" ? btnBlue : btnWhite}>Serve Team B</button>
              </div>

              {/* ROW 3: SCOREBOARD */}
              <div className="flex flex-col gap-4 items-center w-full">
                <div className="flex items-center gap-4">
                    <div className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-[0.2em]">
                      Set {setNumber} • Target {currentTargetPoints}
                    </div>
                    {/* MANUAL SETS ADJUSTMENT */}
                    <div className="bg-white px-4 py-1.5 rounded-full shadow-md flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <button onClick={() => adjustSets("A", -1)} className="w-5 h-5 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold leading-none flex items-center justify-center">-</button>
                        <span className="text-sm font-black text-gray-900">{setsWonA}</span>
                        <button onClick={() => adjustSets("A", 1)} className="w-5 h-5 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold leading-none flex items-center justify-center">+</button>
                      </div>
                      <span className="text-xs font-bold text-gray-400">SETS</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => adjustSets("B", -1)} className="w-5 h-5 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold leading-none flex items-center justify-center">-</button>
                        <span className="text-sm font-black text-gray-900">{setsWonB}</span>
                        <button onClick={() => adjustSets("B", 1)} className="w-5 h-5 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold leading-none flex items-center justify-center">+</button>
                      </div>
                    </div>
                </div>

                <div className="flex flex-col lg:grid lg:grid-cols-[1fr_auto_1fr] w-full gap-4 sm:gap-8 items-center lg:items-end">
                  
                  {/* Left Side */}
                  <div className="flex flex-col items-center lg:items-start gap-3 w-full">
                    <input 
                      value={leftTeam === "A" ? teamNameA : teamNameB} 
                      onChange={(e) => leftTeam === "A" ? setTeamNameA(e.target.value) : setTeamNameB(e.target.value)} 
                      className="w-full text-center font-black outline-none bg-white text-gray-900 rounded-2xl shadow-lg px-6 py-4 text-xl sm:text-3xl border-4 border-transparent focus:border-blue-400 transition-all uppercase tracking-tight" 
                    />
                    <div className="flex flex-col items-center w-full gap-2 px-4">
                      <TimeoutPips value={leftTeam === "A" ? timeoutsA : timeoutsB} onToggle={(idx) => toggleTimeout(leftTeam, idx)} />
                      <button onClick={() => useNextTimeout(leftTeam)} className="w-full py-2 bg-gray-800 text-white text-xs font-bold rounded-lg shadow hover:bg-gray-700 uppercase tracking-widest transition">Timeout</button>
                    </div>
                  </div>

                  {/* Center: Score + Manual Adjustments */}
                  <div className="flex items-end gap-3 sm:gap-6 pb-2">
                    <button onClick={clearLeftSide} className="mb-2 sm:mb-4 px-3 sm:px-4 py-2 rounded-xl bg-gray-800 text-gray-400 text-[10px] sm:text-xs font-bold hover:bg-red-600 hover:text-white shadow-md transition uppercase tracking-wide">
                      Clear
                    </button>

                    <div className="flex items-center gap-2 sm:gap-4 bg-gray-900/50 p-2 sm:p-4 rounded-3xl backdrop-blur-sm border border-white/5">
                      
                      {/* SCORE A */}
                      <div className="flex flex-col items-center gap-1">
                        <button onClick={() => incrementScore("A")} className="w-full h-8 bg-white/10 hover:bg-white/20 rounded-t-xl flex items-center justify-center text-xs text-white transition">▲</button>
                        <ScoreControl value={scoreA} teamId="A" />
                        <button onClick={() => decrementScore("A")} className="w-full h-8 bg-white/10 hover:bg-white/20 rounded-b-xl flex items-center justify-center text-xs text-white transition">▼</button>
                      </div>

                      <span className="text-4xl sm:text-6xl font-black text-white/20 pb-2 sm:pb-4">-</span>
                      
                      {/* SCORE B */}
                      <div className="flex flex-col items-center gap-1">
                        <button onClick={() => incrementScore("B")} className="w-full h-8 bg-white/10 hover:bg-white/20 rounded-t-xl flex items-center justify-center text-xs text-white transition">▲</button>
                        <ScoreControl value={scoreB} teamId="B" />
                        <button onClick={() => decrementScore("B")} className="w-full h-8 bg-white/10 hover:bg-white/20 rounded-b-xl flex items-center justify-center text-xs text-white transition">▼</button>
                      </div>

                    </div>

                    <button onClick={clearRightSide} className="mb-2 sm:mb-4 px-3 sm:px-4 py-2 rounded-xl bg-gray-800 text-gray-400 text-[10px] sm:text-xs font-bold hover:bg-red-600 hover:text-white shadow-md transition uppercase tracking-wide">
                      Clear
                    </button>
                  </div>

                  {/* Right Side */}
                  <div className="flex flex-col items-center lg:items-end gap-3 w-full">
                    <input 
                      value={rightTeam === "A" ? teamNameA : teamNameB} 
                      onChange={(e) => rightTeam === "A" ? setTeamNameA(e.target.value) : setTeamNameB(e.target.value)} 
                      className="w-full text-center font-black outline-none bg-white text-gray-900 rounded-2xl shadow-lg px-6 py-4 text-xl sm:text-3xl border-4 border-transparent focus:border-blue-400 transition-all uppercase tracking-tight" 
                    />
                    <div className="flex flex-col items-center w-full gap-2 px-4">
                      <TimeoutPips value={rightTeam === "A" ? timeoutsA : timeoutsB} onToggle={(idx) => toggleTimeout(rightTeam, idx)} />
                      <button onClick={() => useNextTimeout(rightTeam)} className="w-full py-2 bg-gray-800 text-white text-xs font-bold rounded-lg shadow hover:bg-gray-700 uppercase tracking-widest transition">Timeout</button>
                    </div>
                  </div>

                </div>
              </div>

              {/* ROW 4: COURT */}
              <div className="flex flex-col lg:grid lg:grid-cols-[160px_1fr_160px] gap-6 items-start flex-1 min-h-0">
                <div className="order-2 lg:order-1 flex justify-center w-full lg:w-auto">
                  <BenchRail teamId={leftTeam} />
                </div>
                <div className="order-1 lg:order-2 w-full h-full min-h-[300px]">
                  <Court />
                </div>
                <div className="order-3 flex justify-center w-full lg:w-auto">
                  <BenchRail teamId={rightTeam} />
                </div>
              </div>

              <SlotPanel />
              
              {/* ✅ THIS IS THE FIX: */}
              {/* The mobile popup (ScoresheetPanel) is HIDDEN on Large screens (lg:hidden). */}
              {/* This stops it from popping up over the court when the Static Sidebar is visible. */}
              <div className="lg:hidden">
                <ScoresheetPanel />
              </div>

            </div>
          </DndContext>
        </main>
      </div>

      {/* 🟢 RIGHT: Action Sidebar */}
      {/* VISIBLE on Large Screens (lg:block). This is the static sidebar you want. */}
      {/* Reduced width slightly to 20rem (w-80 -> w-64) to fit better on laptops */}
      <div className="hidden lg:block w-64 shrink-0 border-l border-white/10 shadow-sm z-10 overflow-hidden bg-white/5 backdrop-blur-sm">
        <ActionSidebar />
      </div>

      {/* MODAL: Rules Settings */}
      {isRulesOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden text-gray-900 border-4 border-gray-100">
            <div className="bg-gray-900 px-6 py-5 flex justify-between items-center">
              <h3 className="text-white font-black text-xl tracking-tight">MATCH RULES</h3>
              <button onClick={() => setIsRulesOpen(false)} className="text-white/50 hover:text-white font-bold text-xl">✕</button>
            </div>
            <div className="p-8 space-y-8">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase block mb-3 tracking-widest">Match Type</label>
                <div className="flex bg-gray-100 rounded-xl p-1.5 gap-1">
                  {[1, 3, 5].map((bo) => (
                    <button key={bo} onClick={() => updateSetRules({ bestOf: bo as 3 | 5 })} className={`flex-1 py-3 rounded-lg text-sm font-bold transition ${setRules.bestOf === bo ? "bg-white text-black shadow-md scale-105" : "text-gray-400 hover:text-gray-600"}`}>
                      Best of {bo}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase block mb-2 tracking-widest">Points / Set</label>
                  <input type="number" className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 font-black text-2xl text-center focus:border-blue-500 outline-none text-gray-900" value={setRules.regularPoints} onChange={(e) => updateSetRules({ regularPoints: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase block mb-2 tracking-widest">Deciding Set</label>
                  <input type="number" className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 font-black text-2xl text-center focus:border-blue-500 outline-none text-gray-900" value={setRules.decidingPoints} onChange={(e) => updateSetRules({ decidingPoints: Number(e.target.value) })} />
                </div>
              </div>
              <button onClick={() => setIsRulesOpen(false)} className="w-full bg-gray-900 text-white font-bold py-4 rounded-xl hover:bg-black transition text-lg shadow-xl hover:shadow-2xl transform active:scale-95">SAVE RULES</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreControl({ value, teamId }: { value: number, teamId: "A" | "B" }) {
  return (
    <div className="bg-white min-w-[80px] sm:min-w-[140px] text-center py-2 sm:py-4 rounded-3xl shadow-2xl border-4 border-white/50">
      <span className="text-5xl sm:text-8xl font-black text-gray-900 tracking-tighter leading-none block">
        {value}
      </span>
    </div>
  );
}

function TimeoutPips({ value, onToggle }: { value: boolean[]; onToggle: (idx: number) => void }) {
  return (
    <div className="flex items-center gap-3 py-2">
      {value.map((used, idx) => (
        <button
          key={idx}
          type="button"
          onClick={() => onToggle(idx)}
          className={[
            "h-4 w-4 sm:h-5 sm:w-5 rounded-full shadow-md transition-all duration-300 border-2 hover:scale-125", 
            used ? "bg-red-500 border-red-600 scale-110" : "bg-gray-200 border-gray-300"
          ].join(" ")}
          title={used ? "Timeout used" : "Timeout available"}
        />
      ))}
    </div>
  );
}