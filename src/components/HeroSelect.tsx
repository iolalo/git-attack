"use client";

import { useEffect, useEffectEvent, useState } from "react";
import PixelSprite from "@/components/PixelSprite";
import { HEROES, personPalette, personRows } from "@/lib/sprites";

interface HeroSelectProps {
  /** Personaje actual, si ya había uno elegido. */
  current?: string;
  onPick: (heroId: string) => void;
  /** Volver sin cambiar (sólo cuando ya había un personaje). */
  onCancel?: () => void;
}

/** Pantalla de "elegí tu jugador" de un arcade: tocás uno y confirmás. */
export default function HeroSelect({ current, onPick, onCancel }: HeroSelectProps) {
  const [cursor, setCursor] = useState(() => Math.max(0, HEROES.findIndex((hero) => hero.id === current)));

  // Teclado físico: flechas para moverse por la grilla de 2 columnas, Enter confirma.
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -2, ArrowDown: 2 }[e.key];
    if (step !== undefined) {
      e.preventDefault();
      setCursor((cursor + step + HEROES.length) % HEROES.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      onPick(HEROES[cursor].id);
    } else if (e.key === "Escape" && onCancel) {
      onCancel();
    }
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKeyDown(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <main className="game px-4 py-6 gap-5">
      <h1 className="arcade-title text-[26px] text-center">
        Elegi tu
        <br />
        personaje
      </h1>

      <div className="grid grid-cols-2 gap-4" role="radiogroup" aria-label="Personaje">
        {HEROES.map((hero, i) => {
          const selected = i === cursor;
          return (
            <button
              key={hero.id}
              role="radio"
              aria-checked={selected}
              className="hero-card"
              data-selected={selected}
              onClick={() => setCursor(i)}
            >
              <div className={selected ? "bob" : ""}>
                <PixelSprite rows={personRows(hero.look)} palette={personPalette(hero.look)} scale={5} />
              </div>
              <span>{hero.name}</span>
            </button>
          );
        })}
      </div>

      <button className="pixel-btn pixel-btn-primary w-full py-4 text-xs" onClick={() => onPick(HEROES[cursor].id)}>
        ▶ Jugar con {HEROES[cursor].name}
      </button>
      {onCancel && (
        <button className="pixel-btn w-full py-3.5 text-[9px]" onClick={onCancel}>
          Volver
        </button>
      )}
    </main>
  );
}
