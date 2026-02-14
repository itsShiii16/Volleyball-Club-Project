"use client";

import { useMatchStore } from "@/store/matchStore";
import { useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Position, TeamId, Player } from "@/lib/volleyball";

// ✅ Updated positions
const POSITIONS: Position[] = ["OH", "OPP", "MB", "S", "L"];

const LEGACY_POSITIONS = new Set(["WS"]);
const ALL_IMPORT_POSITIONS = new Set<string>([
  ...POSITIONS,
  ...Array.from(LEGACY_POSITIONS),
]);

function normalizeImportedPosition(pos: unknown): Position | null {
  const p = String(pos ?? "").trim().toUpperCase();
  if (!ALL_IMPORT_POSITIONS.has(p)) return null;
  if (p === "WS") return "OH";
  return p as Position;
}

export default function SetupPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const targetTeamRef = useRef<TeamId | null>(null);

  const players = useMatchStore((s) => s.players);
  const addPlayer = useMatchStore((s) => s.addPlayer);
  const updatePlayer = useMatchStore((s) => s.updatePlayer);
  const removePlayer = useMatchStore((s) => s.removePlayer);
  const setPlayers = useMatchStore((s) => s.setPlayers);

  // ✅ Libero auto-sub config
  const liberoConfigA = useMatchStore((s) => s.liberoConfigA);
  const liberoConfigB = useMatchStore((s) => s.liberoConfigB);
  const setLiberoConfig = useMatchStore((s) => s.setLiberoConfig);

  // ✅ FEATURE: Initialize 15 slots per team if empty
  useEffect(() => {
    if (players.length === 0) {
      const initialRoster: Player[] = [];
      (["A", "B"] as TeamId[]).forEach((tId) => {
        for (let i = 0; i < 15; i++) {
          initialRoster.push({
            id: crypto.randomUUID(),
            teamId: tId,
            name: "",
            jerseyNumber: 0,
            position: "OH",
          });
        }
      });
      setPlayers(initialRoster);
    }
  }, [players.length, setPlayers]);

  const teamA = useMemo(
    () => players.filter((p) => p.teamId === "A").sort((a, b) => a.jerseyNumber - b.jerseyNumber),
    [players]
  );
  const teamB = useMemo(
    () => players.filter((p) => p.teamId === "B").sort((a, b) => a.jerseyNumber - b.jerseyNumber),
    [players]
  );

  const rosterReady = teamA.filter(p => p.name.trim() !== "").length >= 6 && 
                      teamB.filter(p => p.name.trim() !== "").length >= 6;

  function add(teamId: TeamId) {
    addPlayer({
      id: crypto.randomUUID(),
      teamId,
      name: "",
      jerseyNumber: 0,
      position: "OH",
    });
  }

  // ✅ FEATURE: Clear all players from a team
  function clearTeam(teamId: TeamId) {
    if (confirm(`Clear all names and data for Team ${teamId}?`)) {
      const otherTeam = players.filter(p => p.teamId !== teamId);
      const blanks: Player[] = Array.from({ length: 15 }, () => ({
        id: crypto.randomUUID(),
        teamId,
        name: "",
        jerseyNumber: 0,
        position: "OH"
      }));
      setPlayers([...otherTeam, ...blanks]);
    }
  }

  function jerseyDuplicate(teamId: TeamId, jersey: number, id: string) {
    if (!jersey || jersey === 0) return false;
    return players.some(
      (p) => p.teamId === teamId && p.jerseyNumber === jersey && p.id !== id
    );
  }

  function handleImportClick(teamId: TeamId) {
    targetTeamRef.current = teamId;
    fileInputRef.current?.click();
  }

  /* ------------------ JSON EXPORT ------------------ */
  function exportJSON(teamId?: TeamId) {
    const dataToExport = teamId 
      ? players.filter((p) => p.teamId === teamId && p.name !== "")
      : players.filter(p => p.name !== "");

    if (dataToExport.length === 0) {
        alert("No valid players to export.");
        return;
    }

    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = teamId ? `roster-team-${teamId}.json` : "roster-full.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ------------------ JSON IMPORT ------------------ */
  function importJSON(file: File) {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);

        if (!Array.isArray(parsed)) {
          alert("Invalid JSON: expected an array of players.");
          return;
        }

        const targetTeam = targetTeamRef.current;
        if (!targetTeam) return;

        const newPlayers: Player[] = [];

        for (const raw of parsed) {
          const id = crypto.randomUUID(); 
          const name = String(raw?.name ?? "");
          const jerseyNumber = Number(raw?.jerseyNumber ?? NaN);
          const pos = normalizeImportedPosition(raw?.position);

          if (!Number.isFinite(jerseyNumber) || !pos) continue;

          newPlayers.push({ id, teamId: targetTeam, name, jerseyNumber, position: pos });
        }

        const otherTeamPlayers = players.filter(p => p.teamId !== targetTeam);
        setPlayers([...otherTeamPlayers, ...newPlayers]);

      } catch {
        alert("Failed to parse JSON file.");
      } finally {
        targetTeamRef.current = null;
      }
    };

    reader.readAsText(file);
  }

  const btnSecondary = "px-3 py-2 rounded-lg bg-white text-black shadow hover:shadow-md font-semibold border border-gray-200 transition-all text-xs sm:text-sm";

  return (
    <main className="min-h-screen bg-[var(--background)] p-6">
      <div className="max-w-6xl mx-auto pb-20">
        {/* Top bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
          <h1 className="text-2xl font-extrabold text-black">Roster Setup</h1>

          <div className="flex flex-wrap gap-2 justify-center">
            <div className="flex gap-1">
                <button onClick={() => exportJSON("A")} className={btnSecondary} title="Export Team A Roster">
                ⬇️ Export A
                </button>
                <button onClick={() => exportJSON("B")} className={btnSecondary} title="Export Team B Roster">
                ⬇️ Export B
                </button>
            </div>

            <div className="w-px h-8 bg-gray-300 mx-1 hidden sm:block"></div>

            <div className="flex gap-1">
                <button onClick={() => handleImportClick("A")} className={btnSecondary} title="Import Roster into Team A">
                ⬆️ Import A
                </button>
                <button onClick={() => handleImportClick("B")} className={btnSecondary} title="Import Roster into Team B">
                ⬆️ Import B
                </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importJSON(file);
                e.target.value = "";
              }}
            />

            <div className="w-px h-8 bg-gray-300 mx-1 hidden sm:block"></div>

            <button onClick={() => router.push("/")} className={`${btnSecondary} bg-gray-100`}>
              Back to Court
            </button>
          </div>
        </div>

        {/* ✅ Libero Auto-Sub Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <LiberoAutoSubCard
            title="Libero Setup (Team A)"
            teamId="A"
            players={teamA}
            config={liberoConfigA}
            setConfig={setLiberoConfig}
          />
          <LiberoAutoSubCard
            title="Libero Setup (Team B)"
            teamId="B"
            players={teamB}
            config={liberoConfigB}
            setConfig={setLiberoConfig}
          />
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <TeamPanel
            title="Team A"
            teamId="A"
            players={teamA}
            onAdd={() => add("A")}
            onUpdate={updatePlayer}
            onRemove={removePlayer}
            jerseyDuplicate={jerseyDuplicate}
            onClear={() => clearTeam("A")}
          />

          <TeamPanel
            title="Team B"
            teamId="B"
            players={teamB}
            onAdd={() => add("B")}
            onUpdate={updatePlayer}
            onRemove={removePlayer}
            jerseyDuplicate={jerseyDuplicate}
            onClear={() => clearTeam("B")}
          />
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-black">
            {rosterReady ? (
              <span className="text-emerald-600 font-semibold">
                ✓ Ready to play.
              </span>
            ) : (
              <span>
                Input at least <b>6 players per team</b> to start.
              </span>
            )}
          </div>

          <button
            onClick={() => router.push("/")}
            disabled={!rosterReady}
            className={[
              "px-5 py-3 rounded-lg font-semibold shadow transition",
              rosterReady
                ? "bg-sky-500 text-white hover:opacity-90"
                : "bg-gray-300 text-gray-600 cursor-not-allowed",
            ].join(" ")}
          >
            Done
          </button>
        </div>
      </div>
    </main>
  );
}

/* ------------------ LIBERO AUTO-SUB CARD ------------------ */

function LiberoAutoSubCard({
  title,
  teamId,
  players,
  config,
  setConfig,
}: {
  title: string;
  teamId: TeamId;
  players: Player[];
  config: any;
  setConfig: (teamId: TeamId, cfg: any) => void;
}) {
  const liberoOptions = players.filter((p) => ["L", "LIBERO"].includes(String(p.position).toUpperCase()));
  
  const replacementOptions = players.filter((p) => {
      const pos = String(p.position).toUpperCase();
      return ["MB", "MIDDLE", "OH", "OUTSIDE", "OPP", "OPPOSITE"].some(valid => pos.includes(valid));
  });

  const enabled = config?.enabled ?? false;
  const mode = config?.mode ?? "CLASSIC";
  
  const rawLiberoId = config?.liberoId ?? null;
  const liberoId = players.some(p => p.id === rawLiberoId) ? rawLiberoId : null;

  const rawReplacementIds = Array.isArray(config?.replacementIds) ? config!.replacementIds : [];
  const replacementIds = rawReplacementIds.filter((id: string) => players.some(p => p.id === id));

  function toggleReplacement(id: string) {
    const current = [...replacementIds];
    const exists = current.includes(id);

    let next: string[];
    if (exists) {
      next = current.filter((x) => x !== id);
    } else {
      if (current.length >= 2) return;
      next = [...current, id];
    }
    setConfig(teamId, { replacementIds: next });
  }

  return (
    <section className="bg-white rounded-xl shadow p-4 border border-gray-200">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-extrabold text-lg text-black">{title}</h2>

        <label className="flex items-center gap-2 text-sm font-semibold text-black cursor-pointer select-none">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setConfig(teamId, { enabled: e.target.checked })}
            className="w-4 h-4 text-sky-600 rounded focus:ring-sky-500"
          />
          Enable
        </label>
      </div>

      {/* Dual Libero Mode Toggle */}
      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg">
        <button 
          onClick={() => setConfig(teamId, { mode: "CLASSIC" })}
          className={`flex-1 py-1.5 text-[10px] font-black rounded-md transition-all ${mode === "CLASSIC" ? "bg-white shadow text-black" : "text-gray-400"}`}
        >
          CLASSIC
        </button>
        <button 
          onClick={() => setConfig(teamId, { mode: "DUAL" })}
          className={`flex-1 py-1.5 text-[10px] font-black rounded-md transition-all ${mode === "DUAL" ? "bg-white shadow text-black" : "text-gray-400"}`}
        >
          DUAL LIBERO
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3">
        <div>
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
            {mode === "DUAL" ? "Receiving Libero (Loss of Point)" : "Primary Libero"}
          </div>
          <select
            value={liberoId ?? ""}
            onChange={(e) => setConfig(teamId, { liberoId: e.target.value || null })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-white text-black font-semibold text-sm"
          >
            <option value="">— Select —</option>
            {liberoOptions.map((p) => (
              <option key={p.id} value={p.id}>
                #{p.jerseyNumber} {p.name || "(No name)"}
              </option>
            ))}
          </select>
        </div>

        {mode === "DUAL" && (
          <div>
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
              Digging Libero (On Serve)
            </div>
            <select
              value={config?.secondLiberoId ?? ""}
              onChange={(e) => setConfig(teamId, { secondLiberoId: e.target.value || null })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-white text-black font-semibold text-sm"
            >
              <option value="">— Select —</option>
              {liberoOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.jerseyNumber} {p.name || "(No name)"}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Replacements (Select 2)</div>

          <div className="flex flex-wrap gap-2">
            {replacementOptions.map((p) => {
              const checked = replacementIds.includes(p.id);
              const disabled = !checked && replacementIds.length >= 2;

              return (
                <button
                  key={p.id}
                  disabled={disabled}
                  onClick={() => toggleReplacement(p.id)}
                  // ✅ Layout Retained: Button style updated to show surname
                  className={`px-3 py-2 rounded-lg border text-[10px] font-bold transition-all text-left flex flex-col justify-center min-w-[80px] ${
                    checked 
                      ? "bg-sky-500 border-sky-600 text-white shadow-sm" 
                      : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                  } ${disabled ? "opacity-30 cursor-not-allowed" : ""}`}
                >
                  <span className="opacity-70">#{p.jerseyNumber} {p.position}</span>
                  {/* ✅ FEATURE: Surnames displayed here */}
                  <span className="uppercase truncate w-full">{p.name || "EMPTY"}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-2 text-[10px] font-bold text-gray-400 uppercase">
            Selection: <span className={replacementIds.length === 2 ? "text-emerald-500" : "text-amber-500"}>{replacementIds.length}/2</span>
          </div>
        </div>
      </div>
    </section>
  );
}
/* ------------------ TEAM PANEL ------------------ */

function TeamPanel({
  title,
  teamId,
  players,
  onAdd,
  onUpdate,
  onRemove,
  jerseyDuplicate,
  onClear,
}: {
  title: string;
  teamId: TeamId;
  players: Player[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<Player>) => void;
  onRemove: (id: string) => void;
  jerseyDuplicate: (teamId: TeamId, jersey: number, id: string) => boolean;
  onClear: () => void;
}) {
  return (
    <section className="bg-white rounded-xl shadow p-4 border border-gray-200 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-extrabold text-lg text-black">{title}</h2>

        <button
          onClick={onAdd}
          className="px-3 py-1.5 rounded-lg bg-sky-500 text-white text-xs font-bold shadow hover:opacity-90 transition-all"
        >
          + Add Slot
        </button>
      </div>

      <div className="space-y-2 flex-1 overflow-y-auto max-h-[600px] pr-1 scrollbar-hide">
        {players.map((p) => {
          const dup = jerseyDuplicate(teamId, p.jerseyNumber, p.id);

          return (
            <div
              key={p.id}
              className="grid grid-cols-[1fr_50px_70px_30px] gap-2 items-center"
            >
              <input
                value={p.name}
                placeholder="Player Name"
                onChange={(e) => onUpdate(p.id, { name: e.target.value })}
                className="border border-gray-200 rounded-lg px-2 py-2 bg-white text-black text-sm font-semibold focus:border-sky-300 outline-none transition-all"
              />

              <input
                type="number"
                value={p.jerseyNumber || ""}
                placeholder="#"
                onChange={(e) => onUpdate(p.id, { jerseyNumber: Number(e.target.value) })}
                className={`border rounded-lg px-1 py-2 bg-white text-black text-center text-sm font-bold focus:ring-1 focus:ring-sky-300 outline-none transition-all ${
                  dup ? "border-red-500 bg-red-50" : "border-gray-200"
                }`}
              />

              <select
                value={p.position}
                onChange={(e) => onUpdate(p.id, { position: e.target.value as Position })}
                className="border border-gray-200 rounded-lg px-1 py-2 bg-white text-black text-xs font-bold focus:border-sky-300 outline-none transition-all"
              >
                {POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>

              <button 
                onClick={() => onRemove(p.id)} 
                className="text-gray-300 hover:text-red-500 transition-colors flex justify-center"
              >
                ✕
              </button>

              {dup && (
                <div className="col-span-4 text-[9px] text-red-500 font-black uppercase tracking-tighter -mt-1 pl-1">
                  Jersey Number is taken
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ✅ FEATURE: Clear Team Button */}
      <button 
        onClick={onClear}
        className="mt-6 w-full py-2.5 rounded-xl border-2 border-dashed border-red-100 text-red-400 text-[10px] font-black uppercase tracking-widest hover:bg-red-50 hover:border-red-200 transition-all"
      >
        Clear All Team {teamId} Players
      </button>
    </section>
  );
}