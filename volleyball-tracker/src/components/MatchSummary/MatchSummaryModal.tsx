"use client";

import { useMemo } from "react";
import { useMatchStore } from "@/store/matchStore";

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit" });

const normKey = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s-]+/g, "_");

type PosBucket = "OH" | "OPP" | "S" | "L" | "MB" | "OTHER";

/**
 * Best-effort mapping (works even if your Position type is still "WS|MB|S|L").
 * - WS => OH (default)
 * - if you later add "OH" / "OPP", this will separate them
 */
function bucketFromPosition(posRaw: unknown): PosBucket {
  const p = normKey(posRaw);
  if (p === "MB" || p.includes("MIDDLE")) return "MB";
  if (p === "S" || p.includes("SETTER")) return "S";
  if (p === "L" || p.includes("LIBERO")) return "L";
  if (p === "OPP" || p.includes("OPPOSITE") || p.includes("RIGHT_SIDE")) return "OPP";
  if (p === "OH" || p.includes("OUTSIDE") || p === "WS" || p.includes("WING")) return "OH";
  return "OTHER";
}

export default function MatchSummaryModal() {
  const open = useMatchStore((s) => s.matchSummaryOpen);
  const close = useMatchStore((s) => s.closeMatchSummary);

  const savedSets = useMatchStore((s) => s.savedSets);
  const players = useMatchStore((s) => s.players);

  const summary = useMemo(() => {
    const setsWonA = savedSets.filter((s) => s.winner === "A").length;
    const setsWonB = savedSets.filter((s) => s.winner === "B").length;

    // Aggregate pog points + action counts (if perPlayer exists)
    const totalsPog: Record<string, number> = {};
    const totalsCounts: Record<string, Record<string, number>> = {};

    // Individual "point credits" (kill/ace/block point/etc) + "errors conceded"
    // Uses InternalEvent.pointWinner + teamId (best-effort based on your current logger).
    const pointsWon: Record<string, number> = {};
    const pointsLost: Record<string, number> = {};

    for (const set of savedSets) {
      // 1) POG + counts
      if (set.perPlayer) {
        for (const [pid, data] of Object.entries(set.perPlayer)) {
          totalsPog[pid] = (totalsPog[pid] ?? 0) + Number(data?.pogPoints ?? 0);

          const counts = (data as any)?.counts ?? {};
          if (!totalsCounts[pid]) totalsCounts[pid] = {};
          for (const [k, v] of Object.entries(counts)) {
            totalsCounts[pid][k] = (totalsCounts[pid][k] ?? 0) + Number(v ?? 0);
          }
        }
      }

      // 2) Point credits (from events)
      const events = Array.isArray(set.events) ? set.events : [];
      for (const ev of events as any[]) {
        const pid = String(ev?.playerId ?? "");
        if (!pid) continue;

        const pw = ev?.pointWinner as "A" | "B" | undefined;
        const teamId = ev?.teamId as "A" | "B" | undefined;
        if (!pw || (pw !== "A" && pw !== "B")) continue;

        // If pointWinner === teamId, credit as "won point" for that player
        if (teamId && pw === teamId) {
          pointsWon[pid] = (pointsWon[pid] ?? 0) + 1;
        } else if (teamId && pw !== teamId) {
          // Otherwise, treat as "error conceded"
          pointsLost[pid] = (pointsLost[pid] ?? 0) + 1;
        }
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
          // extra tallies:
          pointCredits: pointsWon[playerId] ?? 0,
          errorCredits: pointsLost[playerId] ?? 0,
          counts: totalsCounts[playerId] ?? {},
        };
      })
      .sort((a, b) => b.pogPoints - a.pogPoints);

    // In case no perPlayer exists yet, still show ranking based on point credits if we have it.
    const rankedFallback =
      ranked.length > 0
        ? ranked
        : Object.keys({ ...pointsWon, ...pointsLost })
            .map((playerId) => {
              const p = players.find((x) => x.id === playerId);
              const bucket = bucketFromPosition(p?.position);
              return {
                playerId,
                pogPoints: 0,
                teamId: p?.teamId ?? "?",
                name: p?.name ?? "Unknown",
                jersey: p?.jerseyNumber ?? "",
                position: (p?.position as any) ?? "",
                bucket,
                pointCredits: pointsWon[playerId] ?? 0,
                errorCredits: pointsLost[playerId] ?? 0,
                counts: totalsCounts[playerId] ?? {},
              };
            })
            .sort((a, b) => b.pointCredits - a.pointCredits);

    const finalRanked = rankedFallback;

    const pog = finalRanked[0] ?? null;

    const byPosition: Record<PosBucket, typeof finalRanked> = {
      OH: [],
      OPP: [],
      S: [],
      L: [],
      MB: [],
      OTHER: [],
    };
    for (const r of finalRanked) byPosition[r.bucket].push(r);

    // Sort each position bucket by pog points, then point credits as tie-breaker
    (Object.keys(byPosition) as PosBucket[]).forEach((k) => {
      byPosition[k] = byPosition[k].slice().sort((a, b) => {
        if (b.pogPoints !== a.pogPoints) return b.pogPoints - a.pogPoints;
        return b.pointCredits - a.pointCredits;
      });
    });

    return {
      setsWonA,
      setsWonB,
      ranked: finalRanked,
      pog,
      byPosition,
    };
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

      {/* ✅ FIX 1: Added max-h-[95vh] and flex-col so the modal never exceeds the screen height */}
      <div className="relative flex flex-col max-h-[95vh] w-full max-w-5xl rounded-3xl bg-white text-black shadow-2xl border overflow-hidden">
        
        {/* ✅ FIX 2: Header keeps shrink-0 so it never gets crushed by content */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b bg-white">
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

        {/* ✅ FIX 3: Wrapper with flex-1 and overflow-y-auto gives us a scrollable middle section */}
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-4">
            
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
                          <div className="text-xs text-gray-500">{fmtTime(s.ts)}</div>
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

            {/* Right: POG + Rankings + Position rankings */}
            <div className="flex flex-col gap-4">
              {/* POG */}
              <div className="rounded-2xl border bg-gray-50 p-4">
                <div className="font-black text-sm mb-3">PLAYER OF THE GAME</div>

                {!summary.pog ? (
                  <div className="text-sm text-gray-600">
                    POG will appear after at least one saved set.
                  </div>
                ) : (
                  <div className="rounded-2xl bg-white border p-4 flex items-center justify-between">
                    <div>
                      <div className="text-xl font-black">
                        #{summary.pog.jersey} {summary.pog.name}
                      </div>
                      <div className="text-sm text-gray-600">
                        Team {summary.pog.teamId} • {String(summary.pog.position)}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        Point credits: <b>{summary.pog.pointCredits}</b> • Errors:{" "}
                        <b>{summary.pog.errorCredits}</b>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-black">
                        {summary.pog.pogPoints.toFixed(1)}
                      </div>
                      <div className="text-xs font-bold text-gray-600">POG points</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Overall rankings */}
              <div className="rounded-2xl border bg-gray-50 p-4">
                <div className="font-black text-sm mb-3">OVERALL RANKINGS</div>

                {summary.ranked.length === 0 ? (
                  <div className="text-sm text-gray-600">
                    Rankings appear once sets are saved.
                  </div>
                ) : (
                  <div className="max-h-[240px] overflow-auto rounded-xl bg-white border">
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
                              Team {r.teamId} • {String(r.position)} • {r.bucket}
                            </div>
                            <div className="text-[11px] text-gray-500">
                              Points won: <b>{r.pointCredits}</b> • Errors:{" "}
                              <b>{r.errorCredits}</b>
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-black">{r.pogPoints.toFixed(1)}</div>
                          <div className="text-[11px] text-gray-500">POG pts</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* By-position rankings */}
              <div className="rounded-2xl border bg-gray-50 p-4">
                <div className="font-black text-sm mb-3">RANKINGS BY POSITION</div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(["OH", "OPP", "S", "L", "MB"] as PosBucket[]).map((pos) => {
                    const list = summary.byPosition[pos] ?? [];
                    return (
                      <div key={pos} className="rounded-xl bg-white border p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-black text-sm">{pos}</div>
                          <div className="text-xs font-bold text-gray-500">
                            {list.length} player{list.length === 1 ? "" : "s"}
                          </div>
                        </div>

                        {list.length === 0 ? (
                          <div className="text-xs text-gray-600">
                            No players tagged as {pos}.
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {list.slice(0, 3).map((r, i) => (
                              <div
                                key={r.playerId}
                                className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
                              >
                                <div className="flex items-center gap-2">
                                  <div className="w-6 text-center font-black text-gray-500">
                                    {i + 1}
                                  </div>
                                  <div className="text-sm font-extrabold">
                                    #{r.jersey} {r.name}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-sm font-black">
                                    {r.pogPoints.toFixed(1)}
                                  </div>
                                  <div className="text-[11px] text-gray-500">
                                    +{r.pointCredits} / -{r.errorCredits}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="text-[11px] text-gray-600 mt-3">
                  *Position buckets are inferred from player.position. If you want true OH vs OPP,
                  we should add explicit positions in <code>volleyball.ts</code> and in your roster setup.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ✅ FIX 4: Footer keeps shrink-0 to stay docked at the bottom */}
        <div className="shrink-0 px-6 py-4 border-t flex items-center justify-between bg-white">
          <div className="text-xs text-gray-600">
            This summary persists on refresh and clears only when you press{" "}
            <b>Reset Match</b>.
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