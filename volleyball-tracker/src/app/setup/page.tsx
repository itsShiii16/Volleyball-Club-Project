"use client";

import { useMatchStore } from "@/store/matchStore";
import { useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Position, TeamId, Player } from "@/lib/volleyball";

// ✅ Updated positions per your new spec
const POSITIONS: Position[] = ["OH", "OPP", "MB", "S", "L"];

// ✅ allow legacy values on import
const LEGACY_POSITIONS = new Set(["WS"]);
const ALL_IMPORT_POSITIONS = new Set<string>([
  ...POSITIONS,
  ...Array.from(LEGACY_POSITIONS),
]);

function normalizeImportedPosition(pos: unknown): Position | null {
  const p = String(pos ?? "").trim().toUpperCase();
  if (!ALL_IMPORT_POSITIONS.has(p)) return null;

  // Convert legacy "WS" -> "OH"
  if (p === "WS") return "OH";

  // Cast safe (since POSITIONS union includes only allowed)
  return p as Position;
}

export default function SetupPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const players = useMatchStore((s) => s.players);
  const addPlayer = useMatchStore((s) => s.addPlayer);
  const updatePlayer = useMatchStore((s) => s.updatePlayer);
  const removePlayer = useMatchStore((s) => s.removePlayer);
  const setPlayers = useMatchStore((s) => s.setPlayers);

  // ✅ Libero auto-sub config
  const liberoConfigA = useMatchStore((s) => s.liberoConfigA);
  const liberoConfigB = useMatchStore((s) => s.liberoConfigB);
  const setLiberoConfig = useMatchStore((s) => s.setLiberoConfig);

  const teamA = useMemo(() => players.filter((p) => p.teamId === "A"), [players]);
  const teamB = useMemo(() => players.filter((p) => p.teamId === "B"), [players]);

  const rosterReady = teamA.length >= 6 && teamB.length >= 6;

  function add(teamId: TeamId) {
    addPlayer({
      id: crypto.randomUUID(),
      teamId,
      name: "",
      jerseyNumber: 0,
      position: "OH", // ✅ default is now OH
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

        const next: Player[] = [];

        for (const raw of parsed) {
          const id = String(raw?.id ?? "");
          const teamId = raw?.teamId;
          const name = String(raw?.name ?? "");
          const jerseyNumber = Number(raw?.jerseyNumber ?? NaN);
          const pos = normalizeImportedPosition(raw?.position);

          if (!id) {
            alert("Invalid player: missing id.");
            return;
          }
          if (teamId !== "A" && teamId !== "B") {
            alert("Invalid player: teamId must be A or B.");
            return;
          }
          if (!Number.isFinite(jerseyNumber)) {
            alert("Invalid player: jerseyNumber must be a number.");
            return;
          }
          if (!pos) {
            alert(
              `Invalid player position found: "${raw?.position}". Allowed: ${[
                ...POSITIONS,
                "WS (legacy)",
              ].join(", ")}`
            );
            return;
          }

          next.push({
            id,
            teamId,
            name,
            jerseyNumber,
            position: pos,
          });
        }

        setPlayers(next);
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

        {/* ✅ Libero Auto-Sub Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <LiberoAutoSubCard
            title="Libero Auto-Sub (Team A)"
            teamId="A"
            players={teamA}
            config={liberoConfigA}
            setConfig={setLiberoConfig}
          />
          <LiberoAutoSubCard
            title="Libero Auto-Sub (Team B)"
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
              <span>
                Add at least <b>6 players per team</b> to start.
              </span>
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
  config: { enabled: boolean; liberoId: string | null; mbIds: string[] } | null;
  setConfig: (
    teamId: TeamId,
    cfg: Partial<{ enabled: boolean; liberoId: string | null; mbIds: string[] }>
  ) => void;
}) {
  const liberoOptions = players.filter((p) => String(p.position).toUpperCase() === "L");
  const mbOptions = players.filter((p) => String(p.position).toUpperCase() === "MB");

  const enabled = config?.enabled ?? false;
  const liberoId = config?.liberoId ?? null;
  const mbIds = Array.isArray(config?.mbIds) ? config!.mbIds : [];

  function toggleMb(id: string) {
    const current = Array.isArray(mbIds) ? mbIds : [];
    const exists = current.includes(id);

    let next: string[];
    if (exists) next = current.filter((x) => x !== id);
    else next = [...current, id].slice(0, 2);

    setConfig(teamId, { mbIds: next });
  }

  return (
    <section className="bg-white rounded-xl shadow p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-extrabold text-lg text-black">{title}</h2>

        <label className="flex items-center gap-2 text-sm font-semibold text-black">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setConfig(teamId, { enabled: e.target.checked })}
          />
          Enable
        </label>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3">
        <div>
          <div className="text-xs font-bold text-black/60 mb-1">Choose Libero</div>
          <select
            value={liberoId ?? ""}
            onChange={(e) => setConfig(teamId, { liberoId: e.target.value || null })}
            className="w-full border rounded-lg px-3 py-2 bg-white text-black"
          >
            <option value="">— Select Libero —</option>
            {liberoOptions.map((p) => (
              <option key={p.id} value={p.id}>
                #{p.jerseyNumber} {p.name || "(No name)"} • {p.position}
              </option>
            ))}
          </select>

          {liberoOptions.length === 0 && (
            <div className="mt-1 text-xs text-amber-700 font-semibold">
              Add at least one player with position <b>L</b>.
            </div>
          )}
        </div>

        <div>
          <div className="text-xs font-bold text-black/60 mb-2">Choose 2 Middle Blockers</div>

          {mbOptions.length === 0 ? (
            <div className="mt-1 text-xs text-amber-700 font-semibold">
              Add at least two players with position <b>MB</b>.
            </div>
          ) : (
            <div className="grid gap-2">
              {mbOptions.map((p) => {
                const checked = mbIds.includes(p.id);
                const disableUnchecked = !checked && mbIds.length >= 2;

                return (
                  <label
                    key={p.id}
                    className={[
                      "flex items-center gap-2 rounded-lg border bg-white px-3 py-2",
                      checked ? "border-teal-400" : "border-black/10",
                      disableUnchecked ? "opacity-60" : "cursor-pointer",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disableUnchecked}
                      onChange={() => toggleMb(p.id)}
                    />
                    <div className="flex-1 text-sm font-semibold text-black truncate">
                      #{p.jerseyNumber} {p.name || "(No name)"}
                    </div>
                    <div className="text-xs font-extrabold text-black/60">MB</div>
                  </label>
                );
              })}
            </div>
          )}

          <div className="mt-2 text-xs text-black/60 font-semibold">
            Selected:{" "}
            <b className={mbIds.length === 2 ? "text-black" : "text-amber-700"}>
              {mbIds.length}/2
            </b>
          </div>
        </div>

        <div className="text-xs text-black/60 font-semibold leading-snug">
          Auto-sub will swap your selected <b>Libero</b> in for whichever selected <b>MB</b> reaches
          the <b>back row (1/5/6)</b>, and swap that MB back when rotating to the{" "}
          <b>front row (2/3/4)</b>.
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
            <div
              key={p.id}
              className="grid grid-cols-[1fr_90px_90px_auto] gap-2 items-center"
            >
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
                onChange={(e) => onUpdate(p.id, { jerseyNumber: Number(e.target.value) })}
                className={[
                  "border rounded-lg px-3 py-2 bg-white text-black",
                  dup ? "border-red-500" : "",
                ].join(" ")}
              />

              <select
                value={p.position}
                onChange={(e) => onUpdate(p.id, { position: e.target.value as Position })}
                className="border rounded-lg px-3 py-2 bg-white text-black"
              >
                {POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>

              <button onClick={() => onRemove(p.id)} className="text-red-600 font-bold">
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
