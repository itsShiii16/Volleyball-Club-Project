"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMatchStore } from "@/store/matchStore";
import { slotLabel } from "@/lib/volleyball";
import type { RotationSlot } from "@/lib/volleyball";

type SelectedMode = "default" | "bench";

// Helper to check eligible positions
function isRotatablePosition(pos: string | undefined) {
  const p = String(pos ?? "").toUpperCase();
  return ["MB", "MIDDLE", "OH", "OUTSIDE", "WS", "OPP", "OPPOSITE", "RIGHT"].some(k => p.includes(k));
}

export default function SlotPanel() {
  const selected = useMatchStore((s) => s.selected);
  const clearSelection = useMatchStore((s) => s.clearSelection);

  const players = useMatchStore((s) => s.players);
  const assign = useMatchStore((s) => s.assignPlayerToSlot);
  const substituteInSlot = useMatchStore((s) => s.substituteInSlot);
  const getOnCourtPlayerIds = useMatchStore((s) => s.getOnCourtPlayerIds);

  const courtA = useMatchStore((s) => s.courtA);
  const courtB = useMatchStore((s) => s.courtB);

  const liberoConfigA = useMatchStore((s) => s.liberoConfigA);
  const liberoConfigB = useMatchStore((s) => s.liberoConfigB);
  const setLiberoConfig = useMatchStore((s) => s.setLiberoConfig);

  const liberoSwapA = useMatchStore((s) => s.liberoSwapA);
  const liberoSwapB = useMatchStore((s) => s.liberoSwapB);

  const [swapMode, setSwapMode] = useState(false);
  const [swapPick, setSwapPick] = useState<RotationSlot | null>(null);

  const benchRef = useRef<HTMLDivElement | null>(null);

  const info = useMemo(() => {
    if (!selected) return null;

    const { teamId, slot } = selected;
    const court = teamId === "A" ? courtA : courtB;

    const playerId = court[slot] ?? null;
    const player = players.find((p) => p.id === playerId) ?? null;

    const onCourtIds = new Set(getOnCourtPlayerIds(teamId));
    const roster = players.filter((p) => p.teamId === teamId);

    const onCourt = roster
      .filter((p) => onCourtIds.has(p.id))
      .sort((a, b) => a.jerseyNumber - b.jerseyNumber);

    const bench = roster
      .filter((p) => !onCourtIds.has(p.id))
      .sort((a, b) => a.jerseyNumber - b.jerseyNumber);

    const cfg = teamId === "A" ? liberoConfigA : liberoConfigB;
    const swap = teamId === "A" ? liberoSwapA : liberoSwapB;

    const libero =
      cfg.liberoId ? roster.find((p) => p.id === cfg.liberoId) ?? null : null;

    const isAutoLiberoOnThisSlot =
      !!playerId &&
      swap.active &&
      swap.slot === slot &&
      swap.liberoId === playerId;

    const replaced =
      isAutoLiberoOnThisSlot && swap.replacedPlayerId
        ? roster.find((p) => p.id === swap.replacedPlayerId) ?? null
        : null;

    return {
      teamId,
      slot,
      player,
      onCourt,
      bench,
      cfg,
      swap,
      libero,
      isAutoLiberoOnThisSlot,
      replaced,
      court,
      roster,
    };
  }, [
    selected,
    players,
    courtA,
    courtB,
    getOnCourtPlayerIds,
    liberoConfigA,
    liberoConfigB,
    liberoSwapA,
    liberoSwapB,
  ]);

  useEffect(() => {
    if (!selected) return;
    const mode = (selected.mode ?? "default") as SelectedMode;
    if (mode !== "bench") return;

    setSwapMode(false);
    setSwapPick(null);

    requestAnimationFrame(() => {
      benchRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [selected]);

  if (!info) return null;

  const {
    teamId,
    slot,
    player,
    bench,
    cfg,
    swap,
    isAutoLiberoOnThisSlot,
    replaced,
    court,
    roster,
  } = info;

  const titleTeam = teamId === "A" ? "Team A" : "Team B";

  function closeAll() {
    clearSelection();
    setSwapMode(false);
    setSwapPick(null);
  }

  function handleSub(playerId: string) {
    substituteInSlot(teamId, slot, playerId);
    closeAll();
  }

  function handleSwapPick(nextSlot: RotationSlot) {
    if (!swapPick) {
      setSwapPick(nextSlot);
      return;
    }

    const temp = court[swapPick];
    assign(teamId, swapPick, court[nextSlot] ?? "");
    assign(teamId, nextSlot, temp ?? "");

    setSwapPick(null);
    setSwapMode(false);
  }

  // ✅ FIX: Cast position to string to allow comparison with "LIBERO"
  const liberos = roster.filter((p) => p.position === "L" || (p.position as string) === "LIBERO");
  
  const rotatablePlayers = roster.filter((p) => isRotatablePosition(p.position));

  function toggleReplacementId(id: string) {
    const current = Array.isArray(cfg.replacementIds) ? [...cfg.replacementIds] : [];
    const exists = current.includes(id);

    let next = exists
      ? current.filter((x) => x !== id)
      : [...current, id];

    next = Array.from(new Set(next)).slice(0, 2);

    setLiberoConfig(teamId, { replacementIds: next });
  }

  const selectedReplacements = (cfg.replacementIds ?? [])
    .map((id) => roster.find((p) => p.id === id))
    .filter(Boolean);

  const currentSwapSlotLabel =
    swap.active && swap.slot ? slotLabel[swap.slot] : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" 
        onClick={closeAll} 
      />

      {/* Slide-out Panel */}
      <div className="relative h-full w-full max-w-sm bg-white shadow-2xl flex flex-col transform transition-transform overflow-hidden">
        
        {/* Header */}
        <div className="shrink-0 px-6 py-5 border-b border-gray-100 flex items-start justify-between bg-white z-10">
          <div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              {titleTeam} • Slot {slotLabel[slot]}
            </div>
            <h2 className="text-2xl font-black text-gray-900 mt-1">
              {player ? `#${player.jerseyNumber} ${player.name}` : "Empty Slot"}
            </h2>
          </div>
          <button 
            onClick={closeAll} 
            className="p-2 -mr-2 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
          
          {/* Libero Status Banner */}
          {isAutoLiberoOnThisSlot && replaced && (
            <div className="mb-4 text-xs font-bold text-teal-800 bg-teal-100 border border-teal-200 px-3 py-2 rounded-lg flex items-center gap-2">
              <span className="text-lg">🔄</span> 
              Libero actively replacing #{replaced.jerseyNumber}
            </div>
          )}

          {/* Libero Settings */}
          <div className="mb-6 rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-black text-gray-900">Libero Config</h3>
              <button
                onClick={() => setLiberoConfig(teamId, { enabled: !cfg.enabled })}
                className={`text-[10px] font-bold px-2 py-1 rounded border transition ${
                  cfg.enabled 
                    ? "bg-green-100 text-green-700 border-green-200" 
                    : "bg-gray-100 text-gray-500 border-gray-200"
                }`}
              >
                {cfg.enabled ? "ENABLED" : "DISABLED"}
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Active Libero</label>
                <select
                  className="w-full text-sm font-bold p-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-blue-500 outline-none text-gray-900"
                  value={cfg.liberoId ?? ""}
                  onChange={(e) =>
                    setLiberoConfig(teamId, { liberoId: e.target.value || null })
                  }
                >
                  <option value="" className="text-gray-400">Select Libero...</option>
                  {liberos.map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.jerseyNumber} {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                  Players to Rotate ({selectedReplacements.length}/2)
                </label>
                <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                  {rotatablePlayers.length === 0 && <div className="text-xs text-gray-400 italic">No eligible players (MB/OH/OPP)</div>}
                  {rotatablePlayers.map((p) => {
                    const isChecked = cfg.replacementIds?.includes(p.id) ?? false;
                    const isDisabled = !isChecked && (cfg.replacementIds?.length ?? 0) >= 2;
                    
                    return (
                      <label 
                        key={p.id} 
                        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition ${
                          isChecked ? "bg-blue-50 border-blue-200" : "hover:bg-gray-50"
                        } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        <input
                          type="checkbox"
                          className="rounded text-blue-600 focus:ring-blue-500"
                          checked={isChecked}
                          disabled={isDisabled}
                          onChange={() => toggleReplacementId(p.id)}
                        />
                        <span className={`text-sm font-bold ${isChecked ? "text-blue-900" : "text-gray-700"}`}>
                          #{p.jerseyNumber} {p.name} <span className="text-[10px] text-gray-400 ml-1">({p.position})</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {swap.active && currentSwapSlotLabel && (
                <div className="text-[10px] text-gray-500 font-medium pt-2 border-t mt-2">
                  ℹ️ Currently active at slot <b>{currentSwapSlotLabel}</b>
                </div>
              )}
            </div>
          </div>

          {/* Bench List */}
          <div ref={benchRef}>
            <h3 className="text-sm font-black text-gray-900 mb-3 uppercase tracking-wide">
              Assign from Bench
            </h3>
            
            {bench.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-8 bg-white rounded-xl border border-dashed border-gray-200">
                Bench is empty.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {bench.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSub(p.id)}
                    className="group flex items-center justify-between w-full p-3 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-blue-300 hover:shadow-md transition-all active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-black text-gray-700 group-hover:bg-blue-100 group-hover:text-blue-700 transition-colors">
                        {p.jerseyNumber}
                      </div>
                      <div className="flex flex-col items-start">
                        <span className="text-sm font-bold text-gray-900">{p.name}</span>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                      {p.position}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Debug/Swap Mode (Hidden unless active logic triggers it) */}
          {swapMode && (
            <div className="mt-6 border-t pt-4">
              <h3 className="text-sm font-bold text-gray-900 mb-2">Debug: Manual Swap</h3>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <button 
                    key={n} 
                    onClick={() => handleSwapPick(n as RotationSlot)}
                    className="p-2 bg-gray-200 rounded text-xs font-bold hover:bg-gray-300"
                  >
                    Slot {slotLabel[n as RotationSlot]}
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}