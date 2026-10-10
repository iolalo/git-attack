"use client";

import Link from "next/link";
import AccuracyTrend from "@/components/AccuracyTrend";
import { ROOMS } from "@/lib/rooms";
import { bossesBeaten, isRoomLocked, resetProgress, reviewQueue, roomLevel, scamStats } from "@/lib/storage";
import { useProgress } from "@/lib/useProgress";
import { LEVEL_LABELS, MAX_LEVEL, TOPICS } from "@/lib/types";

export default function ProgressPage() {
  const progress = useProgress();

  function handleReset() {
    if (!window.confirm("¿Borrar todo tu progreso? Esta acción no se puede deshacer.")) return;
    resetProgress();
  }

  const trendPoints = progress.history.slice(-10).map((s) => ({
    dateISO: s.dateISO,
    accuracyPct: s.overallAccuracy * 100,
  }));

  const totalSessions = progress.history.length;
  const totalExercises = progress.history.reduce((sum, s) => sum + s.results.length, 0);
  const scams = scamStats(progress);

  // aciertos por tema, acumulados en las últimas 10 sesiones
  const recentSessions = progress.history.slice(-10);
  const roomStats = ROOMS.map((room, index) => {
    let correct = 0;
    let total = 0;
    for (const session of recentSessions) {
      const breakdown = session.topicBreakdown[room.topic];
      if (!breakdown) continue;
      correct += breakdown.correct;
      total += breakdown.total;
    }
    return {
      room,
      locked: isRoomLocked(progress, index),
      level: roomLevel(progress, room.id),
      accuracy: total > 0 ? correct / total : null,
    };
  });

  return (
    <main className="game px-4 py-6 gap-6">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-[8px] uppercase" style={{ color: "var(--foreground-muted)" }}>
          ← volver
        </Link>
        <h1 className="text-xs uppercase" style={{ color: "var(--accent)" }}>
          Progreso
        </h1>
        <span className="w-12" />
      </div>

      <section className="pixel-panel w-full p-4 grid grid-cols-2 gap-4 text-center">
        <div>
          <div className="text-xl" style={{ color: "var(--yellow)" }}>
            {totalSessions}
          </div>
          <div className="text-[8px] mt-1 uppercase" style={{ color: "var(--foreground-muted)" }}>
            sesiones
          </div>
        </div>
        <div>
          <div className="text-xl" style={{ color: "var(--yellow)" }}>
            {totalExercises}
          </div>
          <div className="text-[8px] mt-1 uppercase" style={{ color: "var(--foreground-muted)" }}>
            desafios
          </div>
        </div>
        <div>
          <div className="text-xl" style={{ color: "var(--yellow)" }}>
            {bossesBeaten(progress)}/{ROOMS.length}
          </div>
          <div className="text-[8px] mt-1 uppercase" style={{ color: "var(--foreground-muted)" }}>
            jefes vencidos
          </div>
        </div>
        <div>
          <div className="text-xl" style={{ color: "var(--status-good-text)" }}>
            {scams.caught}
            <span style={{ color: "var(--foreground-muted)" }}>/{scams.caught + scams.fooled}</span>
          </div>
          <div className="text-[8px] mt-1 uppercase" style={{ color: "var(--foreground-muted)" }}>
            malos consejos frenados
          </div>
        </div>
        <div className="col-span-2">
          <div className="text-xl" style={{ color: "var(--cyan)" }}>
            {reviewQueue(progress).length}
          </div>
          <div className="text-[8px] mt-1 uppercase" style={{ color: "var(--foreground-muted)" }}>
            desafios para repasar
          </div>
        </div>
      </section>

      <section className="pixel-panel w-full p-4">
        <h2 className="text-[8px] mb-3 uppercase" style={{ color: "var(--foreground-muted)" }}>
          Tendencia de precision
        </h2>
        <AccuracyTrend points={trendPoints} />
      </section>

      <section className="w-full">
        <h2 className="text-[8px] mb-4 uppercase" style={{ color: "var(--foreground-muted)" }}>
          Tu nivel en cada escenario (aciertos de las ultimas 10 sesiones)
        </h2>
        <div className="flex flex-col gap-4">
          {roomStats.map(({ room, locked, level, accuracy }) => (
            <div key={room.id} className="pixel-panel px-3 py-3" style={{ opacity: locked ? 0.5 : 1 }}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="truncate">
                  {room.owner.name}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-[8px] uppercase" style={{ color: "var(--accent)" }}>
                    {locked ? "Cerrado" : LEVEL_LABELS[level]}
                  </span>
                  <span className="flex gap-1">
                    {Array.from({ length: MAX_LEVEL + 1 }).map((_, i) => (
                      <span
                        key={i}
                        className="block w-2 h-2"
                        style={{
                          border: "1px solid var(--foreground)",
                          background: !locked && i <= level ? room.color : "transparent",
                        }}
                      />
                    ))}
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-[8px]" style={{ color: "var(--foreground-secondary)" }}>
                <span className="truncate">
                  {TOPICS[room.topic].label} · {TOPICS[room.topic].commands}
                </span>
                <span className="shrink-0">{accuracy !== null ? `${Math.round(accuracy * 100)}%` : "sin datos"}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <button onClick={handleReset} className="pixel-btn pixel-btn-critical py-3 text-[9px] mt-2">
        Borrar progreso
      </button>
    </main>
  );
}
