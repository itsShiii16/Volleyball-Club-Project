"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMatchStore } from "@/store/matchStore";
import { slotLabel } from "@/lib/volleyball";
import type { RotationSlot, TeamId } from "@/lib/volleyball";

type SelectedMode = "default" | "bench";

export default function SlotPanel() {
  const selected = useMatchStore((s) => s.selected);
  const clearSelection = useMatchStore((s) => s.clearSelection);

  const players = useMatchStore((s) => s.players);
  const assign = useMatchStore((s) => s.assignPlayerToSlot);
  const substituteInSlot = useMatchStore((s) => s.substituteInSlot);
  const clearSlot = useMatchStore((s) => s.clearSlot);
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
      isAutoLiberoOnThisSlot && swap.replacedMbId
        ? roster.find((p) => p.id === swap.replacedMbId) ?? null
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
    onCourt,
    bench,
    cfg,
    swap,
    libero,
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

  const liberos = roster.filter((p) => p.position === "L");
  const mbs = roster.filter((p) => p.position === "MB");

  function toggleMbId(mbId: string) {
    const current = Array.isArray(cfg.mbIds) ? [...cfg.mbIds] : [];
    const exists = current.includes(mbId);

    let next = exists
      ? current.filter((id) => id !== mbId)
      : [...current, mbId];

    next = Array.from(new Set(next)).slice(0, 2);

    setLiberoConfig(teamId, { mbIds: next });
  }

  const selectedMbPlayers = (cfg.mbIds ?? [])
    .map((id) => roster.find((p) => p.id === id))
    .filter(Boolean);

  const currentSwapSlotLabel =
    swap.active && swap.slot ? slotLabel[swap.slot] : null;

  return (
    <div className="fixed inset-0 z-50">
      <button className="absolute inset-0 bg-black/30" onClick={closeAll} />

      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl p-5 flex flex-col">
        <div className="flex justify-between">
          <div>
            <div className="text-xs font-semibold text-black/60">
              {titleTeam} • Slot <b>{slotLabel[slot]}</b>
            </div>
            <h2 className="text-xl font-extrabold">
              {player ? `#${player.jerseyNumber} ${player.name}` : "Empty Slot"}
            </h2>
          </div>
          <button onClick={closeAll}>Close</button>
        </div>

        {isAutoLiberoOnThisSlot && replaced && (
          <div className="mt-2 text-xs bg-teal-50 border p-2 rounded">
            Libero replacing #{replaced.jerseyNumber} {replaced.name}
          </div>
        )}

        {/* Libero automation */}
        <div className="mt-4 border rounded p-3">
          <button
            onClick={() => setLiberoConfig(teamId, { enabled: !cfg.enabled })}
          >
            {cfg.enabled ? "Disable" : "Enable"} Libero Auto-Sub
          </button>

          <select
            value={cfg.liberoId ?? ""}
            onChange={(e) =>
              setLiberoConfig(teamId, { liberoId: e.target.value || null })
            }
          >
            <option value="">Select Libero</option>
            {liberos.map((p) => (
              <option key={p.id} value={p.id}>
                #{p.jerseyNumber} {p.name}
              </option>
            ))}
          </select>

          <div className="mt-2">
            {mbs.map((p) => (
              <label key={p.id} className="block">
                <input
                  type="checkbox"
                  checked={cfg.mbIds?.includes(p.id) ?? false}
                  disabled={
                    !(cfg.mbIds?.includes(p.id)) &&
                    (cfg.mbIds?.length ?? 0) >= 2
                  }
                  onChange={() => toggleMbId(p.id)}
                />
                #{p.jerseyNumber} {p.name}
              </label>
            ))}
          </div>

          <div className="text-xs mt-1">
            Selected: {selectedMbPlayers.length}/2
          </div>

          {swap.active && currentSwapSlotLabel && (
            <div className="text-xs mt-1">
              Active at slot {currentSwapSlotLabel}
            </div>
          )}
        </div>

        {/* Bench */}
        <div ref={benchRef} className="mt-4">
          {bench.map((p) => (
            <button key={p.id} onClick={() => handleSub(p.id)}>
              #{p.jerseyNumber} {p.name}
            </button>
          ))}
        </div>

        {swapMode && (
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button key={n} onClick={() => handleSwapPick(n as RotationSlot)}>
                {slotLabel[n as RotationSlot]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
