"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useMatchStore } from "@/store/matchStore";
import type { TeamId } from "@/lib/volleyball";

export default function BenchRail({ teamId }: { teamId: TeamId }) {
  const players = useMatchStore((s) => s.players);
  const getOnCourtPlayerIds = useMatchStore((s) => s.getOnCourtPlayerIds);

  const onCourt = new Set(getOnCourtPlayerIds(teamId));
  const bench = players
    .filter((p) => p.teamId === teamId && !onCourt.has(p.id))
    .sort((a, b) => a.jerseyNumber - b.jerseyNumber);

  return (
    <aside className="rounded-2xl bg-white/90 border border-black/10 shadow p-3">
      <div className="text-xs font-extrabold text-black tracking-wide mb-2">
        {teamId === "A" ? "BENCH A" : "BENCH B"}
      </div>

      <div className="flex flex-col gap-2 overflow-auto pr-1 max-h-[520px]">
        {bench.length === 0 ? (
          <div className="text-xs font-bold text-black/60">No bench players</div>
        ) : (
          bench.map((p) => (
            <BenchChip
              key={p.id}
              id={p.id}
              number={p.jerseyNumber}
              teamId={teamId}
            />
          ))
        )}
      </div>

      <div className="mt-2 text-[10px] text-black/60 font-semibold">
        Drag a number onto a court slot.
      </div>
    </aside>
  );
}

function BenchChip({
  id,
  number,
  teamId,
}: {
  id: string;
  number: number;
  teamId: TeamId;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id, // draggable id = playerId
      data: { playerId: id, teamId },
    });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.75 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={[
        "select-none cursor-grab active:cursor-grabbing",
        "w-14 h-14 rounded-full grid place-items-center",
        "bg-[var(--brand-amber)] border-2 border-black/15 shadow",
        "text-black font-extrabold text-lg",
      ].join(" ")}
      title={`${teamId} #${number}`}
    >
      {number ? `#${number}` : "?"}
    </div>
  );
}
