"use client";

import { useState } from "react";

interface TrendPoint {
  dateISO: string;
  accuracyPct: number;
}

interface AccuracyTrendProps {
  points: TrendPoint[];
}

const WIDTH = 320;
const HEIGHT = 120;
const BASELINE = HEIGHT - 20;
const BAR_GAP = 4;

function formatDateShort(dateISO: string): string {
  const d = new Date(dateISO + "T00:00:00");
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

export default function AccuracyTrend({ points }: AccuracyTrendProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <p className="text-[8px]" style={{ color: "var(--foreground-muted)" }}>
        Todavía no hay sesiones registradas.
      </p>
    );
  }

  const barWidth = Math.max(6, WIDTH / points.length - BAR_GAP);
  const active = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div className="viz-root">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        role="img"
        aria-label="Tendencia de precisión en las últimas sesiones"
      >
        <line x1={0} y1={BASELINE} x2={WIDTH} y2={BASELINE} stroke="var(--border-hairline)" strokeWidth={1} />
        {points.map((p, i) => {
          const x = i * (barWidth + BAR_GAP);
          const h = Math.max(2, (p.accuracyPct / 100) * (BASELINE - 8));
          const y = BASELINE - h;
          const isLast = i === points.length - 1;
          const isHovered = hoverIndex === i;
          return (
            <g key={p.dateISO + i}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={h}
                rx={0}
                fill="var(--chart-blue)"
                stroke={isHovered || isLast ? "var(--foreground)" : "none"}
                strokeWidth={isHovered || isLast ? 2 : 0}
                opacity={isHovered || isLast ? 1 : 0.6}
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex(null)}
                onTouchStart={() => setHoverIndex(i)}
              />
              {isLast && (
                <text
                  x={x + barWidth / 2}
                  y={y - 6}
                  textAnchor="middle"
                  fontSize={9}
                  fontFamily="var(--font-pixel)"
                  fill="var(--foreground-secondary)"
                >
                  {Math.round(p.accuracyPct)}%
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="h-6 text-[8px] text-center" style={{ color: "var(--foreground-muted)" }}>
        {active ? `${formatDateShort(active.dateISO)} · ${Math.round(active.accuracyPct)}% de aciertos` : "Tocá una barra para ver el detalle"}
      </div>
      <table className="sr-only">
        <caption>Precisión por sesión</caption>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Precisión</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.dateISO}>
              <td>{formatDateShort(p.dateISO)}</td>
              <td>{Math.round(p.accuracyPct)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
