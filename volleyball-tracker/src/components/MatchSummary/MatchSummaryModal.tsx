"use client";

import { useMemo, useState } from "react";
import { useMatchStore } from "@/store/matchStore";
import type { TeamId } from "@/lib/volleyball";

// --- HELPERS ---
const fmtTime = (ts: number) =>
  new Date(ts).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit" });

const normKey = (v: unknown) =>
  String(v ?? "").trim().toUpperCase().replace(/[^\w\s-]/g, "").replace(/[\s-]+/g, "_");

type PosBucket = "OH" | "OPP" | "S" | "L" | "MB" | "OTHER";

// ✅ STRICT TYPE DEFINITION
type RankedItem = {
  playerId: string;
  pogPoints: number;
  teamId: string;
  name: string;
  jersey: string; // Explicitly defined
  position: string;
  bucket: PosBucket;
  pointCredits: number;
  errorCredits: number;
  setsPlayed: number;
};

function bucketFromPosition(posRaw: unknown): PosBucket {
  const p = normKey(posRaw);
  if (p === "MB" || p.includes("MIDDLE")) return "MB";
  if (p === "S" || p.includes("SETTER")) return "S";
  if (p === "L" || p.includes("LIBERO")) return "L";
  if (p === "OPP" || p.includes("OPPOSITE") || p.includes("RIGHT_SIDE")) return "OPP";
  if (p === "OH" || p.includes("OUTSIDE") || p === "WS" || p.includes("WING")) return "OH";
  return "OTHER";
}

const calculatePlayerStats = (playerId: string, events: any[]) => {
  const stats = {
    points: 0, spikes: { won: 0, total: 0 }, blocks: { won: 0 }, serves: { ace: 0 },
    dig: { exc: 0, total: 0, fault: 0 }, set: { exc: 0, total: 0, fault: 0 }, receive: { exc: 0, total: 0, fault: 0 },
  };
  for (const ev of events) {
    if (ev.playerId !== playerId) continue;
    const skill = ev.skillKey || "";
    const outcome = ev.outcomeKey || "";
    if (skill.includes("SPIKE") || skill.includes("ATTACK")) {
      stats.spikes.total++;
      if (outcome.includes("KILL") || outcome.includes("WIN")) { stats.spikes.won++; stats.points++; }
    }
    if (skill.includes("BLOCK") && (outcome.includes("POINT") || outcome.includes("KILL"))) { stats.blocks.won++; stats.points++; }
    if (skill.includes("SERVE") && outcome.includes("ACE")) { stats.serves.ace++; stats.points++; }
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

const calculateOppErrors = (teamId: TeamId, events: any[]) => {
    let count = 0;
    for (const ev of events) {
        if (ev.pointWinner === teamId && ev.teamId !== teamId) count++;
    }
    return count;
};

export default function MatchSummaryModal() {
  const open = useMatchStore((s) => s.matchSummaryOpen);
  const close = useMatchStore((s) => s.closeMatchSummary);
  
  const savedSets = useMatchStore((s) => s.savedSets);
  const players = useMatchStore((s) => s.players);
  
  const [viewMode, setViewMode] = useState<"sheet" | "rankings">("sheet");
  const [sheetTab, setSheetTab] = useState<TeamId>("A");
  const [filterSetId, setFilterSetId] = useState<string | "ALL">("ALL");

  const filteredSets = useMemo(() => {
    if (filterSetId === "ALL") return savedSets;
    return savedSets.filter(s => s.id === filterSetId);
  }, [savedSets, filterSetId]);

  const activeEvents = useMemo(() => {
    return filteredSets.flatMap((s) => s.events || []);
  }, [filteredSets]);

  const sheetData = useMemo(() => {
    const setsPlayedMap: Record<string, number> = {};
    filteredSets.forEach(set => {
        const activeIds = new Set<string>();
        if (set.events) { set.events.forEach(e => activeIds.add(e.playerId)); }
        activeIds.forEach(pid => { setsPlayedMap[pid] = (setsPlayedMap[pid] || 0) + 1; });
    });

    // ✅ Defensive check for jerseyNumber existence
    const teamAPlayers = players.filter(p => p.teamId === "A").sort((a, b) => Number(a.jerseyNumber || 0) - Number(b.jerseyNumber || 0));
    const teamBPlayers = players.filter(p => p.teamId === "B").sort((a, b) => Number(a.jerseyNumber || 0) - Number(b.jerseyNumber || 0));

    const rowsA = teamAPlayers.map(p => ({ player: p, stats: calculatePlayerStats(p.id, activeEvents), setsPlayed: setsPlayedMap[p.id] || 0 }));
    const rowsB = teamBPlayers.map(p => ({ player: p, stats: calculatePlayerStats(p.id, activeEvents), setsPlayed: setsPlayedMap[p.id] || 0 }));

    const sumRows = (rows: typeof rowsA) => {
        const t = { points: 0, spikes: { won: 0, total: 0 }, blocks: { won: 0 }, serves: { ace: 0 }, oppError: 0, dig: { exc: 0, total: 0, fault: 0 }, set: { exc: 0, total: 0, fault: 0 }, receive: { exc: 0, total: 0, fault: 0 } };
        rows.forEach(r => {
            t.spikes.won += r.stats.spikes.won; t.spikes.total += r.stats.spikes.total; t.blocks.won += r.stats.blocks.won; t.serves.ace += r.stats.serves.ace;
            t.dig.exc += r.stats.dig.exc; t.dig.total += r.stats.dig.total; t.dig.fault += r.stats.dig.fault;
            t.set.exc += r.stats.set.exc; t.set.total += r.stats.set.total; t.set.fault += r.stats.set.fault;
            t.receive.exc += r.stats.receive.exc; t.receive.total += r.stats.receive.total; t.receive.fault += r.stats.receive.fault;
        });
        return t;
    };

    const totalA = sumRows(rowsA);
    const totalB = sumRows(rowsB);

    const actualScoreA = filteredSets.reduce((sum, s) => sum + s.finalScoreA, 0);
    const actualScoreB = filteredSets.reduce((sum, s) => sum + s.finalScoreB, 0);

    totalA.points = actualScoreA;
    totalB.points = actualScoreB;

    const earnedA = totalA.spikes.won + totalA.blocks.won + totalA.serves.ace;
    const earnedB = totalB.spikes.won + totalB.blocks.won + totalB.serves.ace;

    totalA.oppError = Math.max(0, totalA.points - earnedA);
    totalB.oppError = Math.max(0, totalB.points - earnedB);

    const setsWonA = savedSets.filter(s => s.winner === "A").length;
    const setsWonB = savedSets.filter(s => s.winner === "B").length;

    return { rowsA, rowsB, totalA, totalB, setsWonA, setsWonB };
  }, [filteredSets, activeEvents, players, savedSets]);

  const rankingsData = useMemo(() => {
    const totalsPog: Record<string, number> = {};
    const pointsWon: Record<string, number> = {};
    const pointsLost: Record<string, number> = {};
    const setsPlayedMap: Record<string, number> = {};

    for (const set of filteredSets) {
      const activeIds = new Set<string>();
      if (set.perPlayer) { for (const [pid, data] of Object.entries(set.perPlayer)) { totalsPog[pid] = (totalsPog[pid] ?? 0) + Number(data?.pogPoints ?? 0); activeIds.add(pid); } }
      const events = Array.isArray(set.events) ? set.events : [];
      for (const ev of events as any[]) {
        const pid = String(ev?.playerId ?? "");
        if (!pid) continue;
        activeIds.add(pid);
        const pw = ev?.pointWinner;
        const teamId = ev?.teamId;
        if (teamId && pw === teamId) pointsWon[pid] = (pointsWon[pid] ?? 0) + 1;
        else if (teamId && pw !== teamId) pointsLost[pid] = (pointsLost[pid] ?? 0) + 1;
      }
      activeIds.forEach(pid => setsPlayedMap[pid] = (setsPlayedMap[pid] || 0) + 1);
    }

    const ranked = Object.entries(totalsPog)
      .map(([playerId, points]): RankedItem | null => {
        const p = players.find((x) => x.id === playerId);
        if (!p) return null;
        const bucket = bucketFromPosition(p.position);
        return {
          playerId, pogPoints: points, teamId: p.teamId, name: p.name, 
          jersey: String(p.jerseyNumber || "?"), // ✅ Safe string conversion
          position: (p.position as any) ?? "", bucket, pointCredits: pointsWon[playerId] ?? 0, errorCredits: pointsLost[playerId] ?? 0, setsPlayed: setsPlayedMap[playerId] ?? 0,
        };
      })
      .filter((item): item is RankedItem => item !== null);

    ranked.sort((a, b) => b.pogPoints - a.pogPoints);

    const pog = ranked[0] ?? null;
    // ✅ Safe initialization of Record
    const byPosition: Record<PosBucket, RankedItem[]> = { OH: [], OPP: [], S: [], L: [], MB: [], OTHER: [] };
    for (const r of ranked) {
        if (byPosition[r.bucket]) {
            byPosition[r.bucket].push(r);
        } else {
            // Fallback if bucket is somehow invalid
            byPosition.OTHER.push(r);
        }
    }

    return { ranked, pog, byPosition };
  }, [filteredSets, players]);

  const handleExportJSON = () => {
    const exportData = { metadata: { date: new Date().toISOString(), type: "FULL_MATCH_JSON" }, teams: { scoreA: sheetData.setsWonA, scoreB: sheetData.setsWonB }, roster: players, history: savedSets };
    downloadFile(JSON.stringify(exportData, null, 2), "match_backup.json", "application/json");
  };

  const handleExportCSV = () => {
    let csv = "Team,Jersey,Name,Sets,Points,Spike Won,Spike Total,Block Kill,Serve Ace,Dig Exc,Dig Total,Set Exc,Set Total,Rec Exc,Rec Total,Rec Error\n";
    sheetData.rowsA.forEach(r => {
        csv += `A,${r.player.jerseyNumber || ""},${r.player.name},${r.setsPlayed},${r.stats.points},${r.stats.spikes.won},${r.stats.spikes.total},${r.stats.blocks.won},${r.stats.serves.ace},${r.stats.dig.exc},${r.stats.dig.total},${r.stats.set.exc},${r.stats.set.total},${r.stats.receive.exc},${r.stats.receive.total},${r.stats.receive.fault}\n`;
    });
    sheetData.rowsB.forEach(r => {
        csv += `B,${r.player.jerseyNumber || ""},${r.player.name},${r.setsPlayed},${r.stats.points},${r.stats.spikes.won},${r.stats.spikes.total},${r.stats.blocks.won},${r.stats.serves.ace},${r.stats.dig.exc},${r.stats.dig.total},${r.stats.set.exc},${r.stats.set.total},${r.stats.receive.exc},${r.stats.receive.total},${r.stats.receive.fault}\n`;
    });
    downloadFile(csv, `match_summary_${new Date().toISOString().split('T')[0]}.csv`, "text/csv");
  };

  const downloadFile = (content: string, fileName: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!open) return null;

  const currentRows = sheetTab === "A" ? sheetData.rowsA : sheetData.rowsB;
  const currentTotal = sheetTab === "A" ? sheetData.totalA : sheetData.totalB;
  const sortedSets = savedSets.slice().sort((a, b) => a.setNumber - b.setNumber);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative flex flex-col w-full max-w-[1400px] max-h-[95vh] bg-white rounded-xl shadow-2xl overflow-hidden">
        
        {/* HEADER */}
        <div className="shrink-0 bg-gray-900 text-white px-6 py-4 flex flex-col gap-4 border-b border-gray-800">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-6">
                <div>
                    <div className="text-xs font-bold uppercase tracking-widest text-blue-400">Match Summary</div>
                    <div className="text-2xl font-black mt-1">SETS: {sheetData.setsWonA} - {sheetData.setsWonB}</div>
                </div>
                <div className="flex bg-gray-800 rounded-lg p-1 gap-1">
                    <button onClick={() => setViewMode("sheet")} className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition ${viewMode === "sheet" ? "bg-blue-600 text-white shadow" : "text-gray-400 hover:text-white"}`}>Result Sheet</button>
                    <button onClick={() => setViewMode("rankings")} className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition ${viewMode === "rankings" ? "bg-blue-600 text-white shadow" : "text-gray-400 hover:text-white"}`}>Rankings</button>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <button onClick={handleExportCSV} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white font-bold transition text-xs flex items-center gap-1 shadow-sm"><span>📊</span> EXPORT CSV</button>
                <button onClick={handleExportJSON} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white font-bold transition text-xs flex items-center gap-1 shadow-sm"><span>💾</span> JSON</button>
                <div className="w-px h-6 bg-gray-700 mx-1"></div>
                <button onClick={close} className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white font-bold transition text-xs">✕ CLOSE</button>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
             <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mr-2">Filter Stats:</span>
             <button onClick={() => setFilterSetId("ALL")} className={`px-3 py-1.5 rounded-full text-xs font-bold transition border ${filterSetId === "ALL" ? "bg-white text-gray-900 border-white" : "bg-transparent text-gray-400 border-gray-700 hover:border-gray-500 hover:text-white"}`}>FULL MATCH</button>
             {sortedSets.map(s => (
               <button key={s.id} onClick={() => setFilterSetId(s.id)} className={`px-3 py-1.5 rounded-full text-xs font-bold transition border whitespace-nowrap ${filterSetId === s.id ? "bg-white text-gray-900 border-white" : "bg-transparent text-gray-400 border-gray-700 hover:border-gray-500 hover:text-white"}`}>SET {s.setNumber}</button>
             ))}
          </div>
        </div>

        {/* CONTENT */}
        <div className="flex-1 overflow-hidden bg-gray-100 flex flex-col">
          {viewMode === "sheet" && (
            <div className="flex flex-col h-full">
              <div className="shrink-0 flex border-b bg-white">
                <button onClick={() => setSheetTab("A")} className={`flex-1 py-3 text-sm font-black uppercase tracking-wider ${sheetTab === "A" ? "text-blue-700 border-b-4 border-blue-600 bg-blue-50" : "text-gray-500 hover:bg-gray-50"}`}>Team A</button>
                <button onClick={() => setSheetTab("B")} className={`flex-1 py-3 text-sm font-black uppercase tracking-wider ${sheetTab === "B" ? "text-red-700 border-b-4 border-red-600 bg-red-50" : "text-gray-500 hover:bg-gray-50"}`}>Team B</button>
              </div>
              <div className="flex-1 overflow-auto bg-white p-4 lg:p-8">
                <div className="border-2 border-black min-w-[900px]">
                  <table className="w-full text-center border-collapse text-sm">
                    <thead>
                      <tr className="bg-gray-800 text-white text-xs uppercase font-black tracking-tight">
                        <th colSpan={3} className="p-2 border-r border-gray-600 text-left pl-4">Players</th>
                        <th colSpan={5} className="p-2 border-r border-gray-600 bg-blue-900">Scoring Skills</th>
                        <th colSpan={9} className="p-2 bg-orange-800">Non-Scoring Skills</th>
                      </tr>
                      <tr className="bg-gray-200 text-gray-900 border-b-2 border-black font-extrabold text-[11px] uppercase">
                        <th className="p-2 border-r border-gray-400 w-12 bg-gray-300">#</th>
                        <th className="p-2 border-r border-gray-400 text-left w-48 bg-gray-300">Name</th>
                        <th className="p-2 border-r border-gray-400 w-12 bg-gray-300">Sets</th>
                        <th className="p-2 border-r border-black w-14 bg-yellow-300 text-black">PTS</th>
                        <th className="p-2 border-r border-gray-400 w-20 bg-blue-100">Spk Won</th>
                        <th className="p-2 border-r border-gray-400 w-20 bg-blue-100">Spk Tot</th>
                        <th className="p-2 border-r border-gray-400 w-14 bg-green-100">Blk</th>
                        <th className="p-2 border-r border-gray-400 w-14 bg-blue-100">Srv</th>
                        <th className="p-2 border-r border-black w-16 bg-gray-300">Opp.Err</th>
                        <th colSpan={3} className="p-1 border-r border-gray-400 bg-purple-100">Digs</th>
                        <th colSpan={3} className="p-1 border-r border-gray-400 bg-gray-100">Sets</th>
                        <th colSpan={3} className="p-1 bg-orange-100">Reception</th>
                      </tr>
                      <tr className="bg-gray-100 text-[10px] font-bold text-gray-700 border-b border-black">
                        <th colSpan={4} className="border-r border-black bg-gray-50"></th>
                        <th colSpan={5} className="border-r border-black bg-gray-50"></th>
                        <th className="border-r border-gray-300 py-1 bg-purple-50">Exc</th>
                        <th className="border-r border-gray-300 py-1 bg-purple-50">Tot</th>
                        <th className="border-r border-gray-400 py-1 bg-purple-50">Err</th>
                        <th className="border-r border-gray-300 py-1 bg-gray-50">Exc</th>
                        <th className="border-r border-gray-300 py-1 bg-gray-50">Tot</th>
                        <th className="border-r border-gray-400 py-1 bg-gray-50">Err</th>
                        <th className="border-r border-gray-300 py-1 bg-orange-50">Exc</th>
                        <th className="border-r border-gray-300 py-1 bg-orange-50">Tot</th>
                        <th className="py-1 bg-orange-50">Err</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-900">
                      {currentRows.map(({ player, stats, setsPlayed }, i) => (
                        <tr key={player.id} className={`border-b border-gray-300 ${i % 2 === 0 ? "bg-white" : "bg-gray-50 hover:bg-gray-100"}`}>
                          <td className="p-2 border-r border-gray-300 font-bold text-gray-700">{player.jerseyNumber}</td>
                          <td className="p-2 border-r border-gray-300 text-left font-bold text-black truncate max-w-[150px]">{player.name}</td>
                          <td className="p-2 border-r border-gray-300 font-bold text-gray-500 bg-gray-50">{setsPlayed || ""}</td>
                          <td className="p-2 border-r border-black font-black text-base bg-yellow-300 text-black">{stats.points || "-"}</td>
                          <td className="p-2 border-r border-gray-300 font-bold">{stats.spikes.won || ""}</td>
                          <td className="p-2 border-r border-gray-300 text-gray-500">{stats.spikes.total || ""}</td>
                          <td className="p-2 border-r border-gray-300 font-bold text-green-700">{stats.blocks.won || ""}</td>
                          <td className="p-2 border-r border-gray-300 font-bold text-blue-700">{stats.serves.ace || ""}</td>
                          <td className="p-2 border-r border-black bg-gray-100"></td>
                          <td className="p-2 border-r border-gray-200 text-green-700 font-bold">{stats.dig.exc || ""}</td>
                          <td className="p-2 border-r border-gray-200 text-gray-500 text-xs">{stats.dig.total || ""}</td>
                          <td className="p-2 border-r border-gray-400 text-red-600 font-bold text-xs">{stats.dig.fault || ""}</td>
                          <td className="p-2 border-r border-gray-200 text-green-700 font-bold">{stats.set.exc || ""}</td>
                          <td className="p-2 border-r border-gray-200 text-gray-500 text-xs">{stats.set.total || ""}</td>
                          <td className="p-2 border-r border-gray-400 text-red-600 font-bold text-xs">{stats.set.fault || ""}</td>
                          <td className="p-2 border-r border-gray-200 text-green-700 font-bold">{stats.receive.exc || ""}</td>
                          <td className="p-2 border-r border-gray-200 text-gray-500 text-xs">{stats.receive.total || ""}</td>
                          <td className="p-2 text-red-600 font-bold text-xs">{stats.receive.fault || ""}</td>
                        </tr>
                      ))}
                      <tr className="bg-gray-900 text-white font-bold border-t-2 border-black">
                        <td colSpan={3} className="p-3 border-r border-gray-700 text-right uppercase text-xs tracking-widest text-gray-300">
                            {filterSetId === "ALL" ? "Full Match Total" : `Set ${savedSets.find(s=>s.id === filterSetId)?.setNumber} Total`}
                        </td>
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

          {viewMode === "rankings" && (
            <div className="flex-1 overflow-auto p-6">
              <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6">
                 {rankingsData.pog ? (
                    <div className="rounded-xl bg-gradient-to-br from-yellow-100 to-white border border-yellow-200 p-6 shadow-sm">
                       <div className="text-xs font-bold uppercase text-yellow-600 mb-2">
                         {filterSetId === "ALL" ? "Player of the Game" : `Top Performer (Set ${savedSets.find(s=>s.id === filterSetId)?.setNumber})`}
                       </div>
                       <div className="flex items-end justify-between">
                         <div>
                           <div className="text-3xl font-black text-gray-900">
                             #{rankingsData.pog.jersey} {rankingsData.pog.name}
                           </div>
                           <div className="text-sm text-gray-600 font-bold mt-1">
                              Team {rankingsData.pog.teamId} • {rankingsData.pog.position} • {rankingsData.pog.setsPlayed} Sets Played
                           </div>
                         </div>
                         <div className="text-right">
                           <div className="text-4xl font-black text-yellow-500">{rankingsData.pog.pogPoints.toFixed(1)}</div>
                           <div className="text-[10px] font-bold uppercase text-gray-400">Total Pts</div>
                         </div>
                       </div>
                    </div>
                 ) : (
                    <div className="text-center text-gray-400 py-10">No data for rankings.</div>
                 )}
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
                                  <span className="font-bold text-gray-800">#{p.jersey} {p.name.split(" ")[0]} <span className="text-gray-400 text-[10px]">({p.setsPlayed}s)</span></span>
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
          )}
        </div>
      </div>
    </div>
  );
}