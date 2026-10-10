"use client";

import { ReactNode, useEffect, useEffectEvent, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import HeroSelect from "@/components/HeroSelect";
import PixelSprite from "@/components/PixelSprite";
import SoundToggle, { useMusic } from "@/components/SoundToggle";
import StageSelect, { FIRST_FLOOR_2_ROOM, FLOOR_CELLS, Floor, STAGE_COLUMNS, cellOfRoom } from "@/components/StageSelect";
import { playSfx } from "@/lib/audio";
import { ROOMS, floorOf } from "@/lib/rooms";
import {
  bossesBeaten,
  frontierIndex,
  getProgress,
  hasSeenLesson,
  isRoomLocked,
  lastRoomIndex,
  markUnlocksSeen,
  reviewQueue,
  roomLevel,
  setHero,
} from "@/lib/storage";
import { useHeroLook, useHydrated, useProgress } from "@/lib/useProgress";
import { PersonLook, personPalette, personRows } from "@/lib/sprites";
import { plain } from "@/lib/text";
import { LEVEL_LABELS, ProgressData, TOPICS } from "@/lib/types";

// Cómo se responde en cada nivel del escenario.
const LEVEL_MODE = ["elegís entre opciones", "escribís el comando, con pista", "escribís el comando, sin pista"];
/** Lo que dura el parpadeo de la pantalla antes de entrar al escenario. */
const ENTER_MS = 620;

function computeLifetimeStats(progress: ProgressData) {
  let totalExercises = 0;
  for (const session of progress.history) totalExercises += session.results.length;
  const recent = progress.history.slice(-5);
  const recentAccuracy =
    recent.length > 0
      ? Math.round((recent.reduce((sum, s) => sum + s.overallAccuracy, 0) / recent.length) * 100)
      : null;
  return { totalExercises, recentAccuracy };
}

export default function Home() {
  // Dónde arranca el cursor depende de lo guardado en el navegador: la
  // pantalla se vuelve a montar una vez hidratada, ya con ese dato.
  const hydrated = useHydrated();
  return <Office key={hydrated ? "client" : "server"} hydrated={hydrated} />;
}

/** En qué escenario aparece el cursor al volver, y si hay uno recién abierto. */
function arrival(hydrated: boolean): { index: number; justOpened?: number } {
  if (!hydrated) return { index: 0 };
  const progress = getProgress();
  const frontier = frontierIndex(progress);
  if (frontier > (progress.unlocksSeen ?? 0)) return { index: frontier, justOpened: frontier };
  return { index: lastRoomIndex(progress) };
}

/** Cabecera del panel de abajo: retrato, título y dos renglones. */
function PanelHeader({ look, title, lines }: { look?: PersonLook; title: string; lines: ReactNode[] }) {
  return (
    <div className="flex items-center gap-3">
      {look && (
        <div className="portrait">
          <PixelSprite rows={personRows(look).slice(0, 16)} palette={personPalette(look)} scale={3} />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[11px] leading-snug" style={{ color: "var(--yellow)" }}>
          {title}
        </p>
        {lines.map((line, i) => (
          <p key={i} className="text-[8px]" style={{ color: i === 0 ? "var(--foreground-secondary)" : "var(--accent)" }}>
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

function Office({ hydrated }: { hydrated: boolean }) {
  const router = useRouter();
  const progress = useProgress();
  const heroLook = useHeroLook();
  const stats = computeLifetimeStats(progress);
  const [start] = useState(() => arrival(hydrated));
  const [place, setPlace] = useState(() => {
    const floor = floorOf(start.index);
    return { floor, cursor: cellOfRoom(floor, start.index) };
  });
  const [entering, setEntering] = useState(false);
  const [changingHero, setChangingHero] = useState(false);
  const enterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useMusic("street");
  const pickingHero = changingHero || (hydrated && !progress.heroId);

  const cells = FLOOR_CELLS[place.floor];
  const cell = cells[place.cursor];
  const room = typeof cell === "number" ? ROOMS[cell] : null;
  const isLocked = (index: number) => isRoomLocked(progress, index);
  const locked = typeof cell === "number" && isLocked(cell);
  const previousRoom = typeof cell === "number" ? ROOMS[cell - 1] : undefined;
  const floor2Locked = isLocked(FIRST_FLOOR_2_ROOM);
  const pendingReview = reviewQueue(progress).length;

  useEffect(() => {
    if (start.justOpened !== undefined) markUnlocksSeen(start.justOpened);
  }, [start.justOpened]);

  useEffect(
    () => () => {
      if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
    },
    []
  );

  function moveCursor(next: number) {
    if (entering || next === place.cursor) return;
    setPlace({ ...place, cursor: next });
  }

  function goToFloor(floor: Floor) {
    playSfx("enter");
    setPlace({ floor, cursor: FLOOR_CELLS[floor].indexOf(floor === 2 ? "down" : "up") });
  }

  /** Confirmar la casilla del cursor: entrar al escenario, cambiar de piso o de personaje. */
  function confirm() {
    if (entering) return;
    if (cell === "hero") return setChangingHero(true);
    if (cell === "down") return goToFloor(1);
    if (cell === "up") return floor2Locked ? undefined : goToFloor(2);
    if (!room || locked) return;
    playSfx("enter");
    setEntering(true);
    enterTimerRef.current = setTimeout(() => router.push(`/session?room=${room.id}`), ENTER_MS);
  }

  // Teclado físico: las flechas mueven el cursor por la grilla, Enter confirma.
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (pickingHero) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -STAGE_COLUMNS, ArrowDown: STAGE_COLUMNS }[e.key];
    if (step !== undefined) {
      e.preventDefault();
      const next = place.cursor + step;
      const sameRow =
        Math.abs(step) !== 1 || Math.floor(next / STAGE_COLUMNS) === Math.floor(place.cursor / STAGE_COLUMNS);
      if (next >= 0 && next < cells.length && sameRow) moveCursor(next);
    } else if (e.key === "Enter") {
      e.preventDefault();
      confirm();
    }
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKeyDown(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (pickingHero) {
    return (
      <HeroSelect
        current={progress.heroId}
        onPick={(heroId) => {
          setHero(heroId);
          setChangingHero(false);
        }}
        onCancel={progress.heroId ? () => setChangingHero(false) : undefined}
      />
    );
  }

  const note = (text: string) => (
    <p className="text-[8px] mt-3 min-h-[42px]" style={{ color: "var(--foreground-secondary)" }}>
      {text}
    </p>
  );

  return (
    <main className="game pb-6">
      <div className="flex justify-end px-4 pt-3">
        <SoundToggle />
      </div>
      <header className="text-center pt-2 pb-4 px-4">
        <h1 className="arcade-title text-[32px]">
          Git
          <br />
          Attack
        </h1>
        <p className="text-[8px] mt-3" style={{ color: "var(--foreground-muted)" }}>
          CONTROL DE VERSIONES PARA POWER BI
        </p>
      </header>

      <div className="flex justify-between px-4 pb-3 text-[8px] uppercase">
        <span>
          <span style={{ color: "var(--accent)" }}>Racha</span>
          <br />
          {progress.streak.count} {progress.streak.count === 1 ? "dia" : "dias"}
        </span>
        <span className="text-center">
          <span style={{ color: "var(--accent)" }}>Desafios</span>
          <br />
          {String(stats.totalExercises).padStart(4, "0")}
        </span>
        <span className="text-center">
          <span style={{ color: "var(--accent)" }}>Jefes</span>
          <br />
          {bossesBeaten(progress)}/{ROOMS.length}
        </span>
        <span className="text-right">
          <span style={{ color: "var(--accent)" }}>Precision</span>
          <br />
          {stats.recentAccuracy !== null ? `${stats.recentAccuracy}%` : "—"}
        </span>
      </div>

      <p className="text-center text-[8px] uppercase pb-2" style={{ color: "var(--yellow)" }}>
        {place.floor === 1 ? "Piso 1 · Git en tu compu" : "Piso 2 · GitHub"}
      </p>

      <StageSelect
        floor={place.floor}
        cursor={place.cursor}
        onMove={moveCursor}
        onConfirm={confirm}
        levels={(r) => roomLevel(progress, r.id)}
        isLocked={isLocked}
        justOpened={start.justOpened}
        entering={entering}
      />

      <section className="pixel-panel mx-4 mt-5 p-3">
        {room ? (
          <>
            <PanelHeader
              look={room.owner.look}
              title={TOPICS[room.topic].label}
              lines={[TOPICS[room.topic].commands, `${room.name} · ${room.owner.name}`]}
            />
            {note(
              locked && previousRoom ? `Sin acceso. Ganale a ${previousRoom.owner.name} en ${previousRoom.name} para que te abran.` : room.blurb
            )}
            {!locked && (
              <p className="text-[8px] mb-1 uppercase" style={{ color: "var(--cyan)" }}>
                {LEVEL_LABELS[roomLevel(progress, room.id)]}: {plain(LEVEL_MODE[roomLevel(progress, room.id)])}
              </p>
            )}
            <button className="pixel-btn pixel-btn-primary w-full py-4 text-xs mt-2" onClick={confirm} disabled={entering || locked}>
              {locked ? "Cerrado" : "▶ Entrar"}
            </button>
            {!locked && hasSeenLesson(progress, room.id) && (
              <Link href={`/session?room=${room.id}&leccion`} className="pixel-btn block text-center py-3 text-[9px] mt-3">
                Repasar la leccion
              </Link>
            )}
          </>
        ) : cell === "hero" ? (
          <>
            <PanelHeader look={heroLook} title="Vos" lines={["Analista de BI", "Tu informe: Ventas.pbip"]} />
            {note(
              "Tu informe está guardado como proyecto (.pbip). Recorré los escenarios en orden: cada uno arranca con una mini lección, sigue con cinco pedidos y termina con un jefe. Ganale para que se abra el siguiente."
            )}
            <button className="pixel-btn w-full py-4 text-xs mt-2" onClick={confirm}>
              Cambiar personaje
            </button>
          </>
        ) : cell === "up" ? (
          <>
            <PanelHeader title="Piso 2 · GitHub" lines={["clone · push · pull · pull requests"]} />
            {note(
              floor2Locked
                ? `Sin acceso. Terminá el piso 1: ganale a ${ROOMS[FIRST_FLOOR_2_ROOM - 1].owner.name} para que se abra el ascensor.`
                : "El mismo informe, ahora compartido con el equipo: repositorio remoto, subir y bajar cambios, y pull requests."
            )}
            <button className="pixel-btn pixel-btn-primary w-full py-4 text-xs mt-2" onClick={confirm} disabled={floor2Locked}>
              {floor2Locked ? "Cerrado" : "▲ Subir"}
            </button>
          </>
        ) : (
          <>
            <PanelHeader title="Piso 1 · Git en tu compu" lines={["init · commit · ramas · merge"]} />
            {note("Todo lo que hacés con Git sin conexión: guardar cambios, leer el historial, deshacer, ramas y merges.")}
            <button className="pixel-btn pixel-btn-primary w-full py-4 text-xs mt-2" onClick={confirm}>
              ▼ Bajar
            </button>
          </>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 mx-4 mt-5">
        <Link href="/session" className="pixel-btn text-center py-3.5 text-[9px]">
          Repaso rapido{pendingReview > 0 ? ` (${pendingReview})` : ""}
        </Link>
        <Link href="/progress" className="pixel-btn text-center py-3.5 text-[9px]">
          Progreso
        </Link>
        <Link href="/machete" className="pixel-btn text-center py-3.5 text-[9px]">
          Machete
        </Link>
        <Link href="/sandbox" className="pixel-btn text-center py-3.5 text-[9px]">
          Consola libre
        </Link>
      </div>
    </main>
  );
}
