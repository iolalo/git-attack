"use client";

import PixelSprite from "@/components/PixelSprite";
import { FLOOR_1_ROOMS, ROOMS, RoomMeta } from "@/lib/rooms";
import { PersonLook, personPalette, personRows } from "@/lib/sprites";
import { useHeroLook } from "@/lib/useProgress";
import { MAX_LEVEL } from "@/lib/types";

// La pantalla de selección de escenario: una grilla con el retrato y el
// nombre de cada jefe. En el centro estás vos. Hay dos pisos: el 1 (Git en
// tu compu) y el 2 (GitHub); "up" y "down" son las casillas del ascensor.
// Los números son índices de ROOMS.
export type StageCell = number | "hero" | "up" | "down";
export type Floor = 1 | 2;

export const STAGE_COLUMNS = 3;

export const FLOOR_CELLS: Record<Floor, StageCell[]> = {
  1: [0, 1, 2, 3, "hero", 4, 5, 6, "up"],
  2: [7, 8, 9, "down", "hero", 10],
};

/** El piso 2 se abre con el primer escenario de GitHub. */
export const FIRST_FLOOR_2_ROOM = FLOOR_1_ROOMS;

export function cellOfRoom(floor: Floor, roomIndex: number): number {
  return Math.max(0, FLOOR_CELLS[floor].indexOf(roomIndex));
}

function Portrait({ look }: { look: PersonLook }) {
  return <PixelSprite className="stage-portrait" rows={personRows(look).slice(0, 15)} palette={personPalette(look)} scale={4} />;
}

interface StageSelectProps {
  floor: Floor;
  /** Casilla donde está el cursor (índice dentro del piso). */
  cursor: number;
  onMove: (cell: number) => void;
  /** Tocar la casilla que ya tiene el cursor. */
  onConfirm: () => void;
  levels: (room: RoomMeta) => number;
  /** Escenario cerrado: todavía no le ganaste al jefe del anterior. */
  isLocked: (roomIndex: number) => boolean;
  /** Escenario que acaba de abrir. */
  justOpened?: number;
  /** Entrando a un escenario: la pantalla parpadea. */
  entering: boolean;
}

export default function StageSelect({ floor, cursor, onMove, onConfirm, levels, isLocked, justOpened, entering }: StageSelectProps) {
  const heroLook = useHeroLook();
  return (
    <div className="stage-select">
      <div className="stage-grid">
        {FLOOR_CELLS[floor].map((cell, i) => {
          const active = i === cursor;
          const press = () => (active ? onConfirm() : onMove(i));
          if (cell === "hero") {
            return (
              <button key="hero" className="stage-cell" data-active={active} onClick={press} aria-label="Tu personaje">
                <div className="stage-frame">
                  <Portrait look={heroLook} />
                </div>
                <span>Vos</span>
                <div className="stage-pips" />
              </button>
            );
          }
          if (cell === "up" || cell === "down") {
            const closed = cell === "up" && isLocked(FIRST_FLOOR_2_ROOM);
            return (
              <button
                key={cell}
                className="stage-cell"
                data-active={active}
                data-locked={closed}
                onClick={press}
                aria-label={cell === "up" ? "Subir al piso 2: GitHub" : "Bajar al piso 1"}
              >
                <div className="stage-frame">
                  <span className="stage-mark">{closed ? "?" : cell === "up" ? "▲" : "▼"}</span>
                </div>
                <span>{cell === "up" ? "Piso 2" : "Piso 1"}</span>
                <div className="stage-pips" />
              </button>
            );
          }
          const room = ROOMS[cell];
          const locked = isLocked(cell);
          return (
            <button
              key={room.id}
              className="stage-cell"
              data-active={active}
              data-locked={locked}
              onClick={press}
              aria-label={`${room.owner.name}, ${room.name}${locked ? ", cerrado" : ""}`}
            >
              <div className="stage-frame">
                <Portrait look={room.owner.look} />
                {cell === justOpened && <span className="stage-new">¡Nuevo!</span>}
              </div>
              <span>{room.owner.name}</span>
              {/* nivel alcanzado en este escenario */}
              <div className="stage-pips">
                {!locked &&
                  Array.from({ length: MAX_LEVEL + 1 }).map((_, level) => (
                    <span key={level} style={level <= levels(room) ? { background: "var(--yellow)" } : undefined} />
                  ))}
              </div>
            </button>
          );
        })}
      </div>
      {entering && <div className="stage-flash" aria-hidden />}
    </div>
  );
}
