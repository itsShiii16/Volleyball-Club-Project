"use client";

import { useMatchStore } from "@/store/matchStore";
import type { RotationSlot, TeamId } from "@/lib/volleyball";
import { slotLabel } from "@/lib/volleyball";

export default function Court() {
  return (
    <div className="w-full max-w-6xl mx-auto aspect-[4/3] rounded-2xl bg-sky-500 p-8 shadow-sm">
      {/* Court frame */}
      <div className="relative h-full w-full rounded-xl border-[6px] border-white/90 bg-amber-400">
        {/* Inner court border line */}
        <div className="absolute inset-4 rounded-lg border-[4px] border-white/90" />

        {/* Center net line */}
        <div className="absolute left-1/2 top-4 bottom-4 w-[6px] -translate-x-1/2 bg-white/90 rounded" />

        {/* Net pole */}
        <div className="absolute left-1/2 top-[10%] bottom-[10%] w-[10px] -translate-x-1/2 bg-gray-500 rounded-full shadow" />
        {/* Pole caps */}
        <div className="absolute left-1/2 top-[8%] h-4 w-4 -translate-x-1/2 rounded-full bg-blue-900" />
        <div className="absolute left-1/2 bottom-[8%] h-4 w-4 -translate-x-1/2 rounded-full bg-blue-900" />

        {/* Side dashed markers */}
        <DashedMarker className="absolute left-[49%] top-[-22px]" />
        <DashedMarker className="absolute left-[49%] bottom-[-22px] rotate-180" />
        <DashedMarker className="absolute right-[49%] top-[-22px]" />
        <DashedMarker className="absolute right-[49%] bottom-[-22px] rotate-180" />

        {/* Left + Right halves */}
        <div className="absolute inset-4 grid grid-cols-2 gap-0">
          <TeamHalf teamId="A" side="left" />
          <TeamHalf teamId="B" side="right" />
        </div>
      </div>
    </div>
  );
}

function TeamHalf({ side, teamId }: { side: "left" | "right"; teamId: TeamId }) {
  const isLeft = side === "left";

  // Near net placement:
  // - Left team: near net is RIGHT column
  // - Right team: near net is LEFT column
  const nearNetFirst = !isLeft;

  const BackCol = (
    <div className="grid grid-rows-3 gap-8 place-items-center">
      <CourtSlot teamId={teamId} slot={5} />
      <CourtSlot teamId={teamId} slot={6} />
      <CourtSlot teamId={teamId} slot={1} />
    </div>
  );

  const FrontCol = (
    <div className="grid grid-rows-3 gap-8 place-items-center">
      <CourtSlot teamId={teamId} slot={4} />
      <CourtSlot teamId={teamId} slot={3} />
      <CourtSlot teamId={teamId} slot={2} />
    </div>
  );

  return (
    <div
      className={[
        "h-full w-full border-white/90 flex items-center justify-center",
        isLeft ? "border-r-[4px]" : "border-l-[4px]",
      ].join(" ")}
    >
      <div className="h-full w-full grid grid-cols-2 gap-10 px-10 py-10">
        {nearNetFirst ? FrontCol : BackCol}
        {nearNetFirst ? BackCol : FrontCol}
      </div>
    </div>
  );
}

function CourtSlot({ teamId, slot }: { teamId: TeamId; slot: RotationSlot }) {
  const players = useMatchStore((s) => s.players);

  const selected = useMatchStore((s) => s.selected);
  const selectSlot = useMatchStore((s) => s.selectSlot);

  const openScoresheet = useMatchStore((s) => s.openScoresheet);

  const court = useMatchStore((s) => (teamId === "A" ? s.courtA : s.courtB));
  const playerId = court[slot];
  const player = players.find((p) => p.id === playerId);

  const isSelected = selected?.teamId === teamId && selected?.slot === slot;

  return (
    <button
      type="button"
      onClick={() => {
        if (playerId) openScoresheet(teamId, slot);
        else selectSlot(teamId, slot);
      }}
      className={[
        "w-40 h-24 rounded-md shadow transition px-3 flex flex-col items-center justify-center text-center",
        isSelected ? "bg-white ring-4 ring-blue-400" : "bg-gray-200 hover:shadow-md",
      ].join(" ")}
    >
      <div className="text-[11px] text-gray-500 font-semibold">{slotLabel[slot]}</div>

      {player ? (
        <>
          <div className="text-base font-extrabold text-gray-900">#{player.jerseyNumber}</div>
          <div className="text-sm font-medium text-gray-800 truncate w-full">{player.name}</div>
          <div className="text-[11px] text-gray-600">{player.position}</div>
        </>
      ) : (
        <div className="text-sm font-semibold text-gray-600">Empty</div>
      )}
    </button>
  );
}

function DashedMarker({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-3 w-2 rounded bg-white/90" />
        ))}
      </div>
    </div>
  );
}
