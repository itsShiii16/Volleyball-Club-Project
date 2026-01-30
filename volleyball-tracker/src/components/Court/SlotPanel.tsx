"use client";

import { useMemo, useState } from "react";
import { useMatchStore } from "@/store/matchStore";
import { slotLabel } from "@/lib/volleyball";
import type { RotationSlot, TeamId } from "@/lib/volleyball";

const SWAP_SLOTS: RotationSlot[] = [4, 3, 2, 5, 6, 1];

export default function SlotPanel() {
  const selected = useMatchStore((s) => s.selected);
  const clearSelection = useMatchStore((s) => s.clearSelection);

  const players = useMatchStore((s) => s.players);
  const assign = useMatchStore((s) => s.assignPlayerToSlot);
  const clearSlot = useMatchStore((s) => s.clearSlot);
  const getOnCourtPlayerIds = useMatchStore((s) => s.getOnCourtPlayerIds);

  const courtA = useMatchStore((s) => s.courtA);
  const courtB = useMatchStore((s) => s.courtB);

  const [swapMode, setSwapMode] = useState(false);
  const [swapPick, setSwapPick] = useState<{ teamId: TeamId; slot: RotationSlot } | null>(null);

  // Hard guard: once selected is null, render nothing
  if (!selected) return null;

  const teamId = selected.teamId;
  const slot = selected.slot;

  const courtSlots = teamId === "A" ? courtA : courtB;
  const playerId = courtSlots[slot];
  const player = players.find((p) => p.id === playerId) || null;

  const titleTeam = teamId === "A" ? "Team A" : "Team B";

  const { onCourt, bench } = useMemo(() => {
    const onCourtIds = new Set(getOnCourtPlayerIds(teamId));
    const roster = players.filter((p) => p.teamId === teamId);

    const onCourt = roster
      .filter((p) => onCourtIds.has(p.id))
      .sort((a, b) => a.jerseyNumber - b.jerseyNumber);

    const bench = roster
      .filter((p) => !onCourtIds.has(p.id))
      .sort((a, b) => a.jerseyNumber - b.jerseyNumber);

    return { onCourt, bench };
  }, [players, teamId, getOnCourtPlayerIds]);

  function closePanel() {
    clearSelection();
    setSwapMode(false);
    setSwapPick(null);
  }

  function handleAssign(playerId: string) {
    assign(teamId, slot, playerId);
    closePanel();
  }

  function handleSwapPick(picked: RotationSlot) {
    if (!swapPick) {
      setSwapPick({ teamId, slot: picked });
      return;
    }

    // swap within same team
    const a = swapPick.slot;
    const b = picked;

    const currentCourt = teamId === "A" ? { ...courtA } : { ...courtB };

    const temp = currentCourt[a];
    currentCourt[a] = currentCourt[b];
    currentCourt[b] = temp;

    const apply = (s: RotationSlot, pid: string | null) => {
      if (pid) assign(teamId, s, pid);
      else clearSlot(teamId, s);
    };

    apply(a, currentCourt[a] ?? null);
    apply(b, currentCourt[b] ?? null);

    setSwapPick(null);
    setSwapMode(false);
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* backdrop */}
      <button className="absolute inset-0 bg-black/30" onClick={closePanel} aria-label="Close" />

      {/* panel */}
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl p-5 flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-gray-500">
              {titleTeam} • Slot {slotLabel[slot]}
            </div>
            <h2 className="text-xl font-bold text-gray-900 mt-1">
              {player ? `#${player.jerseyNumber} ${player.name}` : "Empty Slot"}
            </h2>
            {player && (
              <div className="text-sm text-gray-600 mt-1">
                Position: <b>{player.position}</b>
              </div>
            )}
          </div>

          <button
            onClick={closePanel}
            className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-semibold"
          >
            Close
          </button>
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => {
              clearSlot(teamId, slot);
              closePanel();
            }}
            className="px-4 py-2 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 text-sm font-semibold"
          >
            Clear slot
          </button>

          <button
            onClick={() => {
              setSwapMode((v) => !v);
              setSwapPick(null);
            }}
            className={[
              "px-4 py-2 rounded-lg text-sm font-semibold",
              swapMode ? "bg-blue-600 text-white" : "bg-white border shadow hover:shadow-md",
            ].join(" ")}
          >
            {swapMode ? "Swap: Select slot…" : "Swap two slots"}
          </button>
        </div>

        {/* Swap UI */}
        {swapMode && (
          <div className="mt-4 rounded-xl border p-3 bg-blue-50/40">
            <div className="text-sm font-bold text-blue-900">Swap Mode</div>
            <div className="text-xs text-blue-800 mt-1">
              Tap any slot below to swap players.{" "}
              {swapPick ? (
                <>
                  First pick: <b>{slotLabel[swapPick.slot]}</b>. Now choose the second slot.
                </>
              ) : (
                <>Choose the first slot.</>
              )}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {SWAP_SLOTS.map((s) => {
                const pid = courtSlots[s];
                const p = players.find((x) => x.id === pid);

                return (
                  <button
                    key={s}
                    onClick={() => handleSwapPick(s)}
                    className={[
                      "rounded-lg border p-2 text-left",
                      swapPick?.slot === s ? "border-blue-600 bg-white" : "bg-white hover:bg-gray-50",
                    ].join(" ")}
                  >
                    <div className="text-[11px] font-bold text-gray-500">{slotLabel[s]}</div>
                    <div className="text-xs font-semibold text-gray-900 truncate">
                      {p ? `#${p.jerseyNumber} ${p.name}` : "Empty"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Bench + On-court */}
        <div className="mt-5 border-t pt-4 overflow-auto">
          <div className="text-sm font-bold text-gray-900">On-court</div>
          <div className="mt-2 grid gap-2">
            {onCourt.length === 0 ? (
              <div className="text-xs text-gray-500">No players on court yet.</div>
            ) : (
              onCourt.map((p) => (
                <div key={p.id} className="w-full rounded-xl border border-gray-200 p-3 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-gray-900">
                      #{p.jerseyNumber} {p.name}
                    </div>
                    <div className="text-xs font-bold text-gray-600">{p.position}</div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Already on court</div>
                </div>
              ))
            )}
          </div>

          <div className="mt-5">
            <div className="text-sm font-bold text-gray-900">Bench</div>
            <div className="text-xs text-gray-500 mt-1">
              Tap a bench player to assign/substitute into this slot.
            </div>

            <div className="mt-2 grid gap-2">
              {bench.length === 0 ? (
                <div className="text-xs text-gray-500">No bench players available.</div>
              ) : (
                bench.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleAssign(p.id)}
                    className="w-full text-left rounded-xl border border-gray-200 p-3 bg-white hover:bg-gray-50 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-gray-900">
                        #{p.jerseyNumber} {p.name}
                      </div>
                      <div className="text-xs font-bold text-gray-600">{p.position}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="h-6" />
        </div>
      </div>
    </div>
  );
}
