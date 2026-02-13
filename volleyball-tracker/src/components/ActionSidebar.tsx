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
  // GREEN: Points / Perfect / Kill (Clean)
  if ((u.includes("KILL") && !u.includes("FORCED")) || (u.includes("ACE") && !u.includes("FORCED")) || u.includes("POINT") || u.includes("PERFECT")) {
    return {
      btn: "bg-emerald-50 border-emerald-200 text-emerald-900 hover:bg-emerald-100 hover:border-emerald-300",
      dot: "bg-emerald-500",
      badge: "bg-emerald-100 text-emerald-800 border-emerald-200"
    };
  }
  // ORANGE: Slash / Overpass (Warning)
  if (u.includes("SLASH") || u.includes("OVERPASS") || u.includes("BLOCKED")) {
    return {
      btn: "bg-orange-50 border-orange-200 text-orange-900 hover:bg-orange-100 hover:border-orange-300",
      dot: "bg-orange-500",
      badge: "bg-orange-100 text-orange-800 border-orange-200"
    };
  }
  // PURPLE: Forced Errors (Kill/Ace via opponent error)
  if (u.includes("FORCED")) {
    return {
      btn: "bg-purple-50 border-purple-200 text-purple-900 hover:bg-purple-100 hover:border-purple-300",
      dot: "bg-purple-500",
      badge: "bg-purple-100 text-purple-800 border-purple-200"
    };
  }
  // YELLOW: Continuation / In Play / Touch
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
    { skill: "DIG", outcome: "PERFECT", label: "Perfect", short: "Exc" },
    { skill: "DIG", outcome: "SUCCESS", label: "Up / In Play", short: "Up" },
    { skill: "DIG", outcome: "SLASH", label: "Slash / Over", short: "Slash" },
    { skill: "DIG", outcome: "ERROR", label: "Error / Kill", short: "Err" },
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
    { skill: "BLOCK", outcome: "TOUCH", label: "Touch / Soft", short: "Tch" },
    { skill: "BLOCK", outcome: "ERROR", label: "Net / Tool", short: "Err" },
  ];
  
  // 5. Attacking
  const attack: Btn[] = [
    { skill: "SPIKE", outcome: "KILL", label: "Kill (Clean)", short: "Kill" },
    { skill: "SPIKE", outcome: "KILL_FORCED", label: "Kill (Forced)", short: "Tool" },
    { skill: "SPIKE", outcome: "SUCCESS", label: "Dug / In Play", short: "Dig" },
    { skill: "SPIKE", outcome: "BLOCKED", label: "Got Blocked", short: "Blk" },
    { skill: "SPIKE", outcome: "ERROR", label: "Out / Net", short: "Err" },
  ];

  // 6. Serving
  const serve: Btn[] = opts.isServingTeam ? [
    { skill: "SERVE", outcome: "ACE", label: "Ace (Clean)", short: "Ace" },
    { skill: "SERVE", outcome: "ACE_FORCED", label: "Ace (Error)", short: "Ace+" },
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
  const currentlyServing = useMatchStore((s) => s.currentlyServing);
  const rallyState = useMatchStore((s) => s.rallyState);
  
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
    const isSetter = isSetterPosition(player.position); 
    const isServingTeam = (teamId === servingTeam);
    const servingSlot = teamId === leftTeam ? 1 : 5;
    const isServingPlayer = isServingTeam && slot === servingSlot;

    let btns = buttonsForContext(player.position, { 
      frontRow, libero, isServingTeam, isServingPlayer 
    });

    // FSM filtering rules
    if (currentlyServing && currentlyServing === teamId) {
      btns = btns.filter((b) => b.skill === "SERVE");
    } else if (rallyState === "PRE_RALLY") {
      if (servingTeam === teamId) btns = btns.filter((b) => b.skill === "SERVE");
      else btns = [];
    } else if (rallyState === "AWAIT_RECEIVE") {
      if (servingTeam !== teamId) btns = btns.filter((b) => b.skill === "RECEIVE");
      else btns = [];
    } else if (rallyState === "AWAIT_BLOCK") {
      const lastEvent = events.length > 0 ? events[0] : null;
      if (lastEvent && lastEvent.teamId !== teamId) {
          if (frontRow) {
             btns = btns.filter((b) => b.skill === "BLOCK");
          } else {
             btns = [];
          }
      } else {
          btns = [];
      }
    } else if (rallyState === "AWAIT_ERROR") {
      // ✅ NEW: Strict context-aware error button
      const lastEvent = events.length > 0 ? events[0] : null;
      if (lastEvent && lastEvent.teamId !== teamId) {
          // If previous was Spike/Attack -> Opponent must Dig Error
          if (lastEvent.skill === "SPIKE" || lastEvent.skill === "ATTACK") {
             btns = btns.filter(b => b.skill === "DIG" && b.outcome.includes("ERROR"));
          } 
          // If previous was Serve -> Opponent must Receive Error
          else if (lastEvent.skill === "SERVE") {
             btns = btns.filter(b => b.skill === "RECEIVE" && b.outcome.includes("ERROR"));
          }
          // Fallback just in case (Blocking tool, etc) -> Dig Error
          else {
             btns = btns.filter(b => b.skill === "DIG" && b.outcome.includes("ERROR"));
          }
      } else {
          // Same team: No actions
          btns = [];
      }
    } else if (rallyState === "IN_RALLY") {
      btns = btns.filter((b) => b.skill !== "SERVE" && b.skill !== "RECEIVE");
    }
    
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
  }, [active, players, courtA, courtB, servingTeam, leftTeam, currentlyServing, rallyState, events]);

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
            <div className="flex items-center gap-2">
              <button 
                onClick={handleOpenSettings}
                className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-200 transition"
              >
                SUB ⚙️
              </button>

              <div className="flex flex-col items-end">
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">State</div>
                <div className={`text-[12px] font-mono px-2 py-1 rounded ${rallyState === "PRE_RALLY" ? "bg-gray-100 text-gray-800" : rallyState === "AWAIT_RECEIVE" ? "bg-yellow-100 text-yellow-800" : rallyState === "AWAIT_BLOCK" || rallyState === "AWAIT_ERROR" ? "bg-orange-100 text-orange-800" : "bg-emerald-100 text-emerald-800"}`}>
                  {rallyState === "IN_RALLY" ? "RALLY" : rallyState === "AWAIT_RECEIVE" ? "RECEIVE" : rallyState === "AWAIT_BLOCK" ? "BLOCK?" : rallyState === "AWAIT_ERROR" ? "ERROR?" : "SERVE"}
                </div>
              </div>
            </div>
        </div>
      </div>

      {/* ACTION GRID */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50 space-y-6">
        {info.visibleGroups.length === 0 ? (
           <div className="text-base font-medium text-gray-400 text-center py-10">
             {rallyState === "AWAIT_BLOCK" && info.teamId === events[0]?.teamId 
                ? "Attack Blocked. Switch to opponent to log the block!" 
                : rallyState === "AWAIT_ERROR" && info.teamId === events[0]?.teamId
                ? "Forced Error. Switch to opponent to log the error!"
                : "No actions available."}
           </div>
        ) : (
          info.visibleGroups.map((group) => (
            <div key={group.title}>
              <div className="flex items-center gap-2 mb-3">
                 <span className="text-[11px] font-black text-gray-500 uppercase tracking-widest bg-gray-200 px-2 py-0.5 rounded">
                   {group.title}
                 </span>
                 <div className="h-px bg-gray-200 flex-1" />
              </div>

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
                      className={`relative flex flex-col justify-center items-center py-4 px-2 rounded-xl border-2 shadow-sm transition-all active:scale-[0.96] ${theme.btn}`}
                    >
                      <span className="font-black text-base uppercase leading-none text-center">
                        {b.label}
                      </span>
                      <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${theme.dot}`} />
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* EVENT HISTORY LOG */}
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
                      const p = players.find((x) => x.id === e.playerId);
                      const jersey = p ? p.jerseyNumber : "?";

                      if (e.skillKey === "SUBSTITUTION") {
                          return (
                            <div key={e.id} className="flex items-center justify-between text-xs bg-gray-50 p-1.5 rounded border border-gray-200 shadow-sm">
                               <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tight">Substitution</span>
                            </div>
                          );
                      }

                      return (
                        <div key={e.id} className="flex items-center justify-between text-sm bg-white p-2 rounded border border-gray-200 shadow-sm">
                           <div className="flex items-center gap-3">
                             <span className="font-black text-gray-500 text-xs w-6 text-center bg-gray-100 rounded py-0.5">#{jersey}</span>
                             <div className="font-extrabold text-gray-800 uppercase tracking-tight">
                                 {e.skill.replace("SPIKE", "ATK").substring(0, 3)}
                             </div>
                           </div>
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