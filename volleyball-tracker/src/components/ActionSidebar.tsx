"use client";

import { useMemo } from "react";
import { useMatchStore } from "@/store/matchStore";
import { slotLabel, type Skill, type Outcome } from "@/lib/volleyball";

type Btn = { skill: Skill; outcome: Outcome; label: string; short: string };

// --- HELPER FUNCTIONS ---

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

// ✅ VISUAL THEME HELPER
function getOutcomeTheme(outcome: string) {
  const u = outcome.toUpperCase();
  // RED: Errors
  if (u.includes("ERROR") || u.includes("FAULT") || u.includes("OUT") || u.includes("NET")) {
    return {
      btn: "bg-red-50 border-red-200 text-red-900 hover:bg-red-100 hover:border-red-300",
      dot: "bg-red-500",
      badge: "bg-red-100 text-red-800 border-red-200"
    };
  }
  // GREEN: Points / Perfect
  if (u.includes("KILL") || u.includes("ACE") || u.includes("POINT") || u.includes("PERFECT") || u.includes("EXCELLENT")) {
    return {
      btn: "bg-emerald-50 border-emerald-200 text-emerald-900 hover:bg-emerald-100 hover:border-emerald-300",
      dot: "bg-emerald-500",
      badge: "bg-emerald-100 text-emerald-800 border-emerald-200"
    };
  }
  // YELLOW: Continuation / Attempts
  return {
    btn: "bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100 hover:border-amber-300",
    dot: "bg-amber-500",
    badge: "bg-amber-100 text-amber-800 border-amber-200"
  };
}

// ✅ BUTTON GENERATOR
function buttonsForContext(
  pos: string,
  opts: { frontRow: boolean; libero: boolean; isServingTeam: boolean; isServingPlayer: boolean; }
): Btn[] {
  const p = normPos(pos);
  const isSetter = isSetterPosition(p);

  // 1. Reception
  const receive: Btn[] = opts.isServingTeam ? [] : [
    { skill: "RECEIVE", outcome: "PERFECT", label: "Excellent", short: "Exc" },
    { skill: "RECEIVE", outcome: "SUCCESS", label: "Attempt", short: "Att" },
    { skill: "RECEIVE", outcome: "ERROR", label: "Error", short: "Err" },
  ];

  // 2. Digs
  const dig: Btn[] = [
    { skill: "DIG", outcome: "PERFECT", label: "Excellent", short: "Exc" },
    { skill: "DIG", outcome: "SUCCESS", label: "Attempt", short: "Att" },
    { skill: "DIG", outcome: "ERROR", label: "Error", short: "Err" },
  ];

  // 3. Setting (VISIBLE ONLY FOR SETTERS)
  const setBtns: Btn[] = isSetter ? [
    { skill: "SET", outcome: "PERFECT", label: "Excellent", short: "Exc" },
    { skill: "SET", outcome: "SUCCESS", label: "Running", short: "Run" },
    { skill: "SET", outcome: "ERROR", label: "Error", short: "Err" },
  ] : [];

  // 4. Blocking
  const block: Btn[] = [
    { skill: "BLOCK", outcome: "POINT", label: "Kill Block", short: "Kill" },
    { skill: "BLOCK", outcome: "ERROR", label: "Error", short: "Err" },
  ];
  
  // 5. Attacking
  const attack: Btn[] = [
    { skill: "SPIKE", outcome: "KILL", label: "Kill", short: "Kill" },
    { skill: "SPIKE", outcome: "SUCCESS", label: "Attempt", short: "Att" },
    { skill: "SPIKE", outcome: "ERROR", label: "Error", short: "Err" },
  ];

  // 6. Serving
  const serve: Btn[] = opts.isServingPlayer ? [
    { skill: "SERVE", outcome: "ACE", label: "Ace", short: "Ace" },
    { skill: "SERVE", outcome: "SUCCESS", label: "In Play", short: "In" },
    { skill: "SERVE", outcome: "ERROR", label: "Error", short: "Err" },
  ] : [];

  // --- ASSEMBLY ---
  if (opts.libero) return [...receive, ...dig, ...setBtns];
  if (isSetter) return [...serve, ...setBtns, ...receive, ...dig, ...(opts.frontRow ? block : []), ...attack];
  if (isMiddlePosition(p)) return [...serve, ...receive, ...dig, ...(opts.frontRow ? block : []), ...attack];

  return [...serve, ...receive, ...dig, ...(opts.frontRow ? block : []), ...attack];
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
  
  const currentScoreA = useMatchStore((s) => s.scoreA);
  const currentScoreB = useMatchStore((s) => s.scoreB);

  // --- DATA PREPARATION ---
  const info = useMemo(() => {
    if (!active) return null;
    const { teamId, slot } = active;
    const court = teamId === "A" ? courtA : courtB;
    const playerId = court[slot];
    const player = players.find((p) => p.id === playerId) || null;
    if (!player) return null;

    const frontRow = isFrontRowSlot(slot);
    const libero = isLiberoPosition(player.position);
    const isSetter = isSetterPosition(player.position); // ✅ Check if player is Setter
    const isServingTeam = (teamId === servingTeam);
    const servingSlot = teamId === leftTeam ? 1 : 5;
    const isServingPlayer = isServingTeam && slot === servingSlot;

    const btns = buttonsForContext(player.position, { 
      frontRow, libero, isServingTeam, isServingPlayer 
    });
    
    // ✅ Separate Groups for Each Skill
    const groups: Record<string, Btn[]> = {
        "SERVE": [],
        "RECEIVE": [],
        "SET": [],
        "ATTACK": [],
        "BLOCK": [],
        "DIG": []
    };

    btns.forEach(b => {
        let key = b.skill;
        if (key === "SPIKE") key = "ATTACK";
        if (groups[key]) groups[key].push(b);
    });

    // ✅ CONDITIONAL ORDER: If Setter, put "SET" at the very top (after Serve if serving)
    const ORDER = isSetter 
        ? ["SET", "SERVE", "RECEIVE", "ATTACK", "BLOCK", "DIG"] 
        : ["SERVE", "RECEIVE", "SET", "ATTACK", "BLOCK", "DIG"];

    const visibleGroups = ORDER
        .filter(key => groups[key] && groups[key].length > 0)
        .map(key => ({
            title: key,
            btns: groups[key]
        }));

    return { teamId, slot, player, visibleGroups, frontRow };
  }, [active, players, courtA, courtB, servingTeam, leftTeam]);

  const historyGroups = useMemo(() => {
    const groups: { scoreLabel: string; isCurrent: boolean; events: typeof events }[] = [];
    if (events.length === 0) return [];
    let currentGroup: typeof groups[0] | null = null;
    for (const ev of events) {
        const isCurrent = (ev.prevScoreA === currentScoreA && ev.prevScoreB === currentScoreB);
        const label = isCurrent ? "Current Rally" : `Set Score: ${ev.prevScoreA} - ${ev.prevScoreB}`;
        if (!currentGroup || currentGroup.scoreLabel !== label) {
            currentGroup = { scoreLabel: label, isCurrent, events: [] };
            groups.push(currentGroup);
        }
        currentGroup.events.push(ev);
    }
    return groups;
  }, [events, currentScoreA, currentScoreB]);

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
      
      {/* HEADER */}
      <div className="border-b border-gray-100 p-4 bg-white z-10 shrink-0 shadow-sm">
        <div className="flex justify-between items-start">
            <div>
                <div className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">
                  Slot {slotLabel[info.slot]} • {info.frontRow ? "Front" : "Back"}
                </div>
                <h2 className="text-3xl font-black text-gray-900 leading-none mt-1 mb-1">
                  #{info.player.jerseyNumber} <span className="text-xl font-bold text-gray-600">{info.player.name.split(" ")[0]}</span>
                </h2>
            </div>
            <button 
              onClick={handleOpenSettings}
              className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-200 transition"
            >
              SUB ⚙️
            </button>
        </div>
      </div>

      {/* ✅ ACTION GRID - BIGGER BUTTONS (Preserved Layout) */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50 space-y-6">
        {info.visibleGroups.length === 0 ? (
           <div className="text-base font-medium text-gray-400 text-center py-10">
             No actions available.
           </div>
        ) : (
          info.visibleGroups.map((group) => (
            <div key={group.title}>
              {/* Category Header */}
              <div className="flex items-center gap-2 mb-3">
                 <span className="text-[11px] font-black text-gray-500 uppercase tracking-widest bg-gray-200 px-2 py-0.5 rounded">
                   {group.title}
                 </span>
                 <div className="h-px bg-gray-200 flex-1" />
              </div>

              {/* 2-Column Grid */}
              <div className="grid grid-cols-2 gap-3">
                {group.btns.map((b, i) => {
                  const theme = getOutcomeTheme(b.outcome);
                  return (
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
                      // ✅ PRESERVED SIZE: py-4 px-2
                      className={`relative flex flex-col justify-center items-center py-4 px-2 rounded-xl border-2 shadow-sm transition-all active:scale-[0.96] ${theme.btn}`}
                    >
                      {/* Outcome Label (Large) */}
                      <span className="font-black text-base uppercase leading-none text-center">
                        {b.label}
                      </span>
                      {/* Status Dot */}
                      <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${theme.dot}`} />
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ✅ EVENT HISTORY LOG - PRESERVED STYLING */}
      <div className="border-t bg-white flex flex-col max-h-[35%] shrink-0">
        <div className="p-2 bg-gray-50 border-b text-[10px] font-bold uppercase text-gray-400 tracking-widest text-center">
          Event Log
        </div>
        
        <div className="overflow-y-auto p-3 space-y-3">
          {historyGroups.length === 0 ? (
            <div className="text-xs text-gray-300 italic text-center py-2">No events yet.</div>
          ) : (
            historyGroups.map((group, gIdx) => (
              <div key={gIdx} className={`rounded-lg border ${group.isCurrent ? "border-blue-200 bg-blue-50/20" : "border-gray-100 bg-gray-50/50 opacity-60"}`}>
                <div className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider flex justify-between rounded-t-lg ${group.isCurrent ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
                   <span>{group.scoreLabel}</span>
                   {group.isCurrent && <span>Live</span>}
                </div>
                <div className="p-1.5 space-y-1.5">
                   {group.events.map((e) => {
                      const theme = getOutcomeTheme(e.outcome);
                      // ✅ Find Player & Jersey
                      const p = players.find((x) => x.id === e.playerId);
                      const jersey = p ? p.jerseyNumber : "?";

                      // ✅ Special rendering for SUBS (if present in log)
                      if (e.skillKey === "SUBSTITUTION") {
                          return (
                            <div key={e.id} className="flex items-center justify-between text-xs bg-gray-50 p-1.5 rounded border border-gray-200 shadow-sm">
                               <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tight">Substitution</span>
                               <span className="font-mono text-gray-400 text-[9px]">UNDOABLE</span>
                            </div>
                          );
                      }

                      return (
                        <div key={e.id} className="flex items-center justify-between text-sm bg-white p-2 rounded border border-gray-200 shadow-sm">
                           <div className="flex items-center gap-3">
                              {/* Jersey Number */}
                              <span className="font-black text-gray-500 text-xs w-6 text-center bg-gray-100 rounded py-0.5">#{jersey}</span>
                              {/* Skill Name */}
                              <div className="font-extrabold text-gray-800 uppercase tracking-tight">
                                  {e.skill.replace("SPIKE", "ATK").substring(0, 3)}
                              </div>
                           </div>
                           {/* Outcome Badge - Bold & Readable */}
                           <div className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide border ${theme.badge}`}>
                              {e.outcome.replace("POINT", "KILL").replace("SUCCESS", "GOOD").replace("PERFECT", "EXC")}
                           </div>
                        </div>
                      );
                   })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

    </aside>
  );
}