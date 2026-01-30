"use client";

import { useMatchStore } from "@/store/matchStore";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Position, TeamId, Player } from "@/lib/volleyball";

const POSITIONS: Position[] = ["WS", "MB", "S", "L"];

export default function SetupPage() {
  const router = useRouter();

  const players = useMatchStore((s) => s.players);
  const addPlayer = useMatchStore((s) => s.addPlayer);
  const updatePlayer = useMatchStore((s) => s.updatePlayer);
  const removePlayer = useMatchStore((s) => s.removePlayer);

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
    return players.some((p) => p.teamId === teamId && p.jerseyNumber === jersey && p.id !== id);
  }

  return (
    <main className="min-h-screen bg-[var(--background)] p-6">
      <div className="max-w-6xl mx-auto">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <h1 className="text-2xl font-extrabold text-white drop-shadow">Roster Setup</h1>

          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 rounded-lg bg-white text-black shadow hover:shadow-md font-semibold"
          >
            Back to Court
          </button>
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

        {/* Footer row */}
        <div className="mt-6 flex items-center justify-between gap-3">
          <div className="text-sm text-white/85">
            {rosterReady ? (
              <span className="text-emerald-200 font-semibold">
                ✓ Both teams have at least 6 players.
              </span>
            ) : (
              <span>
                Add at least <b className="text-white">6 players per team</b> to start a match.
              </span>
            )}
          </div>

          <button
            onClick={() => router.push("/")}
            className={[
              "px-5 py-3 rounded-lg font-semibold shadow",
              rosterReady
                ? "bg-[var(--brand-sky)] text-white hover:opacity-90"
                : "bg-white/50 text-white/70 cursor-not-allowed",
            ].join(" ")}
            disabled={!rosterReady}
            title={!rosterReady ? "Need at least 6 players per team" : "Go to court"}
          >
            Done
          </button>
        </div>
      </div>
    </main>
  );
}

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
          className="px-3 py-2 rounded-lg bg-[var(--brand-sky)] text-white hover:opacity-90 text-sm font-semibold shadow"
        >
          + Add Player
        </button>
      </div>

      <div className="space-y-3">
        {players.length === 0 && (
          <div className="text-sm text-black/70">
            No players yet. Click <b>+ Add Player</b>.
          </div>
        )}

        {players.map((p) => {
          const dup = jerseyDuplicate(teamId, p.jerseyNumber, p.id);

          return (
            <div key={p.id} className="grid grid-cols-[1fr_90px_90px_auto] gap-2 items-center">
              <input
                value={p.name}
                placeholder="Name"
                onChange={(e) => onUpdate(p.id, { name: e.target.value })}
                className="border rounded-lg px-3 py-2 bg-white text-black
                           placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-300"
              />

              <input
                type="number"
                value={p.jerseyNumber || ""}
                placeholder="#"
                onChange={(e) => onUpdate(p.id, { jerseyNumber: Number(e.target.value) })}
                className={[
                  "border rounded-lg px-3 py-2 bg-white text-black placeholder:text-gray-400",
                  "focus:outline-none focus:ring-2 focus:ring-sky-300",
                  dup ? "border-red-500 ring-2 ring-red-200" : "",
                ].join(" ")}
              />

              <select
                value={p.position}
                onChange={(e) => onUpdate(p.id, { position: e.target.value as Position })}
                className="border rounded-lg px-3 py-2 bg-white text-black
                           focus:outline-none focus:ring-2 focus:ring-sky-300"
              >
                {POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>

              <button
                onClick={() => onRemove(p.id)}
                className="px-2 py-2 rounded-lg text-red-600 hover:bg-red-50 font-bold"
                title="Remove"
              >
                ✕
              </button>

              {dup && (
                <div className="col-span-4 text-xs text-red-600 -mt-1">
                  Jersey number must be unique within the team.
                </div>
              )}
            </div>
          );
        })}

        {players.length > 0 && players.length < 6 && (
          <div className="text-xs text-black/60">
            Minimum <b>6 players</b> required.
          </div>
        )}
      </div>
    </section>
  );
}
