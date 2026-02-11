"use client";

import { useMemo, useState } from "react";
import { useMatchStore } from "@/store/matchStore";
import type { TeamId } from "@/lib/volleyball";

// --- HELPERS FOR RANKINGS ---

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit" });

const normKey = (v: unknown) =>
  String(v ?? "").trim().toUpperCase().replace(/[^\w\s-]/g, "").replace(/[\s-]+/g, "_");

type PosBucket = "OH" | "OPP" | "S" | "L" | "MB" | "OTHER";

function bucketFromPosition(posRaw: unknown): PosBucket {
  const p = normKey(posRaw);
  if (p === "MB" || p.includes("MIDDLE")) return "MB";
  if (p === "S" || p.includes("SETTER")) return "S";
  if (p === "L" || p.includes("LIBERO")) return "L";
  if (p === "OPP" || p.includes("OPPOSITE") || p.includes("RIGHT_SIDE")) return "OPP";
  if (p === "OH" || p.includes("OUTSIDE") || p === "WS" || p.includes("WING")) return "OH";
  return "OTHER";
}

// --- HELPERS FOR SHEET ---

const calculateSheetStats = (playerId: string | "TEAM", teamId: TeamId, events: any[]) => {
  const stats = {
    points: 0,
    spikes: { won: 0, total: 0 },
    blocks: { won: 0 },
    serves: { ace: 0 },
    oppError: 0,
    dig: { exc: 0, total: 0, fault: 0 },
    set: { exc: 0, total: 0, fault: 0 },
    receive: { exc: 0, total: 0, fault: 0 },
  };

  for (const ev of events) {
    const isActor = (playerId === "TEAM") ? (ev.teamId === teamId) : (ev.playerId === playerId);
    
    // Opponent Error Points (Team only)
    if (playerId === "TEAM" && ev.pointWinner === teamId && ev.teamId !== teamId) {
       stats.oppError++;
       stats.points++;
    }

    if (!isActor) continue;

    const skill = ev.skillKey || "";
    const outcome = ev.outcomeKey || "";

    // SCORING
    if (skill.includes("SPIKE") || skill.includes("ATTACK")) {
      stats.spikes.total++;
      if (outcome.includes("KILL") || outcome.includes("WIN")) {
        stats.spikes.won++;
        stats.points++;
      }
    }
    if (skill.includes("BLOCK") && (outcome.includes("POINT") || outcome.includes("KILL"))) {
        stats.blocks.won++;
        stats.points++;
    }
    if (skill.includes("SERVE") && outcome.includes("ACE")) {
        stats.serves.ace++;
        stats.points++;
    }

    // NON-SCORING
    if (skill.includes("DIG")) {
      stats.dig.total++;
      if (outcome.includes("SUCCESS") || outcome.includes("PERFECT")) stats.dig.exc++;
      if (outcome.includes("ERROR")) stats.dig.fault++;
    }
    if (skill.includes("SET")) {
      stats.set.total++;
      if (outcome.includes("PERFECT")) stats.set.exc++;
      if (outcome.includes("ERROR")) stats.set.fault++;
    }
    if (skill.includes("RECEIVE") || skill.includes("RECEPTION")) {
      stats.receive.total++;
      if (outcome.includes("PERFECT") || outcome.includes("SUCCESS")) stats.receive.exc++;
      if (outcome.includes("ERROR")) stats.receive.fault++;
    }
  }
  return stats;
};

export default function MatchSummaryModal() {
  const open = useMatchStore((s) => s.matchSummaryOpen);
  const close = useMatchStore((s) => s.closeMatchSummary);
  
  const savedSets = useMatchStore((s) => s.savedSets);
  const players = useMatchStore((s) => s.players);
  
  const [viewMode, setViewMode] = useState<"sheet" | "rankings">("sheet");
  const [sheetTab, setSheetTab] = useState<TeamId>("A");

  // --- 1. DATA FOR SHEET VIEW ---
  const sheetData = useMemo(() => {
    const allEvents = savedSets.flatMap((s) => s.events || []);
    
    const teamAPlayers = players.filter(p => p.teamId === "A").sort((a, b) => Number(a.jerseyNumber) - Number(b.jerseyNumber));
    const teamBPlayers = players.filter(p => p.teamId === "B").sort((a, b) => Number(a.jerseyNumber) - Number(b.jerseyNumber));

    const rowsA = teamAPlayers.map(p => ({ player: p, stats: calculateSheetStats(p.id, "A", allEvents) }));
    const rowsB = teamBPlayers.map(p => ({ player: p, stats: calculateSheetStats(p.id, "B", allEvents) }));

    const totalA = calculateSheetStats("TEAM", "A", allEvents);
    const totalB = calculateSheetStats("TEAM", "B", allEvents);

    const setsWonA = savedSets.filter(s => s.winner === "A").length;
    const setsWonB = savedSets.filter(s => s.winner === "B").length;

    return { rowsA, rowsB, totalA, totalB, setsWonA, setsWonB };
  }, [savedSets, players]);

  // --- 2. DATA FOR RANKINGS VIEW ---
  const rankingsData = useMemo(() => {
    const totalsPog: Record<string, number> = {};
    const pointsWon: Record<string, number> = {};
    const pointsLost: Record<string, number> = {};

    for (const set of savedSets) {
      if (set.perPlayer) {
        for (const [pid, data] of Object.entries(set.perPlayer)) {
          totalsPog[pid] = (totalsPog[pid] ?? 0) + Number(data?.pogPoints ?? 0);
        }
      }
      const events = Array.isArray(set.events) ? set.events : [];
      for (const ev of events as any[]) {
        const pid = String(ev?.playerId ?? "");
        if (!pid) continue;
        const pw = ev?.pointWinner;
        const teamId = ev?.teamId;
        if (!pw) continue;
        if (teamId && pw === teamId) pointsWon[pid] = (pointsWon[pid] ?? 0) + 1;
        else if (teamId && pw !== teamId) pointsLost[pid] = (pointsLost[pid] ?? 0) + 1;
      }
    }

    const ranked = Object.entries(totalsPog)
      .map(([playerId, points]) => {
        const p = players.find((x) => x.id === playerId);
        const bucket = bucketFromPosition(p?.position);
        return {
          playerId,
          pogPoints: points,
          teamId: p?.teamId ?? "?",
          name: p?.name ?? "Unknown",
          jersey: p?.jerseyNumber ?? "",
          position: (p?.position as any) ?? "",
          bucket,
          pointCredits: pointsWon[playerId] ?? 0,
          errorCredits: pointsLost[playerId] ?? 0,
        };
      })
      .sort((a, b) => b.pogPoints - a.pogPoints);

    const pog = ranked[0] ?? null;
    const byPosition: Record<PosBucket, typeof ranked> = { OH: [], OPP: [], S: [], L: [], MB: [], OTHER: [] };
    for (const r of ranked) byPosition[r.bucket].push(r);

    return { ranked, pog, byPosition };
  }, [savedSets, players]);

  if (!open) return null;

  const currentRows = sheetTab === "A" ? sheetData.rowsA : sheetData.rowsB;
  const currentTotal = sheetTab === "A" ? sheetData.totalA : sheetData.totalB;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative flex flex-col w-full max-w-[1400px] max-h-[95vh] bg-white rounded-xl shadow-2xl overflow-hidden">
        
        {/* === HEADER === */}
        <div className="shrink-0 bg-gray-900 text-white px-6 py-4 flex justify-between items-center border-b border-gray-800">
          <div className="flex items-center gap-6">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-blue-400">Match Summary</div>
              <div className="text-2xl font-black mt-1">
                SETS: {sheetData.setsWonA} - {sheetData.setsWonB}
              </div>
            </div>
            
            {/* VIEW SWITCHER */}
            <div className="flex bg-gray-800 rounded-lg p-1 gap-1">
              <button 
                onClick={() => setViewMode("sheet")} 
                className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition ${viewMode === "sheet" ? "bg-blue-600 text-white shadow" : "text-gray-400 hover:text-white"}`}
              >
                Result Sheet
              </button>
              <button 
                onClick={() => setViewMode("rankings")} 
                className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition ${viewMode === "rankings" ? "bg-blue-600 text-white shadow" : "text-gray-400 hover:text-white"}`}
              >
                Rankings
              </button>
            </div>
          </div>

          <button onClick={close} className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white font-bold transition text-xs">
            ✕ CLOSE
          </button>
        </div>

        {/* === CONTENT AREA === */}
        <div className="flex-1 overflow-hidden bg-gray-100 flex flex-col">
          
          {/* --- VIEW 1: RESULT SHEET (The Table) --- */}
          {viewMode === "sheet" && (
            <div className="flex flex-col h-full">
              {/* Sheet Tabs */}
              <div className="shrink-0 flex border-b bg-white">
                <button 
                  onClick={() => setSheetTab("A")} 
                  className={`flex-1 py-3 text-sm font-black uppercase tracking-wider ${sheetTab === "A" ? "text-blue-700 border-b-4 border-blue-600 bg-blue-50" : "text-gray-500 hover:bg-gray-50"}`}
                >
                  Team A
                </button>
                <button 
                  onClick={() => setSheetTab("B")} 
                  className={`flex-1 py-3 text-sm font-black uppercase tracking-wider ${sheetTab === "B" ? "text-red-700 border-b-4 border-red-600 bg-red-50" : "text-gray-500 hover:bg-gray-50"}`}
                >
                  Team B
                </button>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-auto bg-white p-4 lg:p-8">
                <div className="border-2 border-black min-w-[900px]">
                  <table className="w-full text-center border-collapse text-sm">
                    <thead>
                      {/* 1. SUPER HEADERS */}
                      <tr className="bg-gray-800 text-white text-xs uppercase font-black tracking-tight">
                        <th colSpan={3} className="p-2 border-r border-gray-600 text-left pl-4">Players</th>
                        <th colSpan={5} className="p-2 border-r border-gray-600 bg-blue-900">Scoring Skills</th>
                        <th colSpan={9} className="p-2 bg-orange-800">Non-Scoring Skills</th>
                      </tr>
                      {/* 2. CATEGORY HEADERS */}
                      <tr className="bg-gray-200 text-gray-900 border-b-2 border-black font-extrabold text-[11px] uppercase">
                        <th className="p-2 border-r border-gray-400 w-12 bg-gray-300">#</th>
                        <th className="p-2 border-r border-gray-400 text-left w-48 bg-gray-300">Name</th>
                        <th className="p-2 border-r border-black w-14 bg-yellow-300 text-black">PTS</th>
                        
                        {/* Scoring */}
                        <th className="p-2 border-r border-gray-400 w-20 bg-blue-100">Spk Won</th>
                        <th className="p-2 border-r border-gray-400 w-20 bg-blue-100">Spk Tot</th>
                        <th className="p-2 border-r border-gray-400 w-14 bg-green-100">Blk</th>
                        <th className="p-2 border-r border-gray-400 w-14 bg-blue-100">Srv</th>
                        <th className="p-2 border-r border-black w-16 bg-gray-300">Opp.Err</th>

                        {/* Non-Scoring */}
                        <th colSpan={3} className="p-1 border-r border-gray-400 bg-purple-100">Digs</th>
                        <th colSpan={3} className="p-1 border-r border-gray-400 bg-gray-100">Sets</th>
                        <th colSpan={3} className="p-1 bg-orange-100">Reception</th>
                      </tr>
                      {/* 3. SUB HEADERS */}
                      <tr className="bg-gray-100 text-[10px] font-bold text-gray-700 border-b border-black">
                        <th colSpan={3} className="border-r border-gray-400 bg-gray-50"></th>
                        <th colSpan={5} className="border-r border-black bg-gray-50"></th>
                        {/* Digs */}
                        <th className="border-r border-gray-300 py-1 bg-purple-50">Exc</th>
                        <th className="border-r border-gray-300 py-1 bg-purple-50">Tot</th>
                        <th className="border-r border-gray-400 py-1 bg-purple-50">Err</th>
                        {/* Sets */}
                        <th className="border-r border-gray-300 py-1 bg-gray-50">Exc</th>
                        <th className="border-r border-gray-300 py-1 bg-gray-50">Tot</th>
                        <th className="border-r border-gray-400 py-1 bg-gray-50">Err</th>
                        {/* Rec */}
                        <th className="border-r border-gray-300 py-1 bg-orange-50">Exc</th>
                        <th className="border-r border-gray-300 py-1 bg-orange-50">Tot</th>
                        <th className="py-1 bg-orange-50">Err</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-900">
                      {currentRows.map(({ player, stats }, i) => (
                        <tr key={player.id} className={`border-b border-gray-300 ${i % 2 === 0 ? "bg-white" : "bg-gray-50 hover:bg-gray-100"}`}>
                          <td className="p-2 border-r border-gray-300 font-bold text-gray-700">{player.jerseyNumber}</td>
                          <td className="p-2 border-r border-gray-300 text-left font-bold text-black truncate max-w-[150px]">{player.name}</td>
                          <td className="p-2 border-r border-black font-black text-base bg-yellow-300 text-black">{stats.points || "-"}</td>
                          
                          {/* Scoring Stats */}
                          <td className="p-2 border-r border-gray-300 font-bold">{stats.spikes.won || ""}</td>
                          <td className="p-2 border-r border-gray-300 text-gray-500">{stats.spikes.total || ""}</td>
                          <td className="p-2 border-r border-gray-300 font-bold text-green-700">{stats.blocks.won || ""}</td>
                          <td className="p-2 border-r border-gray-300 font-bold text-blue-700">{stats.serves.ace || ""}</td>
                          <td className="p-2 border-r border-black bg-gray-100"></td>

                          {/* Digs */}
                          <td className="p-2 border-r border-gray-200 text-green-700 font-bold">{stats.dig.exc || ""}</td>
                          <td className="p-2 border-r border-gray-200 text-gray-500 text-xs">{stats.dig.total || ""}</td>
                          <td className="p-2 border-r border-gray-400 text-red-600 font-bold text-xs">{stats.dig.fault || ""}</td>

                          {/* Sets */}
                          <td className="p-2 border-r border-gray-200 text-green-700 font-bold">{stats.set.exc || ""}</td>
                          <td className="p-2 border-r border-gray-200 text-gray-500 text-xs">{stats.set.total || ""}</td>
                          <td className="p-2 border-r border-gray-400 text-red-600 font-bold text-xs">{stats.set.fault || ""}</td>

                          {/* Rec */}
                          <td className="p-2 border-r border-gray-200 text-green-700 font-bold">{stats.receive.exc || ""}</td>
                          <td className="p-2 border-r border-gray-200 text-gray-500 text-xs">{stats.receive.total || ""}</td>
                          <td className="p-2 text-red-600 font-bold text-xs">{stats.receive.fault || ""}</td>
                        </tr>
                      ))}
                      
                      {/* TEAM TOTALS */}
                      <tr className="bg-gray-900 text-white font-bold border-t-2 border-black">
                        <td colSpan={2} className="p-3 border-r border-gray-700 text-right uppercase text-xs tracking-widest text-gray-300">Total Team</td>
                        <td className="p-3 border-r border-white bg-yellow-500 text-black font-black text-lg">{currentTotal.points}</td>
                        
                        <td className="p-2 border-r border-gray-700">{currentTotal.spikes.won}</td>
                        <td className="p-2 border-r border-gray-700 text-gray-400">{currentTotal.spikes.total}</td>
                        <td className="p-2 border-r border-gray-700 text-green-400">{currentTotal.blocks.won}</td>
                        <td className="p-2 border-r border-gray-700 text-blue-300">{currentTotal.serves.ace}</td>
                        <td className="p-2 border-r border-white bg-gray-800 text-yellow-400">{currentTotal.oppError}</td>
                        
                        <td className="p-2 border-r border-gray-700 text-green-400">{currentTotal.dig.exc}</td>
                        <td className="p-2 border-r border-gray-700 text-gray-500">{currentTotal.dig.total}</td>
                        <td className="p-2 border-r border-gray-600 text-red-400">{currentTotal.dig.fault}</td>

                        <td className="p-2 border-r border-gray-700 text-green-400">{currentTotal.set.exc}</td>
                        <td className="p-2 border-r border-gray-700 text-gray-500">{currentTotal.set.total}</td>
                        <td className="p-2 border-r border-gray-600 text-red-400">{currentTotal.set.fault}</td>

                        <td className="p-2 border-r border-gray-700 text-green-400">{currentTotal.receive.exc}</td>
                        <td className="p-2 border-r border-gray-700 text-gray-500">{currentTotal.receive.total}</td>
                        <td className="p-2 text-red-400">{currentTotal.receive.fault}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* --- VIEW 2: RANKINGS (Your Original View) --- */}
          {viewMode === "rankings" && (
            <div className="flex-1 overflow-auto p-6">
              <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6">
                
                {/* SETS HISTORY */}
                <div className="rounded-xl bg-white border p-6 shadow-sm">
                  <div className="font-black text-sm mb-4 text-gray-400 uppercase tracking-widest">Saved Sets</div>
                  {savedSets.length === 0 ? (
                    <div className="text-sm text-gray-400 italic">No saved sets yet.</div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {savedSets.slice().sort((a,b) => a.setNumber - b.setNumber).map(s => (
                        <div key={s.id} className="flex items-center justify-between p-4 rounded-lg bg-gray-50 border">
                          <div>
                            <div className="font-black text-gray-900">Set {s.setNumber}</div>
                            <div className="text-xs text-gray-500">{fmtTime(s.ts)}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-black text-xl">{s.finalScoreA} - {s.finalScoreB}</div>
                            <div className="text-[10px] font-bold uppercase text-gray-400">Winner: Team {s.winner}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* RANKINGS CONTENT */}
                <div className="flex flex-col gap-6">
                  {/* POG */}
                  {rankingsData.pog && (
                    <div className="rounded-xl bg-gradient-to-br from-yellow-100 to-white border border-yellow-200 p-6 shadow-sm">
                      <div className="text-xs font-bold uppercase text-yellow-600 mb-2">Player of the Game</div>
                      <div className="flex items-end justify-between">
                        <div>
                          <div className="text-3xl font-black text-gray-900">
                            #{rankingsData.pog.jersey} {rankingsData.pog.name}
                          </div>
                          <div className="text-sm text-gray-600 font-bold mt-1">Team {rankingsData.pog.teamId} • {rankingsData.pog.position}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-4xl font-black text-yellow-500">{rankingsData.pog.pogPoints.toFixed(1)}</div>
                          <div className="text-[10px] font-bold uppercase text-gray-400">Total Pts</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* BY POSITION */}
                  <div className="rounded-xl bg-white border p-6 shadow-sm">
                    <div className="font-black text-sm mb-4 text-gray-400 uppercase tracking-widest">Leaders By Position</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {(["OH", "OPP", "S", "L", "MB"] as PosBucket[]).map((pos) => {
                        const list = rankingsData.byPosition[pos] ?? [];
                        return (
                          <div key={pos} className="p-3 rounded-lg bg-gray-50 border">
                            <div className="flex justify-between items-center mb-2 border-b pb-2">
                              <span className="font-bold text-xs text-gray-500">{pos}</span>
                              <span className="text-[10px] bg-gray-200 px-1.5 rounded-full text-gray-600">{list.length}</span>
                            </div>
                            {list.length === 0 ? <div className="text-[10px] text-gray-400 italic">None</div> : (
                              list.slice(0, 3).map((p, i) => (
                                <div key={p.playerId} className="flex justify-between items-center text-sm py-0.5">
                                  <span className="font-bold text-gray-800">#{p.jersey} {p.name.split(" ")[0]}</span>
                                  <span className="font-mono font-bold text-blue-600">{p.pogPoints.toFixed(1)}</span>
                                </div>
                              ))
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}