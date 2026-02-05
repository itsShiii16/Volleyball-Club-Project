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

  // ✅ Libero automation config/state
  const liberoConfigA = useMatchStore((s) => s.liberoConfigA);
  const liberoConfigB = useMatchStore((s) => s.liberoConfigB);
  const setLiberoConfig = useMatchStore((s) => s.setLiberoConfig);

  const liberoSwapA = useMatchStore((s) => s.liberoSwapA);
  const liberoSwapB = useMatchStore((s) => s.liberoSwapB);

  const [swapMode, setSwapMode] = useState(false);
  const [swapPick, setSwapPick] = useState<{ teamId: TeamId; slot: RotationSlot } | null>(null);

  const benchRef = useRef<HTMLDivElement | null>(null);

  const info = useMemo(() => {
    if (!selected) return null;

    const { teamId, slot } = selected;
    const court = teamId === "A" ? courtA : courtB;

    const playerId = court[slot];
    const player = players.find((p) => p.id === playerId) || null;

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
    const mb =
      cfg.mbId ? roster.find((p) => p.id === cfg.mbId) ?? null : null;

    // If swap is active: show who is currently being replaced on THIS slot
    const isAutoLiberoOnThisSlot =
      !!playerId && swap.active && swap.slot === slot && swap.liberoId === playerId;

    const replaced =
      isAutoLiberoOnThisSlot && swap.mbId
        ? roster.find((p) => p.id === swap.mbId) ?? null
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
      mb,
      isAutoLiberoOnThisSlot,
      replaced,
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

  // If opened via SUB, jump directly to Bench
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

  // ✅ Hard guard
  if (info === null) return null;

  const {
    teamId,
    slot,
    player,
    onCourt,
    bench,
    cfg,
    swap,
    libero,
    mb,
    isAutoLiberoOnThisSlot,
    replaced,
  } = info;

  const titleTeam = teamId === "A" ? "Team A" : "Team B";
  const courtSlots = teamId === "A" ? courtA : courtB;

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
      setSwapPick({ teamId, slot: nextSlot });
      return;
    }

    const court = teamId === "A" ? { ...courtA } : { ...courtB };
    const a = swapPick.slot;
    const b = nextSlot;

    const temp = court[a];
    court[a] = court[b];
    court[b] = temp;

    const apply = (s: RotationSlot, pid: string | null) => {
      if (pid) assign(teamId, s, pid);
      else clearSlot(teamId, s);
    };

    apply(a, court[a] ?? null);
    apply(b, court[b] ?? null);

    setSwapPick(null);
    setSwapMode(false);
  }

  // ✅ update libero config helpers
  const roster = players.filter((p) => p.teamId === teamId);
  const liberos = roster.filter((p) => String(p.position).toUpperCase() === "L");
  const mbs = roster.filter((p) => String(p.position).toUpperCase() === "MB");

  const currentSwapSlotLabel = swap.active && swap.slot ? slotLabel[swap.slot] : null;

  return (
    <div className="fixed inset-0 z-50">
      {/* backdrop */}
      <button className="absolute inset-0 bg-black/30" onClick={closeAll} aria-label="Close" />

      {/* panel */}
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl p-5 flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-black/60">
              {titleTeam} • Slot <span className="font-extrabold text-black">{slotLabel[slot]}</span>
            </div>

            <h2 className="text-xl font-extrabold text-black mt-1">
              {player ? `#${player.jerseyNumber} ${player.name}` : "Empty Slot"}
            </h2>

            {player && (
              <div className="text-sm text-black/70 mt-1">
                Position: <b className="text-black">{player.position}</b>
              </div>
            )}

            {/* ✅ show auto-sub info for this slot */}
            {isAutoLiberoOnThisSlot && replaced && (
              <div className="mt-2 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">
                Libero auto-sub is active here.
                <div className="mt-1 text-teal-800">
                  Replacing: <b>#{replaced.jerseyNumber} {replaced.name}</b> ({replaced.position})
                </div>
              </div>
            )}
          </div>

          <button
            onClick={closeAll}
            className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-semibold text-black"
          >
            Close
          </button>
        </div>

        {/* ✅ Libero Automation (Phase 2 #4) */}
        <div className="mt-4 rounded-xl border border-gray-200 p-3 bg-gray-50">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-extrabold text-black">Libero auto-sub</div>
              <div className="text-xs text-black/60">
                Automatically swaps Libero in for a chosen MB when that MB reaches the back row.
              </div>
            </div>

            <button
              type="button"
              onClick={() => setLiberoConfig(teamId, { enabled: !cfg.enabled })}
              className={[
                "px-3 py-2 rounded-lg text-xs font-extrabold shadow",
                cfg.enabled ? "bg-teal-600 text-white" : "bg-white border text-black",
              ].join(" ")}
            >
              {cfg.enabled ? "ENABLED" : "DISABLED"}
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <div className="text-[11px] font-bold text-black/60 mb-1">Libero</div>
              <select
                value={cfg.liberoId ?? ""}
                onChange={(e) => setLiberoConfig(teamId, { liberoId: e.target.value || null })}
                className="w-full border rounded-lg px-3 py-2 bg-white text-black text-sm"
              >
                <option value="">Select Libero…</option>
                {liberos.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.jerseyNumber} {p.name}
                  </option>
                ))}
              </select>
              {cfg.liberoId && !libero && (
                <div className="mt-1 text-[11px] text-red-600 font-semibold">
                  Selected Libero not found.
                </div>
              )}
            </div>

            <div>
              <div className="text-[11px] font-bold text-black/60 mb-1">Middle Blocker to replace</div>
              <select
                value={cfg.mbId ?? ""}
                onChange={(e) => setLiberoConfig(teamId, { mbId: e.target.value || null })}
                className="w-full border rounded-lg px-3 py-2 bg-white text-black text-sm"
              >
                <option value="">Select MB…</option>
                {mbs.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.jerseyNumber} {p.name}
                  </option>
                ))}
              </select>
              {cfg.mbId && !mb && (
                <div className="mt-1 text-[11px] text-red-600 font-semibold">
                  Selected MB not found.
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-1 text-xs">
            <div className="text-black/70">
              Status:{" "}
              <b className={swap.active ? "text-teal-700" : "text-black"}>
                {swap.active ? "ACTIVE" : "INACTIVE"}
              </b>
              {swap.active && currentSwapSlotLabel ? (
                <>
                  {" "}
                  • Swap slot: <b>{currentSwapSlotLabel}</b>
                </>
              ) : null}
            </div>

            {cfg.enabled && (!cfg.liberoId || !cfg.mbId) && (
              <div className="text-amber-700 font-semibold">
                Pick both a Libero and an MB to enable the automation.
              </div>
            )}

            {cfg.enabled && cfg.liberoId && cfg.mbId && !swap.active && (
              <div className="text-black/60">
                Waiting for the chosen MB to rotate into the back row…
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => {
              clearSlot(teamId, slot);
              closeAll();
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
              swapMode ? "bg-blue-600 text-white" : "bg-white border shadow hover:shadow-md text-black",
            ].join(" ")}
          >
            {swapMode ? "Swap: Select slot…" : "Swap two slots"}
          </button>
        </div>

        {/* Swap UI */}
        {swapMode && (
          <div className="mt-4 rounded-xl border p-3 bg-blue-50/40">
            <div className="text-sm font-extrabold text-blue-900">Swap Mode</div>
            <div className="text-xs text-blue-800 mt-1">
              Tap any slot below to swap players.
              {swapPick ? (
                <>
                  {" "}
                  First pick: <b>{slotLabel[swapPick.slot]}</b>. Now choose the second slot.
                </>
              ) : (
                <> Choose the first slot.</>
              )}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {[4, 3, 2, 5, 6, 1].map((n) => {
                const s = n as RotationSlot;
                const pid = courtSlots[s];
                const p = players.find((x) => x.id === pid) || null;

                return (
                  <button
                    key={s}
                    onClick={() => handleSwapPick(s)}
                    className={[
                      "rounded-lg border p-2 text-left",
                      swapPick?.slot === s ? "border-blue-600 bg-white" : "bg-white hover:bg-gray-50",
                    ].join(" ")}
                  >
                    <div className="text-[11px] font-bold text-black/60">{slotLabel[s]}</div>
                    <div className="text-xs font-semibold text-black truncate">
                      {p ? `#${p.jerseyNumber} ${p.name}` : "Empty"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* CONTENT */}
        <div className="mt-5 border-t pt-4 overflow-auto">
          <div ref={benchRef} />

          <div className="text-sm font-extrabold text-black">Bench</div>
          <div className="text-xs text-black/60 mt-1">
            Tap a bench player to substitute into <b className="text-black">{slotLabel[slot]}</b>.
          </div>

          <div className="mt-3 grid gap-2">
            {bench.length === 0 ? (
              <div className="text-xs text-black/60">No bench players available.</div>
            ) : (
              bench.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSub(p.id)}
                  className="w-full text-left rounded-xl border border-gray-200 p-3 bg-white hover:bg-gray-50 transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-black">
                      #{p.jerseyNumber} {p.name}
                    </div>
                    <div className="text-xs font-extrabold text-black/70">{p.position}</div>
                  </div>
                  <div className="text-xs text-black/60 mt-1">Tap to substitute in</div>
                </button>
              ))
            )}
          </div>

          <div className="mt-6">
            <div className="text-sm font-extrabold text-black">On-court</div>
            <div className="mt-2 grid gap-2">
              {onCourt.length === 0 ? (
                <div className="text-xs text-black/60">No players on court yet.</div>
              ) : (
                onCourt.map((p) => (
                  <div key={p.id} className="w-full rounded-xl border border-gray-200 p-3 bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-black">
                        #{p.jerseyNumber} {p.name}
                      </div>
                      <div className="text-xs font-extrabold text-black/70">{p.position}</div>
                    </div>
                  </div>
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
