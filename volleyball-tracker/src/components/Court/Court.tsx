"use client";

import { useMatchStore } from "@/store/matchStore";
import type { RotationSlot, TeamId } from "@/lib/volleyball";
import { slotLabel } from "@/lib/volleyball";
import { useDroppable } from "@dnd-kit/core";

const opponentOf = (teamId: TeamId): TeamId => (teamId === "A" ? "B" : "A");

export default function Court() {
  const leftTeam = useMatchStore((s) => s.leftTeam);
  const rightTeam = opponentOf(leftTeam);

  return (
    <div className="w-full max-w-6xl mx-auto aspect-[4/3] rounded-2xl bg-sky-500 p-8 shadow-sm">
      <div className="relative h-full w-full rounded-xl border-[6px] border-white/90 bg-amber-400">
        <div className="absolute inset-4 rounded-lg border-[4px] border-white/90" />

        <div className="absolute left-1/2 top-4 bottom-4 w-[6px] -translate-x-1/2 bg-white/90 rounded" />

        <div className="absolute left-1/2 top-[10%] bottom-[10%] w-[10px] -translate-x-1/2 bg-gray-500 rounded-full shadow" />
        <div className="absolute left-1/2 top-[8%] h-4 w-4 -translate-x-1/2 rounded-full bg-blue-900" />
        <div className="absolute left-1/2 bottom-[8%] h-4 w-4 -translate-x-1/2 rounded-full bg-blue-900" />

        <DashedMarker className="absolute left-[49%] top-[-22px]" />
        <DashedMarker className="absolute left-[49%] bottom-[-22px] rotate-180" />
        <DashedMarker className="absolute right-[49%] top-[-22px]" />
        <DashedMarker className="absolute right-[49%] bottom-[-22px] rotate-180" />

        <div className="absolute inset-4 grid grid-cols-2 gap-0">
          <TeamHalf teamId={leftTeam} side="left" />
          <TeamHalf teamId={rightTeam} side="right" />
        </div>
      </div>
    </div>
  );
}

function TeamHalf({ side, teamId }: { side: "left" | "right"; teamId: TeamId }) {
  const isLeft = side === "left";

  // Both teams face the net
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

  // ✅ Symmetric padding:
  // - Left half: more padding at left endline, less near net (right)
  // - Right half: more padding at right endline, less near net (left)
  const innerPadding = isLeft ? "pl-4 pr-10" : "pl-4 pr-10";

  return (
    <div
      className={[
        "h-full w-full border-white/90 flex items-center justify-center",
        isLeft ? "border-r-[4px]" : "border-l-[4px]",
      ].join(" ")}
    >
      <div className={["h-full w-full grid grid-cols-2 gap-10 py-10", innerPadding].join(" ")}>
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

  const dropId = `${teamId}-${slot}`;
  const { setNodeRef, isOver } = useDroppable({
    id: dropId,
    data: { teamId, slot },
  });

  const isSelected = selected?.teamId === teamId && selected?.slot === slot;

  function handlePrimaryClick() {
    if (!playerId) {
      selectSlot(teamId, slot, "bench");
      return;
    }
    openScoresheet(teamId, slot);
  }

  return (
    <div
      ref={setNodeRef}
      className={[
        "w-40 h-28 rounded-md shadow transition px-3 py-2 flex flex-col text-left",
        "bg-gray-100 cursor-pointer select-none",
        isSelected ? "ring-4 ring-blue-400" : "hover:shadow-md",
        isOver ? "ring-4 ring-emerald-400 bg-emerald-50" : "",
      ].join(" ")}
      onClick={handlePrimaryClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handlePrimaryClick();
      }}
      title={playerId ? "Open scoring" : "Assign a player"}
    >
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-black/60 font-bold">{slotLabel[slot]}</div>
        <div className="text-[10px] font-extrabold text-black/50">{teamId}</div>
      </div>

      <div className="mt-1 flex-1 flex flex-col justify-center">
        {player ? (
          <>
            <div className="text-base font-extrabold text-black leading-tight">#{player.jerseyNumber}</div>
            <div className="text-sm font-semibold text-black truncate">{player.name}</div>
            <div className="text-[11px] text-black/70 font-bold">{player.position}</div>
          </>
        ) : (
          <div className="text-sm font-bold text-black/60">Empty</div>
        )}
      </div>

      <div className="mt-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!playerId) {
              selectSlot(teamId, slot, "bench");
              return;
            }
            openScoresheet(teamId, slot);
          }}
          className={[
            "w-full rounded-md px-2 py-1 text-xs font-extrabold",
            playerId
              ? "bg-[var(--brand-sky)] text-white hover:opacity-90"
              : "bg-white border border-black/10 text-black hover:bg-gray-50",
          ].join(" ")}
        >
          {playerId ? "SCORE" : "ASSIGN"}
        </button>
      </div>
    </div>
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
