"use client";

import { useMemo } from "react";
import { useMatchStore } from "@/store/matchStore";

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit" });

export default function MatchSummaryModal() {
  const open = useMatchStore((s) => s.matchSummaryOpen);
  const close = useMatchStore((s) => s.closeMatchSummary);

  const savedSets = useMatchStore((s) => s.savedSets);
  const players = useMatchStore((s) => s.players);

  const summary = useMemo(() => {
    const setsWonA = savedSets.filter((s) => s.winner === "A").length;
    const setsWonB = savedSets.filter((s) => s.winner === "B").length;

    // Aggregate pog points (if perPlayer exists)
    const totals: Record<string, number> = {};
    for (const set of savedSets) {
      if (!set.perPlayer) continue;
      for (const [pid, data] of Object.entries(set.perPlayer)) {
        totals[pid] = (totals[pid] ?? 0) + (data.pogPoints ?? 0);
      }
    }

    const ranked = Object.entries(totals)
      .map(([playerId, points]) => {
        const p = players.find((x) => x.id === playerId);
        return {
          playerId,
          points,
          teamId: p?.teamId ?? "?",
          name: p?.name ?? "Unknown",
          jersey: p?.jerseyNumber ?? "",
          position: p?.position ?? "",
        };
      })
      .sort((a, b) => b.points - a.points);

    const pog = ranked[0] ?? null;

    const teamA = ranked.filter((r) => r.teamId === "A");
    const teamB = ranked.filter((r) => r.teamId === "B");

    return { setsWonA, setsWonB, ranked, teamA, teamB, pog };
  }, [savedSets, players]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <button
        aria-label="Close match summary"
        onClick={close}
        className="absolute inset-0 bg-black/50"
      />

      {/* Modal */}
      <div className="relative w-full max-w-4xl rounded-3xl bg-white text-black shadow-2xl border overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <div className="text-xs font-black tracking-wide text-gray-500">
              MATCH SUMMARY
            </div>
            <div className="text-2xl font-black">
              Sets: {summary.setsWonA} - {summary.setsWonB}
            </div>
            <div className="text-sm text-gray-600">
              Saved sets: {savedSets.length}
            </div>
          </div>

          <button
            onClick={close}
            className="rounded-xl px-3 py-2 font-black bg-gray-100 hover:bg-gray-200"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4 p-6">
          {/* Left: Sets list */}
          <div className="rounded-2xl border bg-gray-50 p-4">
            <div className="font-black text-sm mb-3">SETS</div>

            {savedSets.length === 0 ? (
              <div className="text-sm text-gray-600">
                No saved sets yet. Finish a set to see it here.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {savedSets
                  .slice()
                  .sort((a, b) => a.setNumber - b.setNumber)
                  .map((s) => (
                    <div
                      key={s.id}
                      className="rounded-xl bg-white border px-4 py-3 flex items-center justify-between"
                    >
                      <div className="flex flex-col">
                        <div className="font-extrabold">
                          Set {s.setNumber} • {s.pointsToWin}
                        </div>
                        <div className="text-xs text-gray-500">
                          {fmtTime(s.ts)}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-black text-lg">
                          {s.finalScoreA} - {s.finalScoreB}
                        </div>
                        <div className="text-xs font-bold text-gray-600">
                          Winner: {s.winner}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Right: POG + Rankings */}
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border bg-gray-50 p-4">
              <div className="font-black text-sm mb-3">PLAYER OF THE GAME</div>

              {!summary.pog ? (
                <div className="text-sm text-gray-600">
                  POG will appear after at least one saved set (with per-player points).
                </div>
              ) : (
                <div className="rounded-2xl bg-white border p-4 flex items-center justify-between">
                  <div>
                    <div className="text-xl font-black">
                      #{summary.pog.jersey} {summary.pog.name}
                    </div>
                    <div className="text-sm text-gray-600">
                      Team {summary.pog.teamId} • {summary.pog.position}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-black">
                      {summary.pog.points.toFixed(1)}
                    </div>
                    <div className="text-xs font-bold text-gray-600">
                      points
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border bg-gray-50 p-4">
              <div className="font-black text-sm mb-3">RANKINGS</div>

              {summary.ranked.length === 0 ? (
                <div className="text-sm text-gray-600">
                  Rankings appear once per-player points are computed in saved sets.
                </div>
              ) : (
                <div className="max-h-[320px] overflow-auto rounded-xl bg-white border">
                  {summary.ranked.map((r, idx) => (
                    <div
                      key={r.playerId}
                      className="px-4 py-3 border-b last:border-b-0 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 text-center font-black text-gray-500">
                          {idx + 1}
                        </div>
                        <div>
                          <div className="font-extrabold">
                            #{r.jersey} {r.name}
                          </div>
                          <div className="text-xs text-gray-600">
                            Team {r.teamId} • {r.position}
                          </div>
                        </div>
                      </div>

                      <div className="font-black">
                        {r.points.toFixed(1)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between">
          <div className="text-xs text-gray-600">
            This summary persists on refresh and clears only when you press <b>Reset Match</b>.
          </div>
          <button
            onClick={close}
            className="rounded-xl px-5 py-2 font-black bg-gray-900 text-white hover:opacity-90"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
