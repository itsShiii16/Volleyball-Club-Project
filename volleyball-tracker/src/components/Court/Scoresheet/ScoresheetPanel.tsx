"use client";

import { useMemo } from "react";
import { useMatchStore } from "@/store/matchStore";
import type { Skill, Outcome } from "@/lib/volleyball";
import { slotLabel } from "@/lib/volleyball";

type Btn = { skill: Skill; outcome: Outcome; label: string };

const isFrontRowSlot = (slot: number) => slot === 2 || slot === 3 || slot === 4;

function normPos(pos: string) {
  return String(pos || "").trim().toUpperCase();
}

function isLiberoPosition(pos: string) {
  const p = normPos(pos);
  return p === "L" || p === "LIBERO";
}

function isSetterPosition(pos: string) {
  const p = normPos(pos);
  return p === "S" || p === "SETTER";
}

function isMiddlePosition(pos: string) {
  const p = normPos(pos);
  return p === "MB" || p === "MIDDLE" || p === "MIDDLE_BLOCKER";
}

function isWingPosition(pos: string) {
  const p = normPos(pos);
  return (
    p === "OH" ||
    p === "OPP" ||
    p === "WS" || // legacy
    p === "OUTSIDE" ||
    p === "OUTSIDE_HITTER" ||
    p === "OPPOSITE" ||
    p === "RIGHT_SIDE" ||
    p === "RS"
  );
}

/**
 * Buttons are aligned with your patched volleyball.ts outcomes:
 * - Point wins: ACE / KILL / BLOCK_POINT
 * - Errors: ERROR (or FAULT/OUT/NET if you later add)
 * - "PERFECT" kept for receive/set quality
 */
function buttonsForContext(
  pos: string,
  opts: { frontRow: boolean; libero: boolean }
): Btn[] {
  const p = normPos(pos);

  // Defense / passing
  const defense: Btn[] = [
    { skill: "RECEIVE", outcome: "PERFECT", label: "Receive • Perfect" },
    { skill: "RECEIVE", outcome: "SUCCESS", label: "Receive • Success" },
    { skill: "RECEIVE", outcome: "ERROR", label: "Receive • Error" },

    { skill: "DIG", outcome: "SUCCESS", label: "Dig • Success" },
    { skill: "DIG", outcome: "ERROR", label: "Dig • Error" },
  ];

  // Setting (for setters, but also optionally for others)
  const setting: Btn[] = [
    { skill: "SET", outcome: "PERFECT", label: "Set • Perfect" },
    { skill: "SET", outcome: "SUCCESS", label: "Set • Success" },
    { skill: "SET", outcome: "ERROR", label: "Set • Error" },
  ];

  // Attacking / serving (point attribution comes from store’s logic)
  const attackServe: Btn[] = [
    { skill: "SPIKE", outcome: "KILL", label: "Attack • Kill" },
    { skill: "SPIKE", outcome: "ERROR", label: "Attack • Error" },

    { skill: "SERVE", outcome: "ACE", label: "Serve • Ace" },
    { skill: "SERVE", outcome: "ERROR", label: "Serve • Error" },
  ];

  // Blocking (front-row only — store also blocks back-row block attempts)
  const block: Btn[] = [
    { skill: "BLOCK", outcome: "BLOCK_POINT", label: "Block • Point" },
    { skill: "BLOCK", outcome: "ERROR", label: "Block • Error" },
  ];

  // Libero: defense + (optional) set
  if (opts.libero) {
    // many liberos set in-system; keep it available
    return [...defense, ...setting];
  }

  // Setter: emphasize sets, but still allow attack/serve and block when front
  if (isSetterPosition(p)) {
    return [
      ...setting,
      ...defense,
      ...(opts.frontRow ? block : []),
      ...attackServe,
    ];
  }

  // Middle: emphasize block + quick attack, still allow serve/defense
  if (isMiddlePosition(p)) {
    return [
      ...defense,
      ...(opts.frontRow ? block : []),
      ...attackServe,
    ];
  }

  // Wings (OH/OPP/legacy WS): defense + attack + serve + block when front
  if (isWingPosition(p)) {
    return [
      ...defense,
      ...(opts.frontRow ? block : []),
      ...attackServe,
    ];
  }

  // Default: safe set
  return [...defense, ...setting, ...(opts.frontRow ? block : []), ...attackServe];
}

export default function ScoresheetPanel() {
  const active = useMatchStore((s) => s.activeScoresheet);
  const close = useMatchStore((s) => s.closeScoresheet);
  const logEvent = useMatchStore((s) => s.logEvent);
  const undo = useMatchStore((s) => s.undoLastEvent);

  const players = useMatchStore((s) => s.players);
  const courtA = useMatchStore((s) => s.courtA);
  const courtB = useMatchStore((s) => s.courtB);
  const events = useMatchStore((s) => s.events);

  const info = useMemo(() => {
    if (!active) return null;

    const { teamId, slot } = active;
    const court = teamId === "A" ? courtA : courtB;
    const playerId = court[slot];
    const player = players.find((p) => p.id === playerId) || null;

    if (!player) return null;

    const frontRow = isFrontRowSlot(slot);
    const libero = isLiberoPosition(player.position);

    const btns = buttonsForContext(player.position, { frontRow, libero });
    const playerEvents = events.filter((e) => e.playerId === player.id);

    return { teamId, slot, player, btns, playerEvents, frontRow, libero };
  }, [active, players, courtA, courtB, events]);

  if (!active) return null;

  if (!info) {
    return (
      <div className="fixed inset-0 z-50">
        <button
          className="absolute inset-0 bg-black/30"
          onClick={close}
          aria-label="Close"
        />
        <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl p-5">
          <div className="flex items-center justify-between">
            <div className="font-bold">Scoresheet</div>
            <button
              onClick={close}
              className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-semibold"
            >
              Close
            </button>
          </div>
          <div className="mt-4 text-sm text-gray-600">No player in this slot.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        className="absolute inset-0 bg-black/30"
        onClick={close}
        aria-label="Close"
      />

      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl p-5 flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-gray-500">
              {info.teamId === "A" ? "Team A" : "Team B"} • Slot {slotLabel[info.slot]}
              {" • "}
              <span className="font-bold">
                {info.frontRow ? "Front row" : "Back row"}
              </span>
              {info.libero ? <span className="font-bold"> • Libero</span> : null}
            </div>

            <h2 className="text-xl font-bold text-gray-900 mt-1">
              #{info.player.jerseyNumber} {info.player.name}
            </h2>

            <div className="text-sm text-gray-600 mt-1">
              Position: <b>{info.player.position}</b>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={undo}
              className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-semibold"
            >
              Undo
            </button>
            <button
              onClick={close}
              className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-semibold"
            >
              Close
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2">
          {info.btns.map((b, idx) => (
            <button
              key={idx}
              onClick={() =>
                logEvent({
                  teamId: info.teamId,
                  slot: info.slot,
                  skill: b.skill,
                  outcome: b.outcome,
                })
              }
              className="w-full rounded-xl border border-gray-200 p-3 text-left bg-white hover:bg-gray-50 transition"
            >
              <div className="font-semibold text-gray-900">{b.label}</div>
              <div className="text-[11px] text-gray-500 mt-1">
                Logs: {b.skill} • {b.outcome}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-6 border-t pt-4 overflow-auto">
          <div className="text-sm font-bold text-gray-900">Recent (this player)</div>
          <div className="mt-2 grid gap-2">
            {info.playerEvents.length === 0 ? (
              <div className="text-xs text-gray-500">No events yet.</div>
            ) : (
              info.playerEvents.slice(0, 12).map((e) => (
                <div
                  key={e.id}
                  className="rounded-lg bg-gray-50 border border-gray-200 p-2 text-xs"
                >
                  <div className="font-semibold text-gray-800">
                    {String(e.skill)} • {String(e.outcome)}
                    {e.pointWinner ? (
                      <span className="ml-2 font-black text-gray-600">
                        • Point: {e.pointWinner}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
