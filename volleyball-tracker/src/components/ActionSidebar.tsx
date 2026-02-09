"use client";

import { useMemo } from "react";
import { useMatchStore } from "@/store/matchStore";
import { slotLabel, type Skill, type Outcome } from "@/lib/volleyball";

type Btn = { skill: Skill; outcome: Outcome; label: string; desc: string };

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
    p === "WS" ||
    p === "OUTSIDE" ||
    p === "OUTSIDE_HITTER" ||
    p === "OPPOSITE" ||
    p === "RIGHT_SIDE" ||
    p === "RS"
  );
}

/**
 * Generate buttons based on player position AND game context (serving vs receiving).
 */
function buttonsForContext(
  pos: string,
  opts: { 
    frontRow: boolean; 
    libero: boolean; 
    isServingTeam: boolean; 
  }
): Btn[] {
  const p = normPos(pos);

  // 1. Reception (Only for receiving team)
  const receive: Btn[] = opts.isServingTeam ? [] : [
    { skill: "RECEIVE", outcome: "PERFECT", label: "Receive • Perfect", desc: "RECEIVE • PERFECT" },
    { skill: "RECEIVE", outcome: "SUCCESS", label: "Receive • Success", desc: "RECEIVE • SUCCESS" },
    { skill: "RECEIVE", outcome: "ERROR", label: "Receive • Error", desc: "RECEIVE • ERROR" },
  ];

  // 2. Digs (Available to everyone)
  const dig: Btn[] = [
    { skill: "DIG", outcome: "SUCCESS", label: "Dig • Success", desc: "DIG • SUCCESS" },
    { skill: "DIG", outcome: "ERROR", label: "Dig • Error", desc: "DIG • ERROR" },
  ];

  // 3. Setting
  const setBtns: Btn[] = [
    { skill: "SET", outcome: "PERFECT", label: "Set • Perfect", desc: "SET • PERFECT" },
    { skill: "SET", outcome: "SUCCESS", label: "Set • Success", desc: "SET • SUCCESS" },
    { skill: "SET", outcome: "ERROR", label: "Set • Error", desc: "SET • ERROR" },
  ];

  // 4. Blocking (Front row only)
  const block: Btn[] = [
    { skill: "BLOCK", outcome: "BLOCK_POINT", label: "Block • Point", desc: "BLOCK • BLOCK_POINT" },
    { skill: "BLOCK", outcome: "ERROR", label: "Block • Error", desc: "BLOCK • ERROR" },
  ];
  
  // 5. Attacking
  const attack: Btn[] = [
    { skill: "SPIKE", outcome: "KILL", label: "Attack • Kill", desc: "SPIKE • KILL" },
    { skill: "SPIKE", outcome: "ERROR", label: "Attack • Error", desc: "SPIKE • ERROR" },
  ];

  // 6. Serving (Only for serving team)
  const serve: Btn[] = opts.isServingTeam ? [
    { skill: "SERVE", outcome: "ACE", label: "Serve • Ace", desc: "SERVE • ACE" },
    { skill: "SERVE", outcome: "ERROR", label: "Serve • Error", desc: "SERVE • ERROR" },
  ] : [];

  // --- ASSEMBLY ---

  if (opts.libero) {
    return [...receive, ...dig, ...setBtns];
  }

  if (isSetterPosition(p)) {
    return [
      ...serve,
      ...setBtns,
      ...receive,
      ...dig,
      ...(opts.frontRow ? block : []),
      ...attack,
    ];
  }

  if (isMiddlePosition(p) || isWingPosition(p)) {
    return [
      ...serve,
      ...receive,
      ...dig,
      ...(opts.frontRow ? block : []),
      ...attack,
    ];
  }

  // Default
  return [
    ...serve,
    ...receive,
    ...dig,
    ...setBtns,
    ...(opts.frontRow ? block : []),
    ...attack
  ];
}

export default function ActionSidebar() {
  const active = useMatchStore((s) => s.activeScoresheet);
  const closeScoresheet = useMatchStore((s) => s.closeScoresheet);
  const selectSlot = useMatchStore((s) => s.selectSlot);
  const logEvent = useMatchStore((s) => s.logEvent);
  
  const players = useMatchStore((s) => s.players);
  const courtA = useMatchStore((s) => s.courtA);
  const courtB = useMatchStore((s) => s.courtB);
  const events = useMatchStore((s) => s.events);
  const servingTeam = useMatchStore((s) => s.servingTeam);

  const info = useMemo(() => {
    if (!active) return null;
    const { teamId, slot } = active;
    const court = teamId === "A" ? courtA : courtB;
    const playerId = court[slot];
    const player = players.find((p) => p.id === playerId) || null;
    if (!player) return null;

    const frontRow = isFrontRowSlot(slot);
    const libero = isLiberoPosition(player.position);
    const isServingTeam = (teamId === servingTeam);

    const btns = buttonsForContext(player.position, { frontRow, libero, isServingTeam });
    const recent = events.filter((e) => e.playerId === player.id).slice(0, 5);

    return { teamId, slot, player, btns, recent, frontRow };
  }, [active, players, courtA, courtB, events, servingTeam]);

  function handleOpenSettings() {
    if (!active) return;
    closeScoresheet();
    selectSlot(active.teamId, active.slot, "bench");
  }

  if (!info) {
    return (
      <aside className="flex h-full w-full flex-col items-center justify-center border-l border-gray-200 bg-white p-6 text-center text-gray-400">
        <p>Select a player on the court to log actions.</p>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-full flex-col border-l border-gray-200 bg-white">
      {/* Header */}
      <div className="border-b border-gray-100 p-4 bg-white z-10">
        <div className="flex justify-between items-start">
            <div>
                <div className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">
                  Team {info.teamId} • Slot {slotLabel[info.slot]} • {info.frontRow ? "Front" : "Back"}
                </div>
                {/* ✅ Balanced Name Size: text-2xl */}
                <h2 className="text-2xl font-black text-gray-900 leading-none mt-1 mb-1">
                  #{info.player.jerseyNumber} {info.player.name.split(" ")[0]}
                </h2>
                <div className="text-xs font-bold text-gray-500">Position: {info.player.position}</div>
            </div>
            
            <button 
              onClick={handleOpenSettings}
              className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-200 transition"
              title="Substitute or Configure Libero"
            >
              ⚙️ Sub
            </button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50">
        {/* ✅ Tighter Gap: gap-2 */}
        <div className="flex flex-col gap-2">
          {info.btns.length === 0 ? (
             <div className="text-base font-medium text-gray-400 text-center py-10">
               No actions available in this rotation.
             </div>
          ) : (
            info.btns.map((b, i) => (
              <button
                key={i}
                onClick={() =>
                  logEvent({
                    teamId: info.teamId,
                    slot: info.slot,
                    skill: b.skill,
                    outcome: b.outcome,
                  })
                }
                // ✅ Balanced Buttons: p-3, text-base
                className="group flex w-full flex-col items-start rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-all hover:border-blue-400 hover:shadow-md active:scale-[0.98] active:bg-blue-50"
              >
                <div className="flex w-full justify-between items-center">
                    <span className="font-extrabold text-base text-gray-800 group-hover:text-blue-700">
                      {b.label}
                    </span>
                </div>
                <span className="text-[10px] font-semibold text-gray-400 mt-0.5">
                  Logs: {b.desc}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Recent Log */}
      <div className="border-t bg-white p-4 pb-8">
        <div className="flex justify-between items-center mb-2">
            <h3 className="text-[10px] font-bold uppercase text-gray-400 tracking-widest">
              History
            </h3>
        </div>
        
        <div className="flex flex-col gap-1.5">
          {info.recent.length === 0 ? (
            <div className="text-xs text-gray-300 italic">No events yet.</div>
          ) : (
            info.recent.map((e) => (
              <div key={e.id} className="text-xs font-bold text-gray-600 flex items-center gap-2">
                 <div className="h-1.5 w-1.5 rounded-full bg-gray-300" />
                 <span>{e.skill}</span>
                 <span className="text-gray-300">/</span>
                 <span className={e.pointWinner ? "text-green-600" : ""}>{e.outcome}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}