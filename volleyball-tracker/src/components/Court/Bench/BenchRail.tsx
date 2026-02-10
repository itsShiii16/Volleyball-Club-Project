"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useMatchStore } from "@/store/matchStore";
import type { TeamId } from "@/lib/volleyball";
import { positionColors } from "@/lib/position-ui";

function getFirstName(name?: string) {
  if (!name) return "";
  return name.trim().split(/\s+/)[0].toUpperCase();
}

export default function BenchRail({ teamId }: { teamId: TeamId }) {
  const players = useMatchStore((s) => s.players);
  
  // ✅ FIX: Subscribe directly to the court state so this component
  // re-renders whenever someone is added/removed/subbed on the court.
  const court = useMatchStore((s) => (teamId === "A" ? s.courtA : s.courtB));

  // Derive the set of IDs currently on the court from the reactive 'court' object
  const onCourtIds = new Set(Object.values(court).filter(Boolean));

  // Filter out players who are on the court
  const bench = players
    .filter((p) => p.teamId === teamId && !onCourtIds.has(p.id))
    .sort((a, b) => a.jerseyNumber - b.jerseyNumber);

  return (
    <aside className="rounded-2xl bg-white/90 border border-black/10 shadow p-3">
      <div className="text-xs font-extrabold text-black tracking-wide mb-2">
        {teamId === "A" ? "BENCH A" : "BENCH B"}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-4">
        {bench.length === 0 ? (
          <div className="col-span-2 text-xs font-bold text-black/60">
            No bench players
          </div>
        ) : (
          bench.map((p) => (
            <BenchChip
              key={p.id}
              id={p.id}
              number={p.jerseyNumber}
              teamId={teamId}
              name={getFirstName(p.name)}
              position={p.position}
            />
          ))
        )}
      </div>

      <div className="mt-3 text-[10px] text-black/60 font-semibold">
        Drag a player onto a court slot.
      </div>
    </aside>
  );
}

function BenchChip({
  id,
  number,
  teamId,
  name,
  position,
}: {
  id: string;
  number: number;
  teamId: TeamId;
  name: string;
  position?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id,
      data: {
        playerId: id,
        teamId,
        position, 
      },
    });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.7 : 1,
  };

  // Safe fallback for colors
  const c = positionColors(position);

  return (
    <div className="flex flex-col items-center">
      <div
        ref={setNodeRef}
        style={style}
        {...listeners}
        {...attributes}
        className={[
          "select-none cursor-grab active:cursor-grabbing",
          "touch-none overscroll-none",
          "w-14 h-14 rounded-full grid place-items-center",
          "border-2 border-black/15 shadow",
          "font-extrabold text-lg",
          c.chipBg,
          c.chipText,
          isDragging ? `ring-4 ${c.ring}` : "",
        ].join(" ")}
        title={`${teamId} #${number} ${name}${position ? ` – ${position}` : ""}`}
      >
        #{number}
      </div>

      <div className="mt-1 text-[10px] font-extrabold text-black/80 leading-tight text-center">
        {name}
        {position ? ` – ${String(position).toUpperCase()}` : ""}
      </div>
    </div>
  );
}