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
    <div className="w-full max-w-7xl mx-auto aspect-[4/3] rounded-3xl bg-sky-500 p-2 sm:p-4 xl:p-8 shadow-xl transition-all">
      <div className="relative h-full w-full rounded-2xl border-[4px] sm:border-[6px] xl:border-[8px] border-white/90 bg-amber-400">
        <div className="absolute inset-2 sm:inset-4 rounded-xl border-[2px] sm:border-[3px] xl:border-[4px] border-white/90" />

        {/* Center Line */}
        <div className="absolute left-1/2 top-2 bottom-2 w-[4px] xl:w-[8px] -translate-x-1/2 bg-white/90 rounded" />

        {/* Net Posts */}
        <div className="absolute left-1/2 top-[-8px] bottom-[-8px] w-[8px] xl:w-[12px] -translate-x-1/2 bg-gray-600 rounded-full shadow-lg z-20" />
        
        {/* 3m Lines */}
        <DashedMarker className="absolute left-[49%] top-0 bottom-0" />
        <DashedMarker className="absolute right-[49%] top-0 bottom-0" />

        <div className="absolute inset-1 sm:inset-2 xl:inset-6 grid grid-cols-2 gap-0 z-10">
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

  // Responsive Grid Gaps
  const gridClass = "grid grid-rows-3 gap-2 sm:gap-3 lg:gap-4 xl:gap-8 place-items-center h-full";

  // ✅ COMPLETE OPPOSITE LOGIC (Point-Reflection):
  // Team A (Left): Top -> Bottom is 5 (BL), 6 (BM), 1 (BR).
  // Team B (Right): Top -> Bottom is 1 (BR), 6 (BM), 5 (BL).
  const backSlots: RotationSlot[] = isLeft ? [5, 6, 1] : [1, 6, 5];
  const frontSlots: RotationSlot[] = isLeft ? [4, 3, 2] : [2, 3, 4];

  const BackCol = (
    <div className={gridClass}>
      {backSlots.map(s => <CourtSlot key={s} teamId={teamId} slot={s} />)}
    </div>
  );

  const FrontCol = (
    <div className={gridClass}>
      {frontSlots.map(s => <CourtSlot key={s} teamId={teamId} slot={s} />)}
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
        "gap-1 sm:gap-3 lg:gap-4 xl:gap-8", 
        "py-2 sm:py-4 xl:py-8",
        "px-1 sm:px-2 xl:px-6"
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

  const court = useMatchStore((s) => (teamId === "A" ? s.courtA : s.courtB));
  const playerId = court[slot];
  const player = players.find((p) => p.id === playerId) || null;

  const liberoSwap = teamId === "A" ? useMatchStore((s) => s.liberoSwapA) : useMatchStore((s) => s.liberoSwapB);
  
  const isLiberoAutoSub = !!playerId && liberoSwap.active && liberoSwap.slot === slot && liberoSwap.liberoId === playerId;
  const replacedPlayer = isLiberoAutoSub && liberoSwap.replacedPlayerId 
    ? players.find((p) => p.id === liberoSwap.replacedPlayerId) ?? null 
    : null;

  const dropId = `${teamId}-${slot}`;
  const { setNodeRef, isOver } = useDroppable({
    id: dropId,
    data: { teamId, slot },
  });

  const isSelected = selected?.teamId === teamId && selected?.slot === slot;
  
  // ✅ FIX: SERVING LOGIC IS NOW CONSISTENT
  // Slot 1 is always the server.
  // Visually: On Left side, Slot 1 is at the bottom. On Right side, Slot 1 is at the top.
  // This matches your drawing and ensures buttons appear in the correct corner.
  const isServer = !!playerId && teamId === servingTeam && slot === 1;
  
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
        "w-full h-full max-w-[180px] max-h-[120px] aspect-[16/10]",
        "rounded-lg sm:rounded-xl xl:rounded-2xl shadow-md transition-all px-2 py-1 sm:px-3 sm:py-2 xl:px-4 xl:py-3 flex flex-col text-left relative",
        "cursor-pointer select-none border-[2px] sm:border-[3px]",
        "text-gray-900",
        playerId ? `${posColors.badgeBg} ${posColors.ring.replace('ring-', 'border-')}` : "bg-gray-50/90 border-white/60",
        isSelected ? "ring-4 ring-blue-500 z-20 scale-105" : "hover:scale-[1.03] hover:shadow-lg",
        isOver ? "ring-4 ring-emerald-400 bg-emerald-100" : "",
        isServer ? "ring-4 ring-yellow-400 shadow-xl shadow-yellow-500/40 z-10" : "",
        isLiberoAutoSub ? "ring-4 ring-teal-400 shadow-xl shadow-teal-500/40 z-10" : "",
      ].join(" ")}
      onClick={handlePrimaryClick}
    >
      <div className="flex items-center justify-between leading-none mb-auto">
        <div className="text-[9px] sm:text-[10px] xl:text-sm uppercase font-black opacity-60 tracking-wider">{slotLabel[slot]}</div>
        
        <div className="flex gap-1">
          {isServer && <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 xl:w-3 xl:h-3 rounded-full bg-yellow-500 shadow-sm border border-white" title="Server" />}
          {isLiberoAutoSub && <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 xl:w-3 xl:h-3 rounded-full bg-teal-500 shadow-sm border border-white" title="Libero" />}
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center min-h-0 items-center text-center">
        {player ? (
          <>
            <div className="flex flex-col items-center">
                <div className="text-2xl sm:text-3xl xl:text-5xl font-black leading-none tracking-tighter text-gray-900 drop-shadow-sm">
                  {player.jerseyNumber}
                </div>
                
                <div className="text-xs sm:text-sm xl:text-lg font-bold truncate leading-tight mt-0.5 xl:mt-1 max-w-full px-1">
                  {player.name}
                </div>

                <div className={`mt-1 hidden sm:block text-[9px] xl:text-xs font-black px-2 py-0.5 rounded-full shadow-sm border border-black/5 ${posColors.chipBg} ${posColors.chipText}`}>
                    {player.position}
                </div>
            </div>

            {isLiberoAutoSub && replacedPlayer && (
              <div className="hidden xl:block text-[10px] font-bold text-gray-500 truncate mt-1 bg-white/50 px-1.5 py-0.5 rounded">
                Sub #{replacedPlayer.jerseyNumber}
              </div>
            )}
          </>
        ) : (
          <div className="text-xs sm:text-sm xl:text-xl font-bold text-gray-300">Empty</div>
        )}
      </div>

      <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/10 rounded-xl backdrop-blur-[1px]">
          <span className="bg-white text-black font-black text-xs px-3 py-1.5 rounded-full shadow-lg uppercase tracking-wider scale-110">
            {playerId ? "Score" : "Add"}
          </span>
      </div>
    </div>
  );
}

function DashedMarker({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="h-full w-full border-r-[2px] sm:border-r-[3px] border-dashed border-white/50" />
    </div>
  );
}