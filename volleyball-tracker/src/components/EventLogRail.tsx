"use client";

import { useMatchStore } from "@/store/matchStore";
import { slotLabel } from "@/lib/volleyball";

export default function EventLogRail() {
  const events = useMatchStore((s) => s.events);
  const undoLast = useMatchStore((s) => s.undoLastEvent);
  const undoFrom = useMatchStore((s) => s.undoFromEvent);

  const handleRemove = (eventId: string, index: number) => {
    // If it's the very first item (latest), just use normal undo (same logic essentially)
    if (index === 0) {
      undoLast();
      return;
    }

    // Optional: Warn user that this deletes future events
    const confirmText = "Undoing this event will also delete all events that happened after it. Continue?";
    if (window.confirm(confirmText)) {
      undoFrom(eventId);
    }
  };

  return (
    <aside className="flex h-full w-full flex-col border-r border-gray-300 bg-gray-200">
      {/* Header */}
      <div className="bg-black p-4 text-white">
        <h2 className="text-xl font-bold">Log Events</h2>
      </div>

      {/* Undo Button (Top) */}
      <div className="p-4 border-b border-gray-300">
        <button
          onClick={undoLast}
          disabled={events.length === 0}
          className="w-full rounded bg-red-600 py-2 font-bold text-white shadow hover:bg-red-700 disabled:opacity-50"
        >
          Undo Last
        </button>
      </div>

      {/* Scrollable List */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex flex-col gap-2">
          {events.length === 0 && (
            <div className="mt-10 text-center text-sm text-gray-500">
              No events yet.
            </div>
          )}

          {events.map((ev, i) => (
            <div
              key={ev.id}
              className="group relative flex items-center gap-2 rounded bg-gray-600 p-2 text-white shadow transition hover:bg-gray-700"
            >
              {/* Event Info */}
              <div className="flex-1 text-xs">
                <div className="font-bold text-gray-300">
                  {ev.teamId === "A" ? "Team A" : "Team B"} • {slotLabel[ev.slot]}
                </div>
                <div className="font-semibold uppercase text-white">
                  {ev.skill} • {ev.outcome}
                </div>
                {ev.pointWinner && (
                  <div className="mt-1 text-[10px] text-yellow-400">
                    + Point {ev.pointWinner}
                  </div>
                )}
              </div>

              {/* 'X' Delete Button - Available for ALL events */}
              <button
                onClick={() => handleRemove(ev.id, i)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-red-400 hover:bg-white/10 opacity-60 hover:opacity-100"
                title="Undo this event (and all subsequent events)"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}