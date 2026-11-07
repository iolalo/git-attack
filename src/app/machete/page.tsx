"use client";

import Link from "next/link";
import PixelSprite from "@/components/PixelSprite";
import { MACHETE } from "@/lib/lessons";
import { ROOMS, floorOf } from "@/lib/rooms";
import { isBossDefeated } from "@/lib/storage";
import { personPalette, personRows } from "@/lib/sprites";
import { plain } from "@/lib/text";
import { TOPICS } from "@/lib/types";
import { useProgress } from "@/lib/useProgress";

/** El machete: los comandos que te llevaste de cada jefe, para consultar fuera del juego. */
export default function MachetePage() {
  const progress = useProgress();
  const won = ROOMS.filter((room) => isBossDefeated(progress, room.id)).length;

  return (
    <main className="game px-4 py-6 gap-5">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-[8px] uppercase" style={{ color: "var(--foreground-muted)" }}>
          ← volver
        </Link>
        <h1 className="text-xs uppercase" style={{ color: "var(--accent)" }}>
          Machete
        </h1>
        <span className="w-12 text-right text-[8px]">
          {won}/{ROOMS.length}
        </span>
      </div>

      <p className="text-[8px] leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
        Cada jefe que vencés te deja sus comandos. Los que todavía no venciste quedan tapados.
      </p>

      {ROOMS.map((room, index) => {
        const open = isBossDefeated(progress, room.id);
        const firstOfFloor = index === 0 || floorOf(index) !== floorOf(index - 1);
        return (
          <div key={room.id} className="flex flex-col gap-5">
            {firstOfFloor && (
              <h2 className="text-[9px] uppercase" style={{ color: "var(--yellow)" }}>
                {["", "Piso 1 · Git en tu compu", "Piso 2 · GitHub", "Piso 3 · Casos reales"][floorOf(index)]}
              </h2>
            )}
            <section className="pixel-panel p-3" style={{ opacity: open ? 1 : 0.55 }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="portrait" data-locked={!open}>
                  <PixelSprite
                    className={open ? "" : "silhouette"}
                    rows={personRows(room.owner.look).slice(0, 11)}
                    palette={personPalette(room.owner.look)}
                    scale={2}
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase" style={{ color: "var(--yellow)" }}>
                    {open ? room.owner.name : "???"}
                  </p>
                  <p className="text-[8px] uppercase" style={{ color: "var(--foreground-muted)" }}>
                    {plain(TOPICS[room.topic].label)}
                  </p>
                </div>
              </div>
              {open ? (
                <div className="flex flex-col gap-3">
                  {MACHETE[room.id].map((entry) => (
                    <div key={entry.cmd}>
                      <code className="cmd" style={{ color: "var(--status-good-text)" }}>
                        {entry.cmd}
                      </code>
                      <p className="text-[8px] leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                        {entry.what}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[8px] uppercase" style={{ color: "var(--foreground-muted)" }}>
                  Vencelo para conseguir sus comandos
                </p>
              )}
            </section>
          </div>
        );
      })}
    </main>
  );
}
