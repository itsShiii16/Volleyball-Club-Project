"use client";

import { useMemo } from "react";
import { useMatchStore } from "@/store/matchStore";
import type { Skill, Outcome } from "@/lib/volleyball";
import { slotLabel } from "@/lib/volleyball";

type Btn = { skill: Skill; outcome: Outcome; label: string };

function buttonsForPosition(pos: string): Btn[] {
  // Wing spiker / Middle blocker
  if (pos === "WS" || pos === "MB") {
    return [
      { skill: "RECEIVE", outcome: "PERFECT", label: "Receive • Perfect" },
      { skill: "DIG", outcome: "SUCCESS", label: "Dig • Success" },
      { skill: "RECEIVE", outcome: "ERROR", label: "Receive • Error" },

      { skill: "BLOCK", outcome: "SUCCESS", label: "Block • Kill block" },
      { skill: "BLOCK", outcome: "ERROR", label: "Block • Error" },

      { skill: "SPIKE", outcome: "SUCCESS", label: "Spike • Kill" },
      { skill: "SPIKE", outcome: "ERROR", label: "Spike • Error" },

      { skill: "SERVE", outcome: "SUCCESS", label: "Serve • Ace" },
      { skill: "SERVE", outcome: "ERROR", label: "Serve • Error" },
    ];
  }

  // Setter
  if (pos === "S") {
    return [
      { skill: "SET", outcome: "PERFECT", label: "Set • Perfect" },
      { skill: "DIG", outcome: "SUCCESS", label: "Dig • Success" },
      { skill: "RECEIVE", outcome: "ERROR", label: "Receive • Error" },

      { skill: "BLOCK", outcome: "SUCCESS", label: "Block • Kill block" },
      { skill: "BLOCK", outcome: "ERROR", label: "Block • Error" },

      { skill: "SPIKE", outcome: "SUCCESS", label: "Spike • Kill" },
      { skill: "SPIKE", outcome: "ERROR", label: "Spike • Error" },

      { skill: "SERVE", outcome: "SUCCESS", label: "Serve • Ace" },
      { skill: "SERVE", outcome: "ERROR", label: "Serve • Error" },
    ];
  }

  // Libero
  return [
    { skill: "RECEIVE", outcome: "PERFECT", label: "Receive • Perfect" },
    { skill: "DIG", outcome: "SUCCESS", label: "Dig • Success" },
    { skill: "RECEIVE", outcome: "ERROR", label: "Receive • Error" },
  ];
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

    const btns = buttonsForPosition(player.position);

    const playerEvents = events.filter((e) => e.playerId === player.id);
    return { teamId, slot, player, btns, playerEvents };
  }, [active, players, courtA, courtB, events]);

  if (!active) return null;
  if (!info) {
    // Selected slot has no player anymore
    return (
      <div className="fixed inset-0 z-50">
        <button className="absolute inset-0 bg-black/30" onClick={close} aria-label="Close" />
        <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl p-5">
          <div className="flex items-center justify-between">
            <div className="font-bold">Scoresheet</div>
            <button onClick={close} className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-semibold">
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
      {/* backdrop */}
      <button className="absolute inset-0 bg-black/30" onClick={close} aria-label="Close" />

      {/* panel */}
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl p-5 flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-gray-500">
              {info.teamId === "A" ? "Team A" : "Team B"} • Slot {slotLabel[info.slot]}
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

        {/* Buttons */}
        <div className="mt-5 grid grid-cols-1 gap-2">
          {info.btns.map((b, idx) => (
            <button
              key={idx}
              onClick={() => logEvent({ teamId: info.teamId, slot: info.slot, skill: b.skill, outcome: b.outcome })}
              className="w-full rounded-xl border border-gray-200 p-3 text-left bg-white hover:bg-gray-50 transition"
            >
              <div className="font-semibold text-gray-900">{b.label}</div>
            </button>
          ))}
        </div>

        {/* Recent log */}
        <div className="mt-6 border-t pt-4 overflow-auto">
          <div className="text-sm font-bold text-gray-900">Recent (this player)</div>
          <div className="mt-2 grid gap-2">
            {info.playerEvents.length === 0 ? (
              <div className="text-xs text-gray-500">No events yet.</div>
            ) : (
              info.playerEvents.slice(0, 12).map((e) => (
                <div key={e.id} className="rounded-lg bg-gray-50 border border-gray-200 p-2 text-xs">
                  <div className="font-semibold text-gray-800">
                    {e.skill} • {e.outcome}
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
