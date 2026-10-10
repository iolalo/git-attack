"use client";

import { ReactNode, useEffect, useEffectEvent, useState } from "react";

interface ArcadeMenuProps {
  items: ReactNode[];
  onPick: (index: number) => void;
  className?: string;
}

/**
 * Menú con cursor ▶ como el "PLAY AGAIN? YES / NO" de un arcade: flechas
 * para moverse, Enter para confirmar. También se puede tocar la opción.
 */
export default function ArcadeMenu({ items, onPick, className = "" }: ArcadeMenuProps) {
  const [cursor, setCursor] = useState(0);
  const count = items.length;

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setCursor((cursor + step + count) % count);
    } else if (e.key === "Enter") {
      e.preventDefault();
      onPick(cursor);
    }
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKeyDown(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div role="menu" className={`arcade-menu ${className}`}>
      {items.map((item, i) => (
        <button
          key={i}
          role="menuitem"
          className="arcade-menu-item"
          data-active={i === cursor}
          onPointerEnter={() => setCursor(i)}
          onClick={() => onPick(i)}
        >
          <span>{item}</span>
        </button>
      ))}
    </div>
  );
}
