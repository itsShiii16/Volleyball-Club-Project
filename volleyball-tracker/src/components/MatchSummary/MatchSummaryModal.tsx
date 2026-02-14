"use client";

import { useMemo, useState, useRef } from "react";
import { useMatchStore } from "@/store/matchStore";
import type { TeamId } from "@/lib/volleyball";
import { toPng } from "html-to-image";

// --- HELPERS ---
const fmtTime = (ts: number) =>
  new Date(ts).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit" });

const normKey = (v: unknown) =>
  String(v ?? "").trim().toUpperCase().replace(/[^\w\s-]/g, "").replace(/[\s-]+/g, "_");

type PosBucket = "OH" | "OPP" | "S" | "L" | "MB" | "OTHER";

type RankedItem = {
  playerId: string;
  pogPoints: number;
  teamId: string;
  name: string;
  jersey: string;
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
    points: 0,
    spikes: { won: 0, error: 0, total: 0 },
    blocks: { won: 0, error: 0 },
    serves: { ace: 0, error: 0, total: 0 },
    dig: { exc: 0, error: 0, total: 0 },
    set: { exc: 0, running: 0, error: 0, total: 0 },
    receive: { exc: 0, error: 0, total: 0 },
  };

  for (const ev of events) {
    if (ev.playerId !== playerId) continue;
    const skill = ev.skillKey || "";
    const outcome = ev.outcomeKey || "";
    if (skill.includes("SPIKE") || skill.includes("ATTACK")) {
      stats.spikes.total++;
      if (outcome.includes("KILL") || outcome.includes("WIN")) { stats.spikes.won++; stats.points++; }
      if (outcome.includes("ERROR") || outcome.includes("OUT") || outcome.includes("BLOCKED") || outcome.includes("NET")) stats.spikes.error++;
    }
    if (skill.includes("BLOCK")) {
        if (outcome.includes("POINT") || outcome.includes("KILL")) { stats.blocks.won++; stats.points++; }
        if (outcome.includes("ERROR") || outcome.includes("NET") || outcome.includes("OUT")) stats.blocks.error++;
    }
    if (skill.includes("SERVE")) {
        stats.serves.total++;
        if (outcome.includes("ACE")) { stats.serves.ace++; stats.points++; }
        if (outcome.includes("ERROR") || outcome.includes("NET") || outcome.includes("OUT")) stats.serves.error++;
    }
    if (skill.includes("DIG")) {
      stats.dig.total++;
      if (outcome.includes("PERFECT") || outcome.includes("EXCELLENT")) stats.dig.exc++;
      if (outcome.includes("ERROR")) stats.dig.error++;
    }
    if (skill.includes("SET")) {
      stats.set.total++;
      if (outcome.includes("PERFECT") || outcome.includes("EXCELLENT")) stats.set.exc++;
      if (outcome.includes("SUCCESS")) stats.set.running++; 
      if (outcome.includes("ERROR")) stats.set.error++;
    }
    if (skill.includes("RECEIVE") || skill.includes("RECEPTION")) {
      stats.receive.total++;
      if (outcome.includes("PERFECT") || outcome.includes("EXCELLENT")) stats.receive.exc++;
      if (outcome.includes("ERROR")) stats.receive.error++;
    }
  }
  return stats;
};

const calcEff = (good: number, bad: number, total: number) => {
    if (total === 0) return "-";
    const eff = ((good - bad) / total) * 100;
    return eff.toFixed(0) + "%";
};

export default function MatchSummaryModal() {
  const open = useMatchStore((s) => s.matchSummaryOpen);
  const close = useMatchStore((s) => s.closeMatchSummary);
  
  const savedSets = useMatchStore((s) => s.savedSets);
  const players = useMatchStore((s) => s.players);
  const events = useMatchStore((s) => s.events);
  const importEvents = useMatchStore((s) => s.importEvents);

  const summaryRef = useRef<HTMLDivElement>(null);
  
  const [viewMode, setViewMode] = useState<"sheet" | "rankings" | "roles">("sheet");
  const [sheetTab, setSheetTab] = useState<TeamId>("A");
  const [filterSetId, setFilterSetId] = useState<string | "ALL">("ALL");

  // ✅ Export Image Handler
  const handleExportPhoto = async () => {
    if (summaryRef.current === null) return;
    try {
      const dataUrl = await toPng(summaryRef.current, { cacheBust: true, backgroundColor: "#ffffff" });
      const link = document.createElement("a");
      link.download = `match-summary-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) { console.error("Export failed", err); }
  };

  // ✅ Multi-Device Sync Handlers
  const handleExportForPartner = () => {
    const dataStr = JSON.stringify(events, null, 2);
    downloadFile(dataStr, `stats_share_${Date.now()}.json`, "application/json");
  };

  const handleImportFromPartner = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const partnerEvents = JSON.parse(event.target?.result as string);
        importEvents(partnerEvents);
      } catch (err) { alert("Invalid file format."); }
    };
    reader.readAsText(file);
  };

  // --- FILTERED DATA ---
  const filteredSets = useMemo(() => {
    if (filterSetId === "ALL") return savedSets;
    return savedSets.filter(s => s.id === filterSetId);
  }, [savedSets, filterSetId]);

  const activeEvents = useMemo(() => {
    const saved = filteredSets.flatMap((s) => s.events || []);
    return filterSetId === "ALL" ? [...saved, ...events] : saved;
  }, [filteredSets, events, filterSetId]);

  const sheetData = useMemo(() => {
    const setsPlayedMap: Record<string, number> = {};
    filteredSets.forEach(set => {
        const activeIds = new Set<string>();
        if (set.events) { set.events.forEach(e => activeIds.add(e.playerId)); }
        activeIds.forEach(pid => { setsPlayedMap[pid] = (setsPlayedMap[pid] || 0) + 1; });
    });
    const teamAPlayers = players.filter(p => p.teamId === "A").sort((a, b) => Number(a.jerseyNumber || 0) - Number(b.jerseyNumber || 0));
    const teamBPlayers = players.filter(p => p.teamId === "B").sort((a, b) => Number(a.jerseyNumber || 0) - Number(b.jerseyNumber || 0));
    const rowsA = teamAPlayers.map(p => ({ player: p, stats: calculatePlayerStats(p.id, activeEvents), setsPlayed: setsPlayedMap[p.id] || 0 }));
    const rowsB = teamBPlayers.map(p => ({ player: p, stats: calculatePlayerStats(p.id, activeEvents), setsPlayed: setsPlayedMap[p.id] || 0 }));
    const sumRows = (rows: typeof rowsA) => {
        const t = { points: 0, spikes: { won: 0, error: 0, total: 0 }, blocks: { won: 0, error: 0 }, serves: { ace: 0, error: 0, total: 0 }, dig: { exc: 0, error: 0, total: 0 }, set: { exc: 0, running: 0, error: 0, total: 0 }, receive: { exc: 0, error: 0, total: 0 } };
        rows.forEach(r => {
            t.spikes.won += r.stats.spikes.won; t.spikes.error += r.stats.spikes.error; t.spikes.total += r.stats.spikes.total;
            t.blocks.won += r.stats.blocks.won; t.blocks.error += r.stats.blocks.error;
            t.serves.ace += r.stats.serves.ace; t.serves.error += r.stats.serves.error; t.serves.total += r.stats.serves.total;
            t.dig.exc += r.stats.dig.exc; t.dig.error += r.stats.dig.error; t.dig.total += r.stats.dig.total;
            t.set.exc += r.stats.set.exc; t.set.running += r.stats.set.running; t.set.error += r.stats.set.error; t.set.total += r.stats.set.total;
            t.receive.exc += r.stats.receive.exc; t.receive.error += r.stats.receive.error; t.receive.total += r.stats.receive.total;
        });
        return t;
    };
    const totalA = sumRows(rowsA); const totalB = sumRows(rowsB);
    totalA.points = filteredSets.reduce((sum, s) => sum + s.finalScoreA, 0);
    totalB.points = filteredSets.reduce((sum, s) => sum + s.finalScoreB, 0);
    const setsWonA = savedSets.filter(s => s.winner === "A").length;
    const setsWonB = savedSets.filter(s => s.winner === "B").length;
    return { rowsA, rowsB, totalA, totalB, setsWonA, setsWonB };
  }, [filteredSets, activeEvents, players, savedSets]);

  const rankingsData = useMemo(() => {
    const totalsPog: Record<string, number> = {};
    const setsPlayedMap: Record<string, number> = {};
    for (const set of filteredSets) {
      if (set.perPlayer) { for (const [pid, data] of Object.entries(set.perPlayer)) { totalsPog[pid] = (totalsPog[pid] ?? 0) + Number(data?.pogPoints ?? 0); } }
      const activeIds = new Set<string>();
      if (set.events) set.events.forEach(e => activeIds.add(e.playerId));
      activeIds.forEach(pid => setsPlayedMap[pid] = (setsPlayedMap[pid] || 0) + 1);
    }
    const ranked = Object.entries(totalsPog)
      .map(([playerId, points]): RankedItem | null => {
        const p = players.find((x) => x.id === playerId);
        if (!p) return null;
        return { playerId, pogPoints: points, teamId: p.teamId, name: p.name, jersey: String(p.jerseyNumber || "?"), position: (p.position as any) ?? "", bucket: bucketFromPosition(p.position), pointCredits: 0, errorCredits: 0, setsPlayed: setsPlayedMap[playerId] ?? 0 };
      }).filter((item): item is RankedItem => item !== null).sort((a, b) => b.pogPoints - a.pogPoints);
    const byPosition: Record<PosBucket, RankedItem[]> = { OH: [], OPP: [], S: [], L: [], MB: [], OTHER: [] };
    for (const r of ranked) { byPosition[r.bucket].push(r); }
    return { ranked, pog: ranked[0] ?? null, byPosition };
  }, [filteredSets, players]);

  // ✅ RESTORED CSV EXPORT
  const handleExportCSV = () => {
    let csv = "Team,Jersey,Name,Sets,Points,Spike Won,Spike Err,Spike Tot,Block Kill,Block Err,Serve Ace,Serve Err,Serve Tot,Dig Exc,Dig Err,Dig Tot,Set Exc,Set Run,Set Err,Set Tot,Rec Exc,Rec Err,Rec Tot\n";
    const processRow = (r: any, team: string) => {
        csv += `${team},${r.player.jerseyNumber || ""},${r.player.name},${r.setsPlayed},${r.stats.points},` +
               `${r.stats.spikes.won},${r.stats.spikes.error},${r.stats.spikes.total},` +
               `${r.stats.blocks.won},${r.stats.blocks.error},` +
               `${r.stats.serves.ace},${r.stats.serves.error},${r.stats.serves.total},` +
               `${r.stats.dig.exc},${r.stats.dig.error},${r.stats.dig.total},` +
               `${r.stats.set.exc},${r.stats.set.running},${r.stats.set.error},${r.stats.set.total},` +
               `${r.stats.receive.exc},${r.stats.receive.error},${r.stats.receive.total}\n`;
    };
    sheetData.rowsA.forEach(r => processRow(r, "A"));
    sheetData.rowsB.forEach(r => processRow(r, "B"));
    downloadFile(csv, `match_stats_${new Date().toISOString().split('T')[0]}.csv`, "text/csv");
  };

  // ✅ RESTORED JSON EXPORT
  const handleExportJSON = () => {
    const exportData = { metadata: { date: new Date().toISOString(), type: "FULL_MATCH_JSON" }, teams: { scoreA: sheetData.setsWonA, scoreB: sheetData.setsWonB }, roster: players, history: savedSets };
    downloadFile(JSON.stringify(exportData, null, 2), "match_backup.json", "application/json");
  };

  const downloadFile = (content: string, fileName: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  if (!open) return null;

  const currentRows = sheetTab === "A" ? sheetData.rowsA : sheetData.rowsB;
  const currentTotal = sheetTab === "A" ? sheetData.totalA : sheetData.totalB;
  const sortedSets = savedSets.slice().sort((a, b) => a.setNumber - b.setNumber);
  const pogStatsRow = rankingsData.pog ? [...sheetData.rowsA, ...sheetData.rowsB].find(r => r.player.id === rankingsData.pog?.playerId) : null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative flex flex-col w-full max-w-[95vw] h-[90vh] bg-white rounded-xl shadow-2xl overflow-hidden">
        
        {/* HEADER */}
        <div className="shrink-0 bg-gray-900 text-white px-6 py-4 flex flex-col gap-4 border-b border-gray-800">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div className="flex items-center gap-6">
                <div><div className="text-xs font-bold uppercase tracking-widest text-blue-400">Match Summary</div><div className="text-2xl font-black mt-1">SETS: {sheetData.setsWonA} - {sheetData.setsWonB}</div></div>
                <div className="flex bg-gray-800 rounded-lg p-1 gap-1">
                    <button onClick={() => setViewMode("sheet")} className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition ${viewMode === "sheet" ? "bg-blue-600 text-white shadow" : "text-gray-400 hover:text-white"}`}>Result Sheet</button>
                    <button onClick={() => setViewMode("roles")} className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition ${viewMode === "roles" ? "bg-blue-600 text-white shadow" : "text-gray-400 hover:text-white"}`}>Role Stats</button>
                    <button onClick={() => setViewMode("rankings")} className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition ${viewMode === "rankings" ? "bg-blue-600 text-white shadow" : "text-gray-400 hover:text-white"}`}>Rankings</button>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <button onClick={handleExportForPartner} className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-bold transition text-xs flex items-center gap-1 shadow-sm"><span>📤</span> EXPORT TO PARTNER</button>
                <label className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white font-bold transition text-xs flex items-center gap-1 shadow-sm cursor-pointer">
                    <span>📥</span> IMPORT PARTNER
                    <input type="file" accept=".json" onChange={handleImportFromPartner} className="hidden" />
                </label>
                <div className="w-px h-6 bg-gray-700 mx-1"></div>
                <button onClick={handleExportPhoto} className="px-3 py-2 bg-pink-600 hover:bg-pink-500 rounded-lg text-white font-bold transition text-xs flex items-center gap-1 shadow-sm"><span>📸</span> IMAGE</button>
                <button onClick={handleExportCSV} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white font-bold transition text-xs flex items-center gap-1 shadow-sm"><span>📊</span> CSV</button>
                <button onClick={handleExportJSON} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white font-bold transition text-xs flex items-center gap-1 shadow-sm"><span>💾</span> JSON</button>
                <button onClick={close} className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white font-bold transition text-xs ml-2">✕ CLOSE</button>
            </div>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide"><span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mr-2">Filter Stats:</span><button onClick={() => setFilterSetId("ALL")} className={`px-3 py-1.5 rounded-full text-xs font-bold transition border ${filterSetId === "ALL" ? "bg-white text-gray-900 border-white" : "bg-transparent text-gray-400 border-gray-700 hover:border-gray-500 hover:text-white"}`}>FULL MATCH</button>{sortedSets.map(s => (<button key={s.id} onClick={() => setFilterSetId(s.id)} className={`px-3 py-1.5 rounded-full text-xs font-bold transition border whitespace-nowrap ${filterSetId === s.id ? "bg-white text-gray-900 border-white" : "bg-transparent text-gray-400 border-gray-700 hover:border-gray-500 hover:text-white"}`}>SET {s.setNumber}</button>))}</div>
        </div>

        {/* CONTENT */}
        <div ref={summaryRef} className="flex-1 overflow-hidden bg-white flex flex-col">
          {viewMode === "sheet" && (
            <div className="flex flex-col h-full text-gray-900">
              <div className="shrink-0 flex border-b bg-gray-100">
                  <button onClick={() => setSheetTab("A")} className={`flex-1 py-3 text-sm font-black uppercase tracking-wider ${sheetTab === "A" ? "text-blue-700 border-b-4 border-blue-600 bg-blue-50" : "text-gray-500 hover:bg-gray-200"}`}>Team A</button>
                  <button onClick={() => setSheetTab("B")} className={`flex-1 py-3 text-sm font-black uppercase tracking-wider ${sheetTab === "B" ? "text-red-700 border-b-4 border-red-600 bg-red-50" : "text-gray-500 hover:bg-gray-200"}`}>Team B</button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                <div className="border border-gray-300 rounded-lg overflow-hidden shadow-sm min-w-[1100px]">
                  <table className="w-full text-center border-collapse text-xs tabular-nums">
                    <thead className="sticky top-0 z-20">
                      <tr className="bg-gray-800 text-white uppercase font-black text-[10px] tracking-widest">
                        <th colSpan={3} className="p-2 text-left pl-4 border-r border-gray-700 sticky left-0 bg-gray-800 z-30">Players</th>
                        <th colSpan={7} className="p-1 border-r border-gray-700 bg-blue-900">Scoring & Attack</th>
                        <th colSpan={3} className="p-1 border-r border-gray-700 bg-green-900">Blocking</th>
                        <th colSpan={3} className="p-1 border-r border-gray-700 bg-indigo-900">Serving</th>
                        <th colSpan={9} className="p-1 bg-gray-700">Defense & Transition</th>
                      </tr>
                      <tr className="bg-gray-100 text-gray-800 border-b border-gray-300 font-bold uppercase text-[10px]">
                        <th className="px-2 py-2 border-r border-gray-300 w-10 sticky left-0 bg-gray-200 z-10" rowSpan={2}>#</th>
                        <th className="px-2 py-2 border-r border-gray-300 text-left w-32 sticky left-10 bg-gray-200 z-10" rowSpan={2}>Name</th>
                        <th className="px-2 py-2 border-r border-gray-300 w-10 sticky left-40 bg-gray-200 z-10" rowSpan={2}>Sets</th>
                        <th className="px-2 py-2 border-r border-gray-400 w-12 bg-yellow-100 text-black" rowSpan={2}>PTS</th>
                        <th className="px-1 py-2 border-r border-gray-200 bg-blue-50" rowSpan={2}>Kill</th><th className="px-1 py-2 border-r border-gray-200 bg-blue-50 text-red-600" rowSpan={2}>Err</th><th className="px-1 py-2 border-r border-gray-300 bg-blue-50 text-gray-500" rowSpan={2}>Tot</th><th className="px-1 py-2 border-r border-gray-300 bg-blue-100 w-10" rowSpan={2}>Eff%</th><th className="px-1 py-2 border-r border-gray-400 bg-blue-100 w-10" rowSpan={2}>Kil%</th>
                        <th className="px-1 py-2 border-r border-gray-200 bg-green-50" rowSpan={2}>Kill</th><th className="px-1 py-2 border-r border-gray-200 bg-green-50 text-red-600" rowSpan={2}>Err</th><th className="px-1 py-2 border-r border-gray-400 bg-green-50 text-gray-400" rowSpan={2}>/Set</th>
                        <th className="px-1 py-2 border-r border-gray-200 bg-indigo-50" rowSpan={2}>Ace</th><th className="px-1 py-2 border-r border-gray-200 bg-indigo-50 text-red-600" rowSpan={2}>Err</th><th className="px-1 py-2 border-r border-gray-400 bg-indigo-50 text-gray-500" rowSpan={2}>Tot</th>
                        <th className="px-1 py-2 border-r border-gray-200" rowSpan={2}>Dig</th><th className="px-1 py-2 border-r border-gray-200 text-red-600" rowSpan={2}>Err</th><th className="px-1 py-2 border-r border-gray-300 text-gray-400" rowSpan={2}>Tot</th>
                        <th className="px-1 py-2 border-r border-gray-300 bg-gray-50" rowSpan={2}>Ast</th>
                        <th className="px-1 py-2 border-r border-gray-200 bg-orange-50" colSpan={3}>Recep / Set</th>
                      </tr>
                      <tr className="bg-gray-50 text-gray-600 border-b border-gray-300 font-bold uppercase text-[9px]">
                         <th colSpan={18}></th>
                         <th className="px-1 py-1 border-r border-gray-200 bg-orange-50/50">Exc</th>
                         <th className="px-1 py-1 border-r border-gray-200 bg-orange-50/50 text-red-600">Err</th>
                         <th className="px-1 py-1 bg-orange-50/50 text-gray-500">Tot</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-gray-900">
                      {currentRows.map(({ player, stats, setsPlayed }, i) => {
                          const atkEff = calcEff(stats.spikes.won, stats.spikes.error, stats.spikes.total);
                          const killPct = stats.spikes.total > 0 ? ((stats.spikes.won / stats.spikes.total) * 100).toFixed(0) + "%" : "-";
                          const blkPerSet = setsPlayed > 0 ? (stats.blocks.won / setsPlayed).toFixed(2) : "-";
                          const isSetter = bucketFromPosition(player.position) === "S";

                          return (
                            <tr key={player.id} className="hover:bg-gray-50 group transition-colors">
                              <td className="px-2 py-2.5 font-bold border-r border-gray-200 sticky left-0 bg-white group-hover:bg-gray-50">{player.jerseyNumber}</td>
                              <td className="px-2 py-2.5 text-left font-bold truncate max-w-[120px] border-r border-gray-200 sticky left-10 bg-white group-hover:bg-gray-50">{player.name}</td>
                              <td className="px-2 py-2.5 text-gray-400 border-r border-gray-200 sticky left-40 bg-white group-hover:bg-gray-50">{setsPlayed}</td>
                              <td className="px-2 py-2.5 border-r border-gray-300 font-black bg-yellow-50 text-base">{stats.points}</td>
                              <td className="px-1 py-2.5 border-r border-gray-100 font-bold">{stats.spikes.won || "-"}</td><td className="px-1 py-2.5 border-r border-gray-100 text-red-600">{stats.spikes.error || "-"}</td><td className="px-1 py-2.5 border-r border-gray-200 text-gray-400 text-[11px]">{stats.spikes.total || "-"}</td>
                              <td className="px-1 py-2.5 border-r border-gray-200 bg-blue-50/50 font-mono text-[11px] text-blue-800">{atkEff}</td><td className="px-1 py-2.5 border-r border-gray-300 bg-blue-50/50 font-mono text-[11px] text-blue-800">{killPct}</td>
                              <td className="px-1 py-2.5 border-r border-gray-100 font-bold text-green-700">{stats.blocks.won || "-"}</td><td className="px-1 py-2.5 border-r border-gray-100 text-red-600">{stats.blocks.error || "-"}</td><td className="px-1 py-2.5 border-r border-gray-300 text-gray-400 text-[11px]">{blkPerSet}</td>
                              <td className="px-1 py-2.5 border-r border-gray-100 font-bold text-indigo-700">{stats.serves.ace || "-"}</td><td className="px-1 py-2.5 border-r border-gray-100 text-red-600">{stats.serves.error || "-"}</td><td className="px-1 py-2.5 border-r border-gray-300 text-gray-400 text-[11px]">{stats.serves.total || "-"}</td>
                              <td className="px-1 py-2.5 border-r border-gray-100 text-green-600">{stats.dig.exc || "-"}</td><td className="px-1 py-2.5 border-r border-gray-100 text-red-600">{stats.dig.error || "-"}</td><td className="px-1 py-2.5 border-r border-gray-300 text-gray-400 text-[11px]">{stats.dig.total || "-"}</td>
                              <td className="px-1 py-2.5 border-r border-gray-300 text-gray-600">{stats.set.running || "-"}</td>
                              
                              {isSetter ? (
                                <>
                                  <td className="px-1 py-2.5 border-r border-gray-100 text-green-600 font-bold bg-gray-50/30">{stats.set.exc || "-"}</td>
                                  <td className="px-1 py-2.5 border-r border-gray-100 text-red-600 bg-gray-50/30">{stats.set.error || "-"}</td>
                                  <td className="px-1 py-2.5 text-gray-400 text-[11px] bg-gray-50/30">{stats.set.total || "-"}</td>
                                </>
                              ) : (
                                <>
                                  <td className="px-1 py-2.5 border-r border-gray-100 text-green-600">{stats.receive.exc || "-"}</td>
                                  <td className="px-1 py-2.5 border-r border-gray-100 text-red-600">{stats.receive.error || "-"}</td>
                                  <td className="px-1 py-2.5 text-gray-400 text-[11px]">{stats.receive.total || "-"}</td>
                                </>
                              )}
                            </tr>
                          );
                      })}
                      <tr className="bg-gray-100 font-bold border-t-2 border-gray-300 shadow-inner">
                        <td colSpan={3} className="px-4 py-3 text-right uppercase text-xs tracking-widest text-gray-500 sticky left-0 bg-gray-100 z-10 border-r border-gray-300">Team Total</td>
                        <td className="px-2 py-3 bg-yellow-200 text-black font-black text-lg border-r border-gray-400">{currentTotal.points}</td>
                        <td className="px-1">{currentTotal.spikes.won}</td><td className="px-1 text-red-500">{currentTotal.spikes.error}</td><td className="px-1 text-gray-500 border-r border-gray-300">{currentTotal.spikes.total}</td><td className="px-1 border-r border-gray-300" colSpan={2}></td>
                        <td className="px-1 text-green-700">{currentTotal.blocks.won}</td><td className="px-1 text-red-500">{currentTotal.blocks.error}</td><td className="px-1 border-r border-gray-300"></td>
                        <td className="px-1 text-indigo-700">{currentTotal.serves.ace}</td><td className="px-1 text-red-500">{currentTotal.serves.error}</td><td className="px-1 text-gray-500 border-r border-gray-300">{currentTotal.serves.total}</td>
                        <td className="px-1 text-green-600">{currentTotal.dig.exc}</td><td className="px-1 text-red-500">{currentTotal.dig.error}</td><td className="px-1 text-gray-500 border-r border-gray-300">{currentTotal.dig.total}</td>
                        <td className="px-1 border-r border-gray-300">{currentTotal.set.running}</td>
                        <td className="px-1 text-green-600">{currentTotal.receive.exc}</td><td className="px-1 text-red-500">{currentTotal.receive.error}</td><td className="px-1 text-gray-500">{currentTotal.receive.total}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 2. RANKINGS (With POG Details) */}
          {viewMode === "rankings" && (
            <div className="flex-1 overflow-auto p-4 lg:p-8 bg-gray-50 space-y-8 text-gray-900">
              <div className="rounded-xl bg-white border border-gray-200 p-6 shadow-sm">
                  <div className="font-black text-sm mb-4 text-gray-400 uppercase tracking-widest text-gray-900">Match History</div>
                  {savedSets.length === 0 ? <div className="text-sm text-gray-400 italic">No saved sets yet.</div> : (
                    <div className="flex flex-col gap-3">
                      {sortedSets.map(s => (
                        <div key={s.id} className="flex items-center justify-between p-4 rounded-lg bg-gray-50 border text-gray-900">
                          <div><div className="font-black text-gray-900">Set {s.setNumber}</div><div className="text-xs text-gray-500">{fmtTime(s.ts)}</div></div>
                          <div className="text-right"><div className="font-black text-xl">{s.finalScoreA} - {s.finalScoreB}</div><div className="text-[10px] font-bold uppercase text-gray-400">Winner: Team {s.winner}</div></div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-6">
                 {rankingsData.pog && pogStatsRow ? (
                    <div className="rounded-xl bg-gradient-to-br from-yellow-50 to-white border border-yellow-200 p-6 shadow-sm text-gray-900">
                       <div className="flex justify-between items-start mb-6 text-gray-900">
                           <div>
                               <div className="text-xs font-bold uppercase text-yellow-600 mb-1">{filterSetId === "ALL" ? "Player of the Game" : `Top Performer`}</div>
                               <div className="text-3xl font-black text-gray-900">#{rankingsData.pog.jersey} {rankingsData.pog.name}</div>
                               <div className="text-sm text-gray-500 font-bold mt-1">Team {rankingsData.pog.teamId} • {rankingsData.pog.position}</div>
                           </div>
                           <div className="text-right">
                               <div className="text-5xl font-black text-yellow-500">{rankingsData.pog.pogPoints.toFixed(1)}</div>
                               <div className="text-[10px] font-bold uppercase text-gray-400">Total Rating</div>
                           </div>
                       </div>

                       <div className="bg-white/50 rounded-lg border border-yellow-100 overflow-hidden text-gray-900">
                           <table className="w-full text-center text-sm">
                               {bucketFromPosition(rankingsData.pog.position) === "L" ? (
                                   <>
                                     <thead className="bg-yellow-100/50 text-gray-600 font-bold uppercase text-[10px]">
                                         <tr><th className="p-2 border-r border-yellow-200">Rec Eff %</th><th className="p-2 border-r border-yellow-200">Dig Eff %</th><th className="p-2 border-r border-yellow-200">Exc Rec</th><th className="p-2">Exc Digs</th></tr>
                                     </thead>
                                     <tbody>
                                         <tr className="font-black text-gray-800 text-lg">
                                             <td className="p-3 border-r border-yellow-100">{calcEff(pogStatsRow.stats.receive.exc, pogStatsRow.stats.receive.error, pogStatsRow.stats.receive.total)}</td>
                                             <td className="p-3 border-r border-yellow-100">{calcEff(pogStatsRow.stats.dig.exc, pogStatsRow.stats.dig.error, pogStatsRow.stats.dig.total)}</td>
                                             <td className="p-3 border-r border-yellow-100">{pogStatsRow.stats.receive.exc}</td><td className="p-3">{pogStatsRow.stats.dig.exc}</td>
                                         </tr>
                                     </tbody>
                                   </>
                               ) : bucketFromPosition(rankingsData.pog.position) === "S" ? (
                                   <>
                                     <thead className="bg-yellow-100/50 text-gray-600 font-bold uppercase text-[10px]">
                                         <tr><th className="p-2 border-r border-yellow-200">Exc Sets</th><th className="p-2 border-r border-yellow-200">Run Sets</th><th className="p-2 border-r border-yellow-200">Pts</th><th className="p-2 border-r border-yellow-200">Atk</th><th className="p-2 border-r border-yellow-200">Blk</th><th className="p-2 border-r border-yellow-200">Ace</th><th className="p-2">Digs</th></tr>
                                     </thead>
                                     <tbody>
                                         <tr className="font-black text-gray-800 text-lg">
                                             <td className="p-3 border-r border-yellow-100">{pogStatsRow.stats.set.exc}</td><td className="p-3 border-r border-yellow-100">{pogStatsRow.stats.set.running}</td><td className="p-3 border-r border-yellow-100">{pogStatsRow.stats.points}</td><td className="p-3 border-r border-yellow-100">{pogStatsRow.stats.spikes.won}</td><td className="p-3 border-r border-yellow-100">{pogStatsRow.stats.blocks.won}</td><td className="p-3 border-r border-yellow-100">{pogStatsRow.stats.serves.ace}</td><td className="p-3">{pogStatsRow.stats.dig.exc}</td>
                                         </tr>
                                     </tbody>
                                   </>
                               ) : (
                                   <>
                                     <thead className="bg-yellow-100/50 text-gray-600 font-bold uppercase text-[10px]">
                                         <tr><th className="p-2 border-r border-yellow-200">Points</th><th className="p-2 border-r border-yellow-200">Attack</th><th className="p-2 border-r border-yellow-200">Blocks</th><th className="p-2 border-r border-yellow-200">Ace</th><th className="p-2 border-r border-yellow-200">Receives</th><th className="p-2">Digs</th></tr>
                                     </thead>
                                     <tbody>
                                         <tr className="font-black text-gray-800 text-lg">
                                             <td className="p-3 border-r border-yellow-100">{pogStatsRow.stats.points}</td><td className="p-3 border-r border-yellow-100">{pogStatsRow.stats.spikes.won}</td><td className="p-3 border-r border-yellow-100">{pogStatsRow.stats.blocks.won}</td><td className="p-3 border-r border-yellow-100">{pogStatsRow.stats.serves.ace}</td><td className="p-3 border-r border-yellow-100">{pogStatsRow.stats.receive.exc}</td><td className="p-3">{pogStatsRow.stats.dig.exc}</td>
                                         </tr>
                                     </tbody>
                                   </>
                               )}
                           </table>
                       </div>
                    </div>
                 ) : (
                    <div className="text-center text-gray-400 py-10 border rounded-xl">No data for rankings.</div>
                 )}

                 <div className="rounded-xl bg-white border border-gray-200 p-6 shadow-sm text-gray-900">
                    <div className="font-black text-sm mb-4 text-gray-400 uppercase tracking-widest">Leaders By Position</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-gray-900">
                      {(["OH", "OPP", "S", "L", "MB"] as PosBucket[]).map((pos) => {
                        const list = rankingsData.byPosition[pos] ?? [];
                        return (
                          <div key={pos} className="p-3 rounded-lg bg-gray-50 border text-gray-900">
                            <div className="flex justify-between items-center mb-2 border-b pb-2">
                              <span className="font-bold text-xs text-gray-500">{pos}</span>
                              <span className="text-[10px] bg-gray-200 px-1.5 rounded-full text-gray-600">{list.length}</span>
                            </div>
                            {list.length === 0 ? <div className="text-[10px] text-gray-400 italic">None</div> : (
                              list.slice(0, 3).map((p) => (
                                <div key={p.playerId} className="flex justify-between items-center text-sm py-0.5 text-gray-900">
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
          )}

          {/* 3. ROLE STATS (Fixed Overflow) */}
          {viewMode === "roles" && (
            <div className="flex-1 overflow-auto p-4 lg:p-8 bg-gray-50 space-y-8 text-gray-900">
               <div>
                 <h3 className="font-black text-sm uppercase tracking-widest text-gray-500 mb-2 pl-1">Attacking Roles (OH, OPP, MB)</h3>
                 <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto text-gray-900">
                    <table className="w-full text-center text-xs min-w-[900px]">
                        <thead className="bg-gray-100 text-gray-700 font-bold uppercase tracking-wide border-b border-gray-200">
                            <tr>
                                <th className="p-3 text-left">Player</th><th className="p-3">Pos</th>
                                <th className="p-3 bg-yellow-50 border-l border-r border-gray-200 text-black">Pts</th>
                                <th className="p-3 bg-blue-50/50">Atk Kill</th><th className="p-3 bg-blue-50/50 text-red-700">Atk Err</th><th className="p-3 bg-blue-50/50 text-gray-500">Tot</th>
                                <th className="p-3 bg-green-50/50 border-l border-gray-100">Blk Kill</th><th className="p-3 bg-green-50/50 text-red-700">Blk Err</th>
                                <th className="p-3 bg-indigo-50/50 border-l border-gray-100">Ace</th><th className="p-3 bg-indigo-50/50 text-red-700">Err</th>
                                <th className="p-3 bg-orange-50/50 border-l border-gray-100">Rec Exc</th><th className="p-3 bg-orange-50/50 text-red-700">Rec Err</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {[...sheetData.rowsA, ...sheetData.rowsB].filter(r => ["OH","OPP","MB"].includes(bucketFromPosition(r.player.position))).map((r, i) => (
                                <tr key={i} className="hover:bg-gray-50 transition-colors text-gray-900">
                                    <td className="p-3 text-left font-bold text-gray-900">#{r.player.jerseyNumber} {r.player.name}</td>
                                    <td className="p-3 text-[10px] font-bold text-gray-400 bg-gray-50">{bucketFromPosition(r.player.position)}</td>
                                    <td className="p-3 font-black bg-yellow-50 border-l border-r border-gray-100 text-blue-700 text-base">{r.stats.points}</td>
                                    <td className="p-3 font-bold text-blue-700">{r.stats.spikes.won}</td><td className="p-3 text-red-500 font-medium">{r.stats.spikes.error}</td><td className="p-3 text-gray-400">{r.stats.spikes.total}</td>
                                    <td className="p-3 border-l border-gray-100 font-bold text-green-700">{r.stats.blocks.won}</td><td className="p-3 text-red-500 font-medium">{r.stats.blocks.error}</td>
                                    <td className="p-3 border-l border-gray-100 font-bold text-indigo-700">{r.stats.serves.ace}</td><td className="p-3 text-red-500 font-medium">{r.stats.serves.error}</td>
                                    <td className="p-3 border-l border-gray-100 font-bold text-green-600">{r.stats.receive.exc}</td><td className="p-3 text-red-500 font-medium">{r.stats.receive.error}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                 </div>
               </div>

               <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 text-gray-900">
                   <div>
                        <h3 className="font-black text-sm uppercase tracking-widest text-gray-500 mb-2 pl-1">Setters</h3>
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                            <table className="w-full text-center text-xs min-w-[600px] text-gray-900">
                                <thead className="bg-gray-100 text-gray-700 font-bold uppercase tracking-wide border-b border-gray-200">
                                    <tr>
                                        <th className="p-3 text-left">Player</th>
                                        <th className="p-3 bg-gray-50">Exc Sets</th><th className="p-3 bg-gray-50">Run Sets</th>
                                        <th className="p-3 bg-yellow-50 border-l border-gray-200">Pts</th>
                                        <th className="p-3">Atk</th><th className="p-3">Blk</th><th className="p-3">Ace</th><th className="p-3">Dig</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 text-gray-900">
                                    {[...sheetData.rowsA, ...sheetData.rowsB].filter(r => bucketFromPosition(r.player.position) === "S").map((r, i) => (
                                        <tr key={i} className="hover:bg-gray-50 transition-colors text-gray-900">
                                            <td className="p-3 text-left font-bold text-gray-900">#{r.player.jerseyNumber} {r.player.name}</td>
                                            <td className="p-3 font-bold text-green-600 bg-gray-50">{r.stats.set.exc}</td>
                                            <td className="p-3 font-bold text-blue-600 bg-gray-50">{r.stats.set.running}</td>
                                            <td className="p-3 font-black bg-yellow-50 border-l border-gray-100 text-blue-700 text-base">{r.stats.points}</td>
                                            <td className="p-3 text-blue-700 font-bold">{r.stats.spikes.won}</td>
                                            <td className="p-3 text-gray-600">{r.stats.blocks.won}</td>
                                            <td className="p-3 text-gray-600">{r.stats.serves.ace}</td>
                                            <td className="p-3 text-gray-600">{r.stats.dig.exc}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                   </div>

                   <div>
                        <h3 className="font-black text-sm uppercase tracking-widest text-gray-500 mb-2 pl-1">Liberos</h3>
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                            <table className="w-full text-center text-xs min-w-[600px] text-gray-900">
                                <thead className="bg-gray-100 text-gray-700 font-bold uppercase tracking-wide border-b border-gray-200 text-gray-900">
                                    <tr>
                                        <th className="p-3 text-left">Player</th>
                                        <th className="p-3 bg-orange-50 border-l border-gray-200 text-gray-900">Rec Eff</th><th className="p-3 bg-orange-50 text-gray-900">Exc</th><th className="p-3 bg-orange-50 text-red-600">Err</th>
                                        <th className="p-3 bg-blue-50 border-l border-gray-200 text-gray-900">Dig Eff</th><th className="p-3 bg-blue-50 text-gray-900">Exc</th><th className="p-3 bg-blue-50 text-red-600">Err</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 text-gray-900">
                                    {[...sheetData.rowsA, ...sheetData.rowsB].filter(r => bucketFromPosition(r.player.position) === "L").map((r, i) => (
                                        <tr key={i} className="hover:bg-gray-50 transition-colors text-gray-900">
                                            <td className="p-3 text-left font-bold text-gray-900">#{r.player.jerseyNumber} {r.player.name}</td>
                                            <td className="p-3 font-black text-orange-700 border-l border-gray-100 bg-orange-50/30">{calcEff(r.stats.receive.exc, r.stats.receive.error, r.stats.receive.total)}</td>
                                            <td className="p-3 text-green-600 font-bold">{r.stats.receive.exc}</td>
                                            <td className="p-3 text-red-500 font-medium">{r.stats.receive.error}</td>
                                            <td className="p-3 font-black text-blue-700 border-l border-gray-100 bg-blue-50/30">{calcEff(r.stats.dig.exc, r.stats.dig.error, r.stats.dig.total)}</td>
                                            <td className="p-3 text-green-600 font-bold">{r.stats.dig.exc}</td>
                                            <td className="p-3 text-red-500 font-medium">{r.stats.dig.error}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
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