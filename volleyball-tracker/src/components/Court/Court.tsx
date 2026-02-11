"use client";

import { useMatchStore } from "@/store/matchStore";
import type { RotationSlot, TeamId } from "@/lib/volleyball";
import { slotLabel } from "@/lib/volleyball";
import { useDroppable } from "@dnd-kit/core";
import { positionColors } from "@/lib/position-ui";

const opponentOf = (teamId: TeamId): TeamId => (teamId === "A" ? "B" : "A");

export default function Court() {
  const leftTeam = useMatchStore((s) => s.leftTeam);
  const rightTeam = opponentOf(leftTeam);

  return (
    // ✅ RESPONSIVE CONTAINER
    // Mobile/Landscape: p-2
    // Desktop (xl): p-8
    <div className="w-full max-w-6xl mx-auto aspect-[4/3] rounded-2xl bg-sky-500 p-2 xl:p-8 shadow-sm transition-all">
      <div className="relative h-full w-full rounded-xl border-[3px] sm:border-[4px] xl:border-[6px] border-white/90 bg-amber-400">
        <div className="absolute inset-2 sm:inset-4 rounded-lg border-[2px] sm:border-[3px] xl:border-[4px] border-white/90" />

        {/* Center Line */}
        <div className="absolute left-1/2 top-2 bottom-2 w-[4px] xl:w-[6px] -translate-x-1/2 bg-white/90 rounded" />

        {/* Net Posts */}
        <div className="absolute left-1/2 top-[-6px] bottom-[-6px] w-[6px] xl:w-[10px] -translate-x-1/2 bg-gray-500 rounded-full shadow z-20" />
        
        {/* 3m Lines */}
        <DashedMarker className="absolute left-[49%] top-0 bottom-0" />
        <DashedMarker className="absolute right-[49%] top-0 bottom-0" />

        <div className="absolute inset-1 sm:inset-2 xl:inset-4 grid grid-cols-2 gap-0 z-10">
          <TeamHalf teamId={leftTeam} side="left" />
          <TeamHalf teamId={rightTeam} side="right" />
        </div>
      </div>
    </div>
  );
}

function TeamHalf({ side, teamId }: { side: "left" | "right"; teamId: TeamId }) {
  const isLeft = side === "left";
  const nearNetFirst = !isLeft;

  // ✅ RESPONSIVE GRID GAPS
  // We use much tighter gaps on mobile/tablet to prevent overflow
  // gap-1 (mobile) -> gap-2 (sm) -> gap-3 (lg) -> gap-8 (xl - original desktop size)
  const gridClass = "grid grid-rows-3 gap-1 sm:gap-2 lg:gap-3 xl:gap-8 place-items-center h-full";

  const BackCol = (
    <div className={gridClass}>
      <CourtSlot teamId={teamId} slot={5} />
      <CourtSlot teamId={teamId} slot={6} />
      <CourtSlot teamId={teamId} slot={1} />
    </div>
  );

  const FrontCol = (
    <div className={gridClass}>
      <CourtSlot teamId={teamId} slot={4} />
      <CourtSlot teamId={teamId} slot={3} />
      <CourtSlot teamId={teamId} slot={2} />
    </div>
  );

  return (
    <div
      className={[
        "h-full w-full border-white/90 flex flex-col justify-center",
        isLeft ? "border-r-[2px] xl:border-r-[4px]" : "border-l-[2px] xl:border-l-[4px]",
      ].join(" ")}
    >
      <div className={[
        "h-full w-full grid grid-cols-2",
        // ✅ RESPONSIVE COLUMN GAPS
        "gap-1 sm:gap-3 lg:gap-4 xl:gap-10", 
        // ✅ RESPONSIVE PADDING
        "py-2 sm:py-4 xl:py-10",
        "px-0.5 sm:px-2 xl:px-4"
      ].join(" ")}>
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

  const liberoSwap = teamId === "A" ? useMatchStore((s) => s.liberoSwapA) : useMatchStore((s) => s.liberoSwapB);
  const isLiberoAutoSub = !!playerId && liberoSwap.active && liberoSwap.slot === slot && liberoSwap.liberoId === playerId;
  const replacedMB = isLiberoAutoSub && liberoSwap.replacedMbId ? players.find((p) => p.id === liberoSwap.replacedMbId) ?? null : null;

  const dropId = `${teamId}-${slot}`;
  const { setNodeRef, isOver } = useDroppable({
    id: dropId,
    data: { teamId, slot },
  });

  const isSelected = selected?.teamId === teamId && selected?.slot === slot;
  const servingSlot: RotationSlot = teamId === leftTeam ? 1 : 5;
  const isServer = !!playerId && teamId === servingTeam && slot === servingSlot;
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
        // ✅ FIX: MORE CONSERVATIVE SIZING
        // Mobile: w-16 h-12 (Tiny)
        // SM (Landscape phones): w-20 h-14
        // LG (Tablets/Laptops): w-28 h-20 
        // XL (Desktops): w-40 h-28 (Original Big Size)
        "w-16 h-12 sm:w-20 sm:h-14 lg:w-28 lg:h-20 xl:w-40 xl:h-28",
        
        "rounded-md sm:rounded-lg xl:rounded-xl shadow-sm transition-all px-1 py-0.5 sm:px-2 sm:py-1 xl:px-3 xl:py-2 flex flex-col text-left relative",
        "cursor-pointer select-none border-[1px] sm:border-2",
        "text-gray-900",
        playerId ? `${posColors.badgeBg} ${posColors.ring.replace('ring-', 'border-')}` : "bg-gray-50 border-white/50",
        isSelected ? "ring-2 sm:ring-4 ring-blue-400 z-10" : "hover:scale-[1.02] hover:shadow-md",
        isOver ? "ring-2 sm:ring-4 ring-emerald-400 bg-emerald-50" : "",
        isServer ? "ring-2 sm:ring-4 ring-yellow-300 shadow-xl z-10" : "",
        isLiberoAutoSub ? "ring-2 sm:ring-4 ring-teal-300 shadow-xl z-10" : "",
      ].join(" ")}
      onClick={handlePrimaryClick}
    >
      {/* Top Row: Label & Badges */}
      <div className="flex items-center justify-between leading-none">
        <div className="text-[6px] sm:text-[8px] xl:text-[10px] uppercase font-black opacity-50">{slotLabel[slot]}</div>
        
        <div className="flex gap-0.5">
          {isServer && <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-yellow-400 shadow-sm" title="Server" />}
          {isLiberoAutoSub && <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-teal-400 shadow-sm" title="Libero" />}
        </div>
      </div>

      {/* Player Info */}
      <div className="flex-1 flex flex-col justify-center min-h-0">
        {player ? (
          <>
            <div className="flex items-center justify-between gap-0.5">
                {/* Responsive Jersey Number */}
                <div className="text-xs sm:text-sm lg:text-base xl:text-xl font-black leading-none">
                  #{player.jerseyNumber}
                </div>
                {/* Position Pill - Hidden on smallest screens */}
                <div className={`hidden lg:block text-[8px] xl:text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-sm ${posColors.chipBg} ${posColors.chipText}`}>
                    {player.position}
                </div>
            </div>
            
            {/* Name */}
            <div className="text-[7px] sm:text-[9px] lg:text-xs xl:text-sm font-bold truncate leading-tight mt-0.5">
              {player.name}
            </div>

            {/* Sub Info - Desktop only */}
            {isLiberoAutoSub && replacedMB && (
              <div className="hidden xl:block text-[9px] opacity-70 font-semibold truncate mt-0.5">
                For #{replacedMB.jerseyNumber}
              </div>
            )}
          </>
        ) : (
          <div className="text-[7px] sm:text-[9px] xl:text-sm font-bold text-black/30 text-center">Empty</div>
        )}
      </div>

      {/* Button - Hidden on very small screens to save space, visible on interaction */}
      <div className="hidden sm:block mt-0.5 xl:mt-1">
        <button
          type="button"
          className={[
            "w-full rounded sm:rounded-md px-1 py-0.5 text-[6px] sm:text-[8px] xl:text-[10px] font-extrabold uppercase tracking-wide",
            playerId ? "bg-white/60 text-black" : "bg-black/5 text-black/40",
          ].join(" ")}
        >
          {playerId ? "Score" : "Add"}
        </button>
      </div>
    </div>
  );
}

function DashedMarker({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="h-full w-full border-r-[1px] sm:border-r-[2px] border-dashed border-white/40" />
    </div>
  );
}