"use client";

import { layoutGraph } from "@/lib/git/graph";
import { Repo, aheadBehind, currentBranch, status } from "@/lib/git/sim";

const ROW_PX = 24;
const LANE_PX = 14;
const NODE_PX = 8;

// Un color por columna del grafo (por línea de trabajo).
const LANE_COLORS = ["var(--cyan)", "var(--pink)", "var(--yellow)", "var(--status-good-text)"];
const laneColor = (lane: number) => LANE_COLORS[lane % LANE_COLORS.length];

const laneX = (lane: number) => lane * LANE_PX + NODE_PX;
const rowY = (row: number) => row * ROW_PX + ROW_PX / 2;

interface FileEntry {
  mark: string;
  path: string;
  color: string;
}

function FileList({ title, entries, empty }: { title: string; entries: FileEntry[]; empty: string }) {
  return (
    <div className="monitor-zone">
      <p className="monitor-title">{title}</p>
      {entries.length === 0 && <p className="monitor-empty">{empty}</p>}
      {entries.map((entry) => (
        <p key={entry.path} className="monitor-file" style={{ color: entry.color }}>
          <span>{entry.mark}</span>
          <span>{entry.path}</span>
        </p>
      ))}
    </div>
  );
}

const KIND_MARK = { new: "+", modified: "M", deleted: "D" };

const LABEL_COLOR = { head: "var(--status-good-text)", remote: "var(--yellow)" };

/** Lo que hay en GitHub, comparado con tu compu: es lo que el servidor sabe, hayas hecho fetch o no. */
function RemoteStrip({ repo }: { repo: Repo }) {
  const remote = repo.remote;
  if (!remote) return null;
  const branch = currentBranch(repo);
  const sync = branch ? aheadBehind(repo, branch) : null;
  const state = !repo.initialized
    ? `${Object.keys(remote.branches).length === 1 ? "1 rama" : `${Object.keys(remote.branches).length} ramas`} para clonar`
    : !branch
      ? "HEAD desacoplada"
      : !sync
        ? `${branch}: sin subir`
        : sync.ahead + sync.behind === 0
          ? `${branch}: al dia`
          : `${branch}:${sync.ahead ? ` ▲${sync.ahead} sin subir` : ""}${sync.behind ? ` ▼${sync.behind} sin bajar` : ""}`;
  return (
    <div className="monitor-banner" style={{ color: "var(--yellow)" }}>
      <p>GitHub · {state}</p>
      {remote.prs.map((pr) => (
        <p key={pr.number} style={{ color: pr.merged ? "var(--status-good-text)" : "var(--pink)" }}>
          PR #{pr.number} {pr.merged ? "fusionado" : "abierto"}: {pr.branch}
        </p>
      ))}
    </div>
  );
}

/**
 * El monitor del escritorio: muestra las tres zonas de Git tal como quedan
 * después de cada comando. Arriba, la carpeta y el staging; abajo, el
 * historial dibujado como `git log --graph`.
 */
export default function RepoView({ repo }: { repo: Repo }) {
  if (!repo.initialized) {
    const files = Object.keys(repo.work).sort();
    return (
      <div className="monitor">
        <FileList
          title="Carpeta comun · sin Git"
          entries={files.map((path) => ({ mark: " ", path, color: "var(--foreground-secondary)" }))}
          empty="vacía"
        />
        <RemoteStrip repo={repo} />
      </div>
    );
  }

  const { staged, unstaged, untracked, conflicts } = status(repo);
  const red = "var(--status-critical)";
  const work: FileEntry[] = [
    ...conflicts.map((path) => ({ mark: "!", path, color: "var(--pink)" })),
    ...unstaged.map((change) => ({ mark: KIND_MARK[change.kind], path: change.path, color: red })),
    ...untracked.map((path) => ({ mark: "?", path, color: red })),
  ];
  const index: FileEntry[] = staged.map((change) => ({
    mark: KIND_MARK[change.kind],
    path: change.path,
    color: "var(--status-good-text)",
  }));

  const graph = layoutGraph(repo);
  const gutter = laneX(Math.max(0, graph.lanes - 1)) + NODE_PX;

  return (
    <div className="monitor">
      <div className="monitor-zones">
        <FileList title="Carpeta" entries={work} empty="sin cambios" />
        <span className="monitor-arrow" aria-hidden>
          ▶
        </span>
        <FileList title="Staging" entries={index} empty="vacío" />
      </div>

      {repo.merging && (
        <p className="monitor-banner" style={{ color: "var(--pink)" }}>
          Merge en curso: entra {repo.merging.name}
        </p>
      )}
      {repo.stash.length > 0 && (
        <p className="monitor-banner" style={{ color: "var(--cyan)" }}>
          Cajon (stash): {repo.stash.length} {repo.stash.length === 1 ? "guardado" : "guardados"}
        </p>
      )}
      <RemoteStrip repo={repo} />

      <div className="monitor-history">
        <p className="monitor-title">Historial</p>
        {graph.rows.length === 0 ? (
          <p className="monitor-empty">todavía no hay commits</p>
        ) : (
          <div className="graph" style={{ paddingLeft: gutter }}>
            <svg width={gutter} height={graph.rows.length * ROW_PX} aria-hidden>
              {graph.edges.map((edge) => {
                const [x1, y1, x2, y2] = [laneX(edge.fromLane), rowY(edge.from), laneX(edge.toLane), rowY(edge.to)];
                // la rama se abre (dobla al llegar al padre) o entra en un merge (dobla al salir)
                const bend = edge.merged ? `L ${x2} ${y1 + ROW_PX / 2}` : `L ${x1} ${y2 - ROW_PX / 2}`;
                return (
                  <path
                    key={`${edge.from}-${edge.to}`}
                    d={`M ${x1} ${y1} ${x1 === x2 ? "" : bend} L ${x2} ${y2}`}
                    fill="none"
                    stroke={laneColor(edge.merged ? edge.toLane : edge.fromLane)}
                    strokeWidth={2}
                  />
                );
              })}
              {graph.rows.map((row, i) => (
                <rect
                  key={row.commit.id}
                  x={laneX(row.lane) - NODE_PX / 2}
                  y={rowY(i) - NODE_PX / 2}
                  width={NODE_PX}
                  height={NODE_PX}
                  fill={laneColor(row.lane)}
                  stroke="#0b0812"
                  strokeWidth={2}
                />
              ))}
            </svg>
            {graph.rows.map((row) => (
              <div key={row.commit.id} className="graph-row graph-row-new">
                <span className="graph-hash">{row.commit.id}</span>
                {row.labels.map((label) => (
                  <span
                    key={label.text}
                    className="graph-label"
                    style={{ color: label.kind === "branch" ? laneColor(row.lane) : LABEL_COLOR[label.kind] }}
                  >
                    {label.text}
                  </span>
                ))}
                <span className="graph-message">{row.commit.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
