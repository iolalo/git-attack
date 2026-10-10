interface PixelSpriteProps {
  rows: string[];
  palette: Record<string, string>;
  /** Píxeles de pantalla por cada píxel del sprite. */
  scale?: number;
  className?: string;
}

/** Dibuja un mapa de caracteres (ver lib/sprites.ts) como SVG de bordes duros. */
export default function PixelSprite({ rows, palette, scale = 3, className }: PixelSpriteProps) {
  const width = rows[0].length;
  const height = rows.length;
  const rects: { x: number; y: number; w: number; fill: string }[] = [];

  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      if (ch !== ".") rects.push({ x, y, w: end - x, fill: palette[ch] });
      x = end;
    }
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width * scale}
      height={height * scale}
      shapeRendering="crispEdges"
      className={className}
      aria-hidden
    >
      {rects.map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </svg>
  );
}
