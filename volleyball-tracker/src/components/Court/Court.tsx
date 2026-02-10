"use client";

import { useMatchStore } from "@/store/matchStore";
import type { RotationSlot, TeamId } from "@/lib/volleyball";
import { slotLabel } from "@/lib/volleyball";
import { useDroppable } from "@dnd-kit/core";
// ✅ Import the position color logic
import { positionColors } from "@/lib/position-ui";

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

  const innerPadding = "pl-4 pr-10";

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

  const servingTeam = useMatchStore((s) => s.servingTeam);
  const leftTeam = useMatchStore((s) => s.leftTeam); 

  const court = useMatchStore((s) => (teamId === "A" ? s.courtA : s.courtB));
  const playerId = court[slot];
  const player = players.find((p) => p.id === playerId) || null;

  // Libero swap state 
  const liberoSwap =
    teamId === "A"
      ? useMatchStore((s) => s.liberoSwapA)
      : useMatchStore((s) => s.liberoSwapB);

  const isLiberoAutoSub =
    !!playerId &&
    liberoSwap.active &&
    liberoSwap.slot === slot &&
    liberoSwap.liberoId === playerId;

    const replacedMB =
      isLiberoAutoSub && liberoSwap.replacedMbId
        ? players.find((p) => p.id === liberoSwap.replacedMbId) ?? null
        : null;


  const dropId = `${teamId}-${slot}`;
  const { setNodeRef, isOver } = useDroppable({
    id: dropId,
    data: { teamId, slot },
  });

  const isSelected = selected?.teamId === teamId && selected?.slot === slot;

  const servingSlot: RotationSlot = teamId === leftTeam ? 1 : 5;
  const isServer = !!playerId && teamId === servingTeam && slot === servingSlot;

  // ✅ Get position colors
  // If no player, defaults to gray/white via the helper
  const posColors = positionColors(player?.position);

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
          "w-40 h-28 rounded-xl shadow-sm transition-all px-3 py-2 flex flex-col text-left",
          "cursor-pointer select-none border-2",
          "text-gray-900",
          
          // ✅ Conditional Styling based on position
          // If player exists, use their 'badgeBg' (light tint) and 'ring' (border color)
          // If no player, default to gray/white
          playerId ? `${posColors.badgeBg} ${posColors.ring.replace('ring-', 'border-')}` : "bg-gray-50 border-white/50",

          isSelected ? "ring-4 ring-blue-400 z-10" : "hover:scale-[1.02] hover:shadow-md",
          isOver ? "ring-4 ring-emerald-400 bg-emerald-50" : "",
          
          // Server Highlight (overrides position border if serving)
          isServer ? "ring-4 ring-yellow-300 shadow-xl shadow-yellow-400/40 z-10" : "",
          
          // Libero active glow
          isLiberoAutoSub ? "ring-4 ring-teal-300 shadow-xl shadow-teal-400/40 z-10" : "",
        ].join(" ")}
      onClick={handlePrimaryClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handlePrimaryClick();
      }}
    >
      {/* Slot label */}
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase font-black opacity-50">{slotLabel[slot]}</div>

        <div className="flex items-center gap-1">
          {/* SERVE badge */}
          {isServer && (
            <div className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-yellow-400 text-black shadow-sm">
              SERVE
            </div>
          )}

          {/* LIBERO badge */}
          {isLiberoAutoSub && (
            <div className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-teal-400 text-white shadow-sm">
              LIBERO
            </div>
          )}
        </div>
      </div>

      {/* Player info */}
      <div className="mt-1 flex-1 flex flex-col justify-center">
        {player ? (
          <>
            <div className="flex items-center justify-between">
                <div className="text-xl font-black leading-none">
                #{player.jerseyNumber}
                </div>
                {/* ✅ Position Pill using chipBg (strong color) and chipText */}
                <div className={`text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm ${posColors.chipBg} ${posColors.chipText}`}>
                    {player.position}
                </div>
            </div>
            
            <div className="text-sm font-bold truncate leading-tight mt-1">{player.name}</div>

            {/* Auto-sub explanation line */}
            {isLiberoAutoSub && replacedMB && (
              <div className="text-[9px] opacity-70 font-semibold truncate mt-1">
                Subbed for #{replacedMB.jerseyNumber}
              </div>
            )}
          </>
        ) : (
          <div className="text-sm font-bold text-black/30 text-center">Empty</div>
        )}
      </div>

      {/* Button */}
      <div className="mt-1">
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
            "w-full rounded-lg px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide transition-colors",
            playerId
              ? "bg-white/60 hover:bg-white text-black shadow-sm"
              : "bg-black/5 text-black/40 hover:bg-black/10",
          ].join(" ")}
        >
          {playerId ? "Score" : "Assign"}
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