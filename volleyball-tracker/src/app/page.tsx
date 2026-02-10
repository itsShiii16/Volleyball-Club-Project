"use client";

import Court from "@/components/Court/Court";
import SlotPanel from "@/components/Court/SlotPanel";
import BenchRail from "@/components/Court/Bench/BenchRail";
import MatchSummaryModal from "@/components/MatchSummary/MatchSummaryModal";

import EventLogRail from "@/components/EventLogRail";
import ActionSidebar from "@/components/ActionSidebar";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useMatchStore } from "@/store/matchStore";
import { useRouter } from "next/navigation";

import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  type DragCancelEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
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

  const scoreA = useMatchStore((s) => s.scoreA);
  const scoreB = useMatchStore((s) => s.scoreB);

  // Set Rules (Best of 3/5)
  const setRules = useMatchStore((s) => s.setRules);
  const updateSetRules = useMatchStore((s) => s.updateSetRules);

  // Match Summary
  const openMatchSummary = useMatchStore((s) => s.openMatchSummary);
  const savedSetsCount = useMatchStore((s) => (s.savedSets?.length ?? 0));

  // Toast
  const toast = useMatchStore((s) => s.toast);
  const clearToast = useMatchStore((s) => s.clearToast);

  const teamA = useMemo(() => players.filter((p) => p.teamId === "A"), [players]);
  const teamB = useMemo(() => players.filter((p) => p.teamId === "B"), [players]);
  
  // Note: rosterReady check removed from UI since Auto-fill is gone, 
  // but logic stays if needed elsewhere.
  const rosterReady = teamA.length >= 6 && teamB.length >= 6;

  // UI-only: names, set score, timeouts
  const [teamNameA, setTeamNameA] = useState("TEAM A NAME");
  const [teamNameB, setTeamNameB] = useState("TEAM B NAME");

  const [setsA, setSetsA] = useState(0);
  const [setsB, setSetsB] = useState(0);

  const [timeoutsA, setTimeoutsA] = useState([false, false, false]);
  const [timeoutsB, setTimeoutsB] = useState([false, false, false]);

  // DnD sensors
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

  function onDragCancel(_: DragCancelEvent) {
    restoreScroll();
  }

  function onDragEnd(event: DragEndEvent) {
    restoreScroll();

    const { active, over } = event;
    if (!over) return;

    const playerId = String(active.id);
    const overId = String(over.id);
    const [teamIdRaw, slotRaw] = overId.split("-");
    const slotNum = Number(slotRaw);

    const teamId = teamIdRaw === "A" || teamIdRaw === "B" ? teamIdRaw : null;
    if (!teamId) return;
    if (![1, 2, 3, 4, 5, 6].includes(slotNum)) return;

    const p = players.find((x) => x.id === playerId);
    if (!p) return;
    if (p.teamId !== teamId) return;

    assign(teamId, slotNum as any, playerId);
  }

  function rotateLeftSide() {
    rotateTeam(leftTeam);
  }
  function rotateRightSide() {
    rotateTeam(rightTeam);
  }

  function clearLeftSide() {
    resetCourt(leftTeam);
  }
  function clearRightSide() {
    resetCourt(rightTeam);
  }

  // Toggle specific timeout (allows undoing/removing a checked box)
  function toggleTimeout(team: "A" | "B", idx: number) {
    if (team === "A") {
      setTimeoutsA((prev) => prev.map((v, i) => (i === idx ? !v : v)));
    } else {
      setTimeoutsB((prev) => prev.map((v, i) => (i === idx ? !v : v)));
    }
  }

  // Use next available timeout (for the main button)
  function useNextTimeout(team: "A" | "B") {
    if (team === "A") {
      const idx = timeoutsA.findIndex((used) => !used);
      if (idx !== -1) {
        toggleTimeout("A", idx);
      }
    } else {
      const idx = timeoutsB.findIndex((used) => !used);
      if (idx !== -1) {
        toggleTimeout("B", idx);
      }
    }
  }

  const handleReset = useCallback(() => {
    resetMatch();
    setSetsA(0);
    setSetsB(0);
    setTimeoutsA([false, false, false]);
    setTimeoutsB([false, false, false]);
  }, [resetMatch]);

  const toastTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!toast) return;
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => {
      clearToast();
    }, 2600);
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      toastTimer.current = null;
    };
  }, [toast, clearToast]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--background)]">
      
      {/* 🟢 LEFT: Event Log Rail */}
      <div className="w-64 shrink-0 border-r border-black/10 shadow-sm z-10 overflow-hidden bg-white/50 backdrop-blur-sm">
        <EventLogRail />
      </div>

      {/* 🟢 CENTER: Main Content */}
      <div className="flex-1 overflow-y-auto">
        <main className="min-h-full p-6">
          <DndContext
            sensors={sensors}
            onDragStart={onDragStart}
            onDragCancel={onDragCancel}
            onDragEnd={onDragEnd}
          >
            <div className="max-w-6xl mx-auto flex flex-col gap-4">
              <MatchSummaryModal />

              {toast && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[999] px-4 pointer-events-none">
                  <div
                    className={[
                      "w-full max-w-md rounded-2xl shadow-lg border px-4 py-3 flex items-start gap-3 pointer-events-auto",
                      "transition-all duration-200 ease-out",
                      "animate-[toastIn_0.18s_ease-out]",
                      toast.type === "error"
                        ? "bg-red-600 text-white border-red-700"
                        : toast.type === "warn"
                        ? "bg-amber-500 text-black border-amber-600"
                        : "bg-sky-600 text-white border-sky-700",
                    ].join(" ")}
                    role="status"
                  >
                    <div className="text-sm font-extrabold leading-snug flex-1">
                      {toast.message}
                    </div>
                    <button
                      type="button"
                      onClick={clearToast}
                      className="shrink-0 rounded-lg bg-white/20 hover:bg-white/30 px-2 py-1 text-xs font-black"
                      aria-label="Close toast"
                      title="Close"
                    >
                      ✕
                    </button>
                  </div>
                  <style jsx>{`
                    @keyframes toastIn {
                      from { opacity: 0; transform: translateY(-8px); }
                      to { opacity: 1; transform: translateY(0px); }
                    }
                  `}</style>
                </div>
              )}

              {/* ... Top Action Rows ... */}
              <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
                {/* Left cluster */}
                <div className="flex gap-2 flex-wrap items-center">
                  <button onClick={() => router.push("/setup")} className="px-4 py-2 rounded-xl font-semibold shadow bg-white text-black hover:bg-white/90">
                    Set up Roster
                  </button>
                  <button onClick={() => setServingTeam("A")} className={["px-4 py-2 rounded-xl font-semibold shadow", servingTeam === "A" ? "bg-[var(--brand-sky)] text-white" : "bg-white text-black hover:bg-white/90"].join(" ")}>
                    Serve A
                  </button>
                  <button onClick={() => setServingTeam("B")} className={["px-4 py-2 rounded-xl font-semibold shadow", servingTeam === "B" ? "bg-[var(--brand-sky)] text-white" : "bg-white text-black hover:bg-white/90"].join(" ")}>
                    Serve B
                  </button>
                  <button onClick={openMatchSummary} disabled={savedSetsCount === 0} className={["px-4 py-2 rounded-xl font-semibold shadow", savedSetsCount > 0 ? "bg-white text-black hover:bg-white/90" : "bg-white/60 text-black/40 cursor-not-allowed"].join(" ")}>
                    Match Summary
                  </button>

                  {/* Best of 3/5 Selector */}
                  <div className="flex items-center bg-white rounded-xl shadow border border-gray-200 overflow-hidden ml-2">
                    <button 
                      onClick={() => updateSetRules({ bestOf: 3 })}
                      className={`px-3 py-2 text-xs font-bold ${setRules.bestOf === 3 ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                      Best of 3
                    </button>
                    <button 
                      onClick={() => updateSetRules({ bestOf: 5 })}
                      className={`px-3 py-2 text-xs font-bold ${setRules.bestOf === 5 ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                      Best of 5
                    </button>
                  </div>
                </div>

                {/* Center cluster */}
                <div className="flex flex-col items-center gap-2">
                  <button onClick={handleReset} className="px-8 py-2 rounded-xl font-extrabold shadow bg-red-500 text-white hover:opacity-90">Reset</button>
                  <button onClick={undoLastEvent} disabled={!canUndo} className={["px-6 py-2 rounded-xl font-bold shadow", canUndo ? "bg-red-500/70 text-white hover:opacity-90" : "bg-white/30 text-white/50 cursor-not-allowed"].join(" ")}>
                    Undo Score
                  </button>
                </div>

                {/* Right cluster */}
                <div className="flex gap-2 flex-wrap items-center justify-end">
                  <button onClick={swapSides} className="px-4 py-2 rounded-xl font-semibold shadow bg-white text-black hover:bg-white/90">Swap</button>
                  <button onClick={rotateLeftSide} className="px-4 py-2 rounded-xl font-semibold shadow bg-white text-black hover:bg-white/90">Rotate L</button>
                  <button onClick={rotateRightSide} className="px-4 py-2 rounded-xl font-semibold shadow bg-white text-black hover:bg-white/90">Rotate R</button>
                </div>
              </div>

              {/* Second row (Scores) */}
              <div className="grid grid-cols-[160px_1fr_160px] gap-3 items-center">
                
                {/* Left Side */}
                <div className="flex flex-col gap-2">
                  {/* Name Input */}
                  <div className="rounded-xl bg-white shadow px-4 py-4 text-black font-extrabold text-center">
                    <input value={leftTeam === "A" ? teamNameA : teamNameB} onChange={(e) => leftTeam === "A" ? setTeamNameA(e.target.value) : setTeamNameB(e.target.value)} className="w-full text-center font-extrabold outline-none" />
                  </div>
                  
                  {/* Timeouts */}
                  <div className="flex flex-col items-center gap-2">
                    <TimeoutPips 
                      value={leftTeam === "A" ? timeoutsA : timeoutsB} 
                      onToggle={(idx) => toggleTimeout(leftTeam, idx)}
                    />
                    <button 
                      onClick={() => useNextTimeout(leftTeam)}
                      className="px-3 py-2 rounded-lg bg-white shadow text-xs font-bold text-black hover:bg-red-50 hover:text-red-600 transition"
                    >
                      Timeout
                    </button>
                  </div>

                  {/* ✅ Clear Board moved here (above court, below names) */}
                  <button onClick={clearLeftSide} className="mt-1 px-3 py-1 text-xs font-bold text-gray-400 hover:text-red-600 self-center transition-colors">
                    Clear Board
                  </button>
                </div>

                {/* Center Scoreboard */}
                <div className="flex flex-col items-center gap-3">
                  <div className="rounded-xl bg-white shadow px-6 py-2 text-black font-extrabold">
                    SET SCORE: <span className="font-black">{setsA}-{setsB}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setSetsA((v) => Math.max(0, v - 1))} className="h-9 w-9 rounded-lg bg-white shadow font-black text-black">−</button>
                    <button onClick={() => setSetsA((v) => Math.min(5, v + 1))} className="h-9 w-9 rounded-lg bg-white shadow font-black text-black">+</button>
                    <div className="w-3" />
                    <button onClick={() => setSetsB((v) => Math.max(0, v - 1))} className="h-9 w-9 rounded-lg bg-white shadow font-black text-black">−</button>
                    <button onClick={() => setSetsB((v) => Math.min(5, v + 1))} className="h-9 w-9 rounded-lg bg-white shadow font-black text-black">+</button>
                  </div>
                  <div className="rounded-xl bg-white shadow px-10 py-2 text-black font-black text-lg">{scoreA} - {scoreB}</div>
                  
                  {/* ❌ Auto-fill Starting 6 Removed */}
                </div>

                {/* Right Side */}
                <div className="flex flex-col gap-2">
                  {/* Name Input */}
                  <div className="rounded-xl bg-white shadow px-4 py-4 text-black font-extrabold text-center">
                    <input value={rightTeam === "A" ? teamNameA : teamNameB} onChange={(e) => rightTeam === "A" ? setTeamNameA(e.target.value) : setTeamNameB(e.target.value)} className="w-full text-center font-extrabold outline-none" />
                  </div>

                  {/* Timeouts */}
                  <div className="flex flex-col items-center gap-2">
                    <TimeoutPips 
                      value={rightTeam === "A" ? timeoutsA : timeoutsB} 
                      onToggle={(idx) => toggleTimeout(rightTeam, idx)}
                    />
                    <button 
                      onClick={() => useNextTimeout(rightTeam)}
                      className="px-3 py-2 rounded-lg bg-white shadow text-xs font-bold text-black hover:bg-red-50 hover:text-red-600 transition"
                    >
                      Timeout
                    </button>
                  </div>

                  {/* ✅ Clear Board moved here (above court, below names) */}
                  <button onClick={clearRightSide} className="mt-1 px-3 py-1 text-xs font-bold text-gray-400 hover:text-red-600 self-center transition-colors">
                    Clear Board
                  </button>
                </div>
              </div>

              {/* Bench + Court */}
              <div className="grid grid-cols-[140px_1fr_140px] gap-4 items-start">
                <BenchRail teamId={leftTeam} />
                <Court />
                <BenchRail teamId={rightTeam} />
              </div>

              {/* Panels */}
              <SlotPanel />
            </div>
          </DndContext>
        </main>
      </div>

      {/* 🟢 RIGHT: Action Sidebar */}
      <div className="w-80 shrink-0 border-l border-black/10 shadow-sm z-10 overflow-hidden bg-white/50 backdrop-blur-sm">
        <ActionSidebar />
      </div>
    </div>
  );
}

// ✅ Updated Pips: Click to toggle, Red when used
function TimeoutPips({ value, onToggle }: { value: boolean[]; onToggle: (idx: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      {value.map((used, idx) => (
        <button
          key={idx}
          type="button"
          onClick={() => onToggle(idx)}
          className={[
            "h-4 w-4 rounded-sm shadow transition-colors duration-300 hover:scale-110", 
            used ? "bg-red-500" : "bg-white"
          ].join(" ")}
          title={used ? "Timeout used (click to undo)" : "Timeout available (click to use)"}
        />
      ))}
    </div>
  );
}