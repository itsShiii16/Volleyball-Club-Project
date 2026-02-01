"use client";

import Court from "@/components/Court/Court";
import SlotPanel from "@/components/Court/SlotPanel";
import ScoresheetPanel from "@/components/Court/Scoresheet/ScoresheetPanel";
import BenchRail from "@/components/Court/Bench/BenchRail";

import { useMemo, useState } from "react";
import { useMatchStore } from "@/store/matchStore";
import { useRouter } from "next/navigation";

import {
  DndContext,
  type DragEndEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

export default function Home() {
  const router = useRouter();
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const players = useMatchStore((s) => s.players);

  const assign = useMatchStore((s) => s.assignPlayerToSlot);
  const rotateTeam = useMatchStore((s) => s.rotateTeam);
  const resetCourt = useMatchStore((s) => s.resetCourt);
  const resetMatch = useMatchStore((s) => s.resetMatch);

  const scoreA = useMatchStore((s) => s.scoreA);
  const scoreB = useMatchStore((s) => s.scoreB);
  const servingTeam = useMatchStore((s) => s.servingTeam);
  const undoLastEvent = useMatchStore((s) => s.undoLastEvent);

  const teamA = useMemo(() => players.filter((p) => p.teamId === "A"), [players]);
  const teamB = useMemo(() => players.filter((p) => p.teamId === "B"), [players]);

  const rosterReady = teamA.length >= 6 && teamB.length >= 6;

  // DnD sensors (mouse + touch)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } })
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    // draggable id = playerId
    const playerId = String(active.id);

    // droppable id must be like "A-4"
    const overId = String(over.id);
    const [teamIdRaw, slotRaw] = overId.split("-");
    const slotNum = Number(slotRaw);

    const teamId = teamIdRaw === "A" || teamIdRaw === "B" ? teamIdRaw : null;
    if (!teamId) return;
    if (![1, 2, 3, 4, 5, 6].includes(slotNum)) return;

    // Safety: only allow bench A -> A slots, bench B -> B slots
    const p = players.find((x) => x.id === playerId);
    if (!p) return;
    if (p.teamId !== teamId) return;

    assign(teamId, slotNum as any, playerId);
  }

  function autoFill() {
    if (!rosterReady) return;

    resetCourt("A");
    resetCourt("B");

    const A = teamA.slice(0, 6);
    const B = teamB.slice(0, 6);

    // slots: 4 FL, 3 FM, 2 FR, 5 BL, 6 BM, 1 BR
    assign("A", 4, A[0].id);
    assign("A", 3, A[1].id);
    assign("A", 2, A[2].id);
    assign("A", 5, A[3].id);
    assign("A", 6, A[4].id);
    assign("A", 1, A[5].id);

    assign("B", 4, B[0].id);
    assign("B", 3, B[1].id);
    assign("B", 2, B[2].id);
    assign("B", 5, B[3].id);
    assign("B", 6, B[4].id);
    assign("B", 1, B[5].id);
  }

  return (
    <main className="min-h-screen bg-[var(--background)] p-6">
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="max-w-6xl mx-auto flex flex-col gap-4">
          {/* Top controls */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => router.push("/setup")}
                className="px-4 py-2 rounded-lg font-semibold shadow bg-[var(--brand-sky)] text-white hover:opacity-90"
              >
                Setup Roster
              </button>

              <button
                onClick={autoFill}
                disabled={!rosterReady}
                className={[
                  "px-4 py-2 rounded-lg font-semibold shadow transition",
                  rosterReady
                    ? "bg-white text-black hover:shadow-md"
                    : "bg-white/60 text-black/40 cursor-not-allowed",
                ].join(" ")}
                title={
                  !rosterReady
                    ? "Add at least 6 players per team in Setup Roster"
                    : "Auto-fill starting 6"
                }
              >
                Auto-fill Starting 6
              </button>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              {/* Scoreboard */}
              <div className="bg-white rounded-lg px-4 py-2 shadow text-black font-extrabold">
                A {scoreA} – {scoreB} B
              </div>
              <div className="text-white text-sm font-semibold">
                Serving: <b className="text-white">{servingTeam}</b>
              </div>

              <button
                onClick={undoLastEvent}
                className="px-4 py-2 rounded-lg bg-white text-black shadow hover:shadow-md font-semibold"
                title="Undo last logged event"
              >
                Undo
              </button>

              <button
                className="px-4 py-2 rounded-lg font-semibold shadow bg-white text-black hover:shadow-md"
                onClick={() => rotateTeam("A")}
              >
                Rotate Team A
              </button>

              <button
                className="px-4 py-2 rounded-lg font-semibold shadow bg-white text-black hover:shadow-md"
                onClick={() => rotateTeam("B")}
              >
                Rotate Team B
              </button>

              <button
                className="px-4 py-2 rounded-lg font-semibold shadow bg-white/80 text-black hover:shadow-md"
                onClick={() => resetCourt("A")}
                title="Clear Team A court"
              >
                Reset A
              </button>

              <button
                className="px-4 py-2 rounded-lg font-semibold shadow bg-white/80 text-black hover:shadow-md"
                onClick={() => resetCourt("B")}
                title="Clear Team B court"
              >
                Reset B
              </button>

              <button
                className="px-4 py-2 rounded-lg font-semibold shadow bg-red-600 text-white hover:opacity-90"
                onClick={() => setConfirmResetOpen(true)}
                title="Clear both courts + selection + scoresheet + events"
              >
                Reset Match
              </button>
            </div>
          </div>

          {/* Hint banner */}
          {!rosterReady && (
            <div className="rounded-xl border border-white/40 bg-white/70 p-4 text-sm text-black">
              <span className="font-semibold">Add at least 6 players per team</span> in{" "}
              <span className="font-semibold">Setup Roster</span>, then click{" "}
              <span className="font-semibold">Auto-fill Starting 6</span> to place them on the court.
            </div>
          )}

          {/* Bench rails + Court */}
          <div className="grid grid-cols-[140px_1fr_140px] gap-4 items-start">
            <BenchRail teamId="A" />
            <Court />
            <BenchRail teamId="B" />
          </div>

          {/* Panels */}
          <SlotPanel />
          <ScoresheetPanel />

          {/* Reset match confirm dialog */}
          {confirmResetOpen && (
            <ConfirmDialog
              title="Reset match?"
              message="This will clear both courts, close panels, and delete all logged events."
              confirmLabel="Yes, reset"
              cancelLabel="Cancel"
              onCancel={() => setConfirmResetOpen(false)}
              onConfirm={() => {
                resetMatch();
                setConfirmResetOpen(false);
              }}
            />
          )}
        </div>
      </DndContext>
    </main>
  );
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60]">
      <button
        className="absolute inset-0 bg-black/40"
        onClick={onCancel}
        aria-label="Close"
      />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-white/60 overflow-hidden">
          <div className="p-5 text-black">
            <div className="text-lg font-extrabold">{title}</div>
            <div className="mt-2 text-sm text-black/70">{message}</div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={onCancel}
                className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 font-semibold text-sm text-black"
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                className="px-4 py-2 rounded-lg bg-red-600 hover:opacity-90 text-white font-semibold text-sm"
              >
                {confirmLabel}
              </button>
            </div>
          </div>

          <div className="h-2 bg-[var(--brand-sky)]" />
        </div>
      </div>
    </div>
  );
}
