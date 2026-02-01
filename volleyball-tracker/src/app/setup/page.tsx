"use client";

import { useMatchStore } from "@/store/matchStore";
import { useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Position, TeamId, Player } from "@/lib/volleyball";

const POSITIONS: Position[] = ["WS", "MB", "S", "L"];

export default function SetupPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const players = useMatchStore((s) => s.players);
  const addPlayer = useMatchStore((s) => s.addPlayer);
  const updatePlayer = useMatchStore((s) => s.updatePlayer);
  const removePlayer = useMatchStore((s) => s.removePlayer);
  const setPlayers = useMatchStore((s) => s.setPlayers);

  const teamA = useMemo(() => players.filter((p) => p.teamId === "A"), [players]);
  const teamB = useMemo(() => players.filter((p) => p.teamId === "B"), [players]);

  const rosterReady = teamA.length >= 6 && teamB.length >= 6;

  function add(teamId: TeamId) {
    addPlayer({
      id: crypto.randomUUID(),
      teamId,
      name: "",
      jerseyNumber: 0,
      position: "WS",
    });
  }

  function jerseyDuplicate(teamId: TeamId, jersey: number, id: string) {
    if (!jersey) return false;
    return players.some(
      (p) => p.teamId === teamId && p.jerseyNumber === jersey && p.id !== id
    );
  }

  /* ------------------ JSON EXPORT ------------------ */
  function exportJSON() {
    const blob = new Blob([JSON.stringify(players, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "volleyball-roster.json";
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

        // Basic validation
        const valid = parsed.every(
          (p) =>
            typeof p.id === "string" &&
            (p.teamId === "A" || p.teamId === "B") &&
            typeof p.name === "string" &&
            typeof p.jerseyNumber === "number" &&
            POSITIONS.includes(p.position)
        );

        if (!valid) {
          alert("Invalid player format in JSON.");
          return;
        }

        setPlayers(parsed as Player[]);
      } catch {
        alert("Failed to parse JSON file.");
      }
    };

    reader.readAsText(file);
  }

  return (
    <main className="min-h-screen bg-[var(--background)] p-6">
      <div className="max-w-6xl mx-auto">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <h1 className="text-2xl font-extrabold text-black">Roster Setup</h1>

          <div className="flex gap-2">
            <button
              onClick={exportJSON}
              className="px-4 py-2 rounded-lg bg-white text-black shadow hover:shadow-md font-semibold"
            >
              Export JSON
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded-lg bg-white text-black shadow hover:shadow-md font-semibold"
            >
              Import JSON
            </button>

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

            <button
              onClick={() => router.push("/")}
              className="px-4 py-2 rounded-lg bg-white text-black shadow hover:shadow-md font-semibold"
            >
              Back to Court
            </button>
          </div>
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
          />

          <TeamPanel
            title="Team B"
            teamId="B"
            players={teamB}
            onAdd={() => add("B")}
            onUpdate={updatePlayer}
            onRemove={removePlayer}
            jerseyDuplicate={jerseyDuplicate}
          />
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-black">
            {rosterReady ? (
              <span className="text-emerald-600 font-semibold">
                ✓ Both teams have at least 6 players.
              </span>
            ) : (
              <span>Add at least <b>6 players per team</b> to start.</span>
            )}
          </div>

          <button
            onClick={() => router.push("/")}
            disabled={!rosterReady}
            className={[
              "px-5 py-3 rounded-lg font-semibold shadow",
              rosterReady
                ? "bg-[var(--brand-sky)] text-white hover:opacity-90"
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

/* ------------------ TEAM PANEL ------------------ */

function TeamPanel({
  title,
  teamId,
  players,
  onAdd,
  onUpdate,
  onRemove,
  jerseyDuplicate,
}: {
  title: string;
  teamId: TeamId;
  players: Player[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<Player>) => void;
  onRemove: (id: string) => void;
  jerseyDuplicate: (teamId: TeamId, jersey: number, id: string) => boolean;
}) {
  return (
    <section className="bg-white rounded-xl shadow p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-extrabold text-lg text-black">{title}</h2>

        <button
          onClick={onAdd}
          className="px-3 py-2 rounded-lg bg-[var(--brand-sky)] text-white text-sm font-semibold shadow"
        >
          + Add Player
        </button>
      </div>

      <div className="space-y-3">
        {players.map((p) => {
          const dup = jerseyDuplicate(teamId, p.jerseyNumber, p.id);

          return (
            <div key={p.id} className="grid grid-cols-[1fr_90px_90px_auto] gap-2 items-center">
              <input
                value={p.name}
                placeholder="Name"
                onChange={(e) => onUpdate(p.id, { name: e.target.value })}
                className="border rounded-lg px-3 py-2 bg-white text-black"
              />

              <input
                type="number"
                value={p.jerseyNumber || ""}
                placeholder="#"
                onChange={(e) =>
                  onUpdate(p.id, { jerseyNumber: Number(e.target.value) })
                }
                className={[
                  "border rounded-lg px-3 py-2 bg-white text-black",
                  dup ? "border-red-500" : "",
                ].join(" ")}
              />

              <select
                value={p.position}
                onChange={(e) =>
                  onUpdate(p.id, { position: e.target.value as Position })
                }
                className="border rounded-lg px-3 py-2 bg-white text-black"
              >
                {POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>

              <button
                onClick={() => onRemove(p.id)}
                className="text-red-600 font-bold"
              >
                ✕
              </button>

              {dup && (
                <div className="col-span-4 text-xs text-red-600">
                  Jersey number must be unique within the team.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
