"use client";

import { useMemo } from "react";
import { useMatchStore } from "@/store/matchStore";
import type { Skill, Outcome } from "@/lib/volleyball";
import { slotLabel } from "@/lib/volleyball";

type Btn = { skill: Skill; outcome: Outcome; label: string; short: string };

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
  // PURPLE: Forced Errors
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

  // 3. Setting
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

  // Wingers & Default
  return [...serve, ...receive, ...dig, ...(opts.frontRow ? block : []), ...attack];
}

export default function ScoresheetPanel() {
  const active = useMatchStore((s) => s.activeScoresheet);
  const close = useMatchStore((s) => s.closeScoresheet);
  const logEvent = useMatchStore((s) => s.logEvent);
  const undo = useMatchStore((s) => s.undoLastEvent);
  const currentlyServing = useMatchStore((s) => s.currentlyServing);
  const rallyState = useMatchStore((s) => s.rallyState);
  const servingTeam = useMatchStore((s) => s.servingTeam);
  const leftTeam = useMatchStore((s) => s.leftTeam);

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
    
    // Determine serving context for button generation
    const isServingTeam = (teamId === servingTeam);
    const isLeftTeam = teamId === leftTeam;
    const servingSlot = isLeftTeam ? 1 : 5;
    const isServingPlayer = isServingTeam && slot === servingSlot;

    let btns = buttonsForContext(player.position, { 
      frontRow, libero, isServingTeam, isServingPlayer 
    });

    // FSM filtering rules:
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
      const lastEvent = events.length > 0 ? events[0] : null;
      if (lastEvent && lastEvent.teamId !== teamId) {
          if (lastEvent.skill === "SPIKE" || lastEvent.skill === "ATTACK") {
             btns = btns.filter(b => b.skill === "DIG" && b.outcome.includes("ERROR"));
          } else if (lastEvent.skill === "SERVE") {
             btns = btns.filter(b => b.skill === "RECEIVE" && b.outcome.includes("ERROR"));
          } else {
             btns = btns.filter(b => b.skill === "DIG" && b.outcome.includes("ERROR"));
          }
      } else {
          btns = [];
      }
    } else if (rallyState === "IN_RALLY") {
      // ✅ NEW: Attack Flow Control
      const lastEvent = events.length > 0 ? events[0] : null;
      if (lastEvent && (lastEvent.skill === "SPIKE" || lastEvent.skill === "ATTACK") && 
         (lastEvent.outcome === "SUCCESS" || lastEvent.outcome === "IN_PLAY")) {
          
          if (teamId !== lastEvent.teamId) {
              btns = btns.filter(b => b.skill === "DIG");
          } else {
              btns = [];
          }
      } else {
          btns = btns.filter((b) => b.skill !== "SERVE" && b.skill !== "RECEIVE");
      }
    }
    const playerEvents = events.filter((e) => e.playerId === player.id);

    return { teamId, slot, player, btns, playerEvents, frontRow, libero };
  }, [active, players, courtA, courtB, events, currentlyServing, rallyState, servingTeam, leftTeam]);

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
          {info.btns.length === 0 && rallyState === "AWAIT_BLOCK" ? (
             <div className="p-4 text-center text-orange-600 font-bold bg-orange-50 rounded-lg border border-orange-200">
                Opponent Block required!<br/><span className="text-xs font-normal">Switch team to log the block.</span>
             </div>
          ) : info.btns.length === 0 && rallyState === "AWAIT_ERROR" ? (
             <div className="p-4 text-center text-purple-600 font-bold bg-purple-50 rounded-lg border border-purple-200">
                Forced Error!<br/><span className="text-xs font-normal">Switch team to log the error.</span>
             </div>
          ) : (
            info.btns.map((b, idx) => {
              const theme = getOutcomeTheme(b.outcome);
              return (
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
                  className={`w-full relative rounded-xl border-2 p-3 text-left transition ${theme.btn}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                        <div className="font-semibold">{b.label}</div>
                        <div className="text-[11px] opacity-70 mt-0.5">
                          {b.skill} • {b.short}
                        </div>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${theme.dot}`} />
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="mt-6 border-t pt-4 overflow-auto">
          <div className="text-sm font-bold text-gray-900">Recent (this player)</div>
          <div className="mt-2 grid gap-2">
            {info.playerEvents.length === 0 ? (
              <div className="text-xs text-gray-500">No events yet.</div>
            ) : (
              info.playerEvents.slice(0, 12).map((e) => {
                const theme = getOutcomeTheme(e.outcome);
                return (
                  <div
                    key={e.id}
                    className="flex items-center justify-between rounded-lg bg-gray-50 border border-gray-200 p-2 text-xs"
                  >
                    <div className="font-semibold text-gray-800">
                      {String(e.skill)} • {String(e.outcome)}
                      {e.pointWinner ? (
                        <span className="ml-2 font-black text-gray-600">
                          • Point: {e.pointWinner}
                        </span>
                      ) : null}
                    </div>
                    <div className={`w-2 h-2 rounded-full ${theme.dot}`} />
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}