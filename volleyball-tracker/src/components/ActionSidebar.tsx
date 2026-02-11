"use client";

import { useMemo } from "react";
import { useMatchStore } from "@/store/matchStore";
import { slotLabel, type Skill, type Outcome } from "@/lib/volleyball";

// ... (Keep helper functions like isFrontRowSlot, normPos, buttonsForContext exactly as they were)
// ... (I will re-include the updated component structure below with the bigger styles)

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

function buttonsForContext(
  pos: string,
  opts: { frontRow: boolean; libero: boolean; isServingTeam: boolean; isServingPlayer: boolean; }
): Btn[] {
  const p = normPos(pos);

  // 1. Reception
  const receive: Btn[] = opts.isServingTeam ? [] : [
    { skill: "RECEIVE", outcome: "PERFECT", label: "Reception • Exc", desc: "RECEPTION • EXCELLENT" },
    { skill: "RECEIVE", outcome: "SUCCESS", label: "Reception • Att", desc: "RECEPTION • ATTEMPT" },
    { skill: "RECEIVE", outcome: "ERROR", label: "Reception • Err", desc: "RECEPTION • ERROR" },
  ];

  // 2. Digs
  const dig: Btn[] = [
    { skill: "DIG", outcome: "PERFECT", label: "Dig • Exc", desc: "DIG • EXCELLENT" },
    { skill: "DIG", outcome: "SUCCESS", label: "Dig • Att", desc: "DIG • ATTEMPT" },
    { skill: "DIG", outcome: "ERROR", label: "Dig • Err", desc: "DIG • ERROR" },
  ];

  // 3. Setting
  const setBtns: Btn[] = [
    { skill: "SET", outcome: "PERFECT", label: "Set • Exc", desc: "SET • EXCELLENT" },
    { skill: "SET", outcome: "SUCCESS", label: "Set • Run", desc: "SET • RUNNING" },
    { skill: "SET", outcome: "ERROR", label: "Set • Err", desc: "SET • ERROR" },
  ];

  // 4. Blocking
  const block: Btn[] = [
    { skill: "BLOCK", outcome: "POINT", label: "Block • Kill", desc: "BLOCK • KILL" },
    { skill: "BLOCK", outcome: "ERROR", label: "Block • Err", desc: "BLOCK • ERROR" },
  ];
  
  // 5. Attacking
  const attack: Btn[] = [
    { skill: "SPIKE", outcome: "KILL", label: "Attack • Kill", desc: "ATTACK • KILL" },
    { skill: "SPIKE", outcome: "SUCCESS", label: "Attack • Att", desc: "ATTACK • ATTEMPT" },
    { skill: "SPIKE", outcome: "ERROR", label: "Attack • Err", desc: "ATTACK • ERROR" },
  ];

  // 6. Serving
  const serve: Btn[] = opts.isServingPlayer ? [
    { skill: "SERVE", outcome: "ACE", label: "Serve • Ace", desc: "SERVE • ACE" },
    { skill: "SERVE", outcome: "SUCCESS", label: "Serve • Succ", desc: "SERVE • SUCCESS" },
    { skill: "SERVE", outcome: "ERROR", label: "Serve • Err", desc: "SERVE • ERROR" },
  ] : [];

  if (opts.libero) return [...receive, ...dig, ...setBtns];
  if (isSetterPosition(p)) return [...serve, ...setBtns, ...receive, ...dig, ...(opts.frontRow ? block : []), ...attack];
  if (isMiddlePosition(p)) return [...serve, ...receive, ...dig, ...(opts.frontRow ? block : []), ...attack];

  return [...serve, ...receive, ...dig, ...setBtns, ...(opts.frontRow ? block : []), ...attack];
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
  const leftTeam = useMatchStore((s) => s.leftTeam); 

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
    const servingSlot = teamId === leftTeam ? 1 : 5;
    const isServingPlayer = isServingTeam && slot === servingSlot;

    const btns = buttonsForContext(player.position, { 
      frontRow, libero, isServingTeam, isServingPlayer 
    });
    
    const recent = events.filter((e) => e.playerId === player.id).slice(0, 5);

    return { teamId, slot, player, btns, recent, frontRow };
  }, [active, players, courtA, courtB, events, servingTeam, leftTeam]);

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
      {/* Header - Bigger */}
      <div className="border-b border-gray-100 p-6 bg-white z-10 shrink-0">
        <div className="flex justify-between items-start">
            <div>
                <div className="text-xs font-bold uppercase text-gray-400 tracking-wider">
                  Slot {slotLabel[info.slot]} • {info.frontRow ? "Front" : "Back"}
                </div>
                {/* ✅ HUGE NAME */}
                <h2 className="text-4xl font-black text-gray-900 leading-none mt-2 mb-1">
                  #{info.player.jerseyNumber}
                </h2>
                <div className="text-2xl font-bold text-gray-800 leading-tight">
                   {info.player.name.split(" ")[0]}
                </div>
                <div className="text-sm font-bold text-gray-500 mt-1">{info.player.position}</div>
            </div>
            
            <button 
              onClick={handleOpenSettings}
              className="rounded-xl bg-gray-100 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-200 transition"
            >
              ⚙️
            </button>
        </div>
      </div>

      {/* Action Buttons - Bigger Hit Areas */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50">
        <div className="flex flex-col gap-3">
          {info.btns.length === 0 ? (
             <div className="text-lg font-medium text-gray-400 text-center py-10">
               No actions.
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
                // ✅ BIGGER BUTTONS
                className="group flex w-full items-center justify-between rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-blue-500 hover:shadow-md active:scale-[0.98] active:bg-blue-50"
              >
                <span className="font-black text-lg text-gray-800 group-hover:text-blue-700">
                  {b.label}
                </span>
                <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest group-hover:text-blue-300">
                  LOG
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* History */}
      <div className="border-t bg-white p-4 pb-8 shrink-0">
        <div className="text-[10px] font-bold uppercase text-gray-400 tracking-widest mb-3">
          Recent
        </div>
        <div className="flex flex-col gap-2">
          {info.recent.length === 0 ? (
            <div className="text-sm text-gray-300 italic">No events yet.</div>
          ) : (
            info.recent.map((e) => (
              <div key={e.id} className="text-sm font-bold text-gray-600 flex items-center gap-3">
                 <div className={`h-2 w-2 rounded-full ${e.pointWinner ? "bg-green-500" : "bg-gray-300"}`} />
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