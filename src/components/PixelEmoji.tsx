"use client";

import { useEffect, useRef } from "react";

interface PixelEmojiProps {
  emoji: string;
  /** Tamaño en pantalla (px). */
  size?: number;
  /** Resolución real del dibujo: cuanto más baja, más "pixelado". */
  grid?: number;
  className?: string;
}

/**
 * Dibuja un emoji en un canvas diminuto y lo agranda sin suavizado, para
 * que los productos se vean como pixel art y no como un emoji del sistema.
 */
export default function PixelEmoji({ emoji, size = 64, grid = 22, className }: PixelEmojiProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, grid, grid);
    ctx.font = `${Math.round(grid * 0.78)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, grid / 2, grid / 2 + 1);
  }, [emoji, grid]);

  return (
    <canvas
      ref={canvasRef}
      width={grid}
      height={grid}
      className={className}
      style={{ width: size, height: size, imageRendering: "pixelated" }}
      aria-hidden
    />
  );
}
