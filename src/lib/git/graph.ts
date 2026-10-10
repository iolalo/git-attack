import { Commit, Repo, currentBranch, headId, visibleCommits } from "./sim";

export interface GraphLabel {
  text: string;
  /** "head" = la rama donde estás parado (o la HEAD desacoplada); "remote" = origin/x. */
  kind: "head" | "branch" | "remote";
}

export interface GraphRow {
  commit: Commit;
  /** Columna en la que se dibuja: una por línea de trabajo. */
  lane: number;
  labels: GraphLabel[];
}

export interface GraphEdge {
  /** Filas del hijo (arriba) y del padre (abajo). */
  from: number;
  to: number;
  fromLane: number;
  toLane: number;
  /** Segundo padre de un commit de merge: la rama que entró. */
  merged: boolean;
}

export interface Graph {
  rows: GraphRow[];
  edges: GraphEdge[];
  lanes: number;
}

/**
 * Acomoda el historial como `git log --graph`: el commit más nuevo arriba y
 * una columna por rama. main va siempre en la primera columna.
 */
export function layoutGraph(repo: Repo): Graph {
  const commits = visibleCommits(repo);
  const lanes = new Map<string, number>();
  let next = 0;
  const claim = (tip: string | null | undefined) => {
    if (!tip || lanes.has(tip)) return;
    const lane = next++;
    for (let id: string | undefined = tip; id && !lanes.has(id); id = repo.commits[id].parents[0]) lanes.set(id, lane);
  };

  const branches = Object.keys(repo.branches).sort((a, b) => {
    const rank = (name: string) => (name === "main" || name === "master" ? 0 : 1);
    return rank(a) - rank(b) || repo.commits[repo.branches[a]].seq - repo.commits[repo.branches[b]].seq;
  });
  for (const branch of branches) claim(repo.branches[branch]);
  for (const tip of Object.values(repo.tracking)) claim(tip);
  claim(headId(repo));
  for (const commit of commits) claim(commit.id);

  const current = currentBranch(repo);
  const rowOf = new Map(commits.map((commit, row) => [commit.id, row]));
  const rows = commits.map((commit) => {
    const labels: GraphLabel[] = [];
    if (!current && headId(repo) === commit.id) labels.push({ text: "HEAD", kind: "head" });
    for (const branch of branches) {
      if (repo.branches[branch] !== commit.id) continue;
      if (branch === current) labels.unshift({ text: `HEAD → ${branch}`, kind: "head" });
      else labels.push({ text: branch, kind: "branch" });
    }
    for (const branch of Object.keys(repo.tracking).sort()) {
      if (repo.tracking[branch] === commit.id) labels.push({ text: `origin/${branch}`, kind: "remote" });
    }
    return { commit, lane: lanes.get(commit.id)!, labels };
  });

  const edges = commits.flatMap((commit, from) =>
    commit.parents.map((parent, i) => ({
      from,
      to: rowOf.get(parent)!,
      fromLane: lanes.get(commit.id)!,
      toLane: lanes.get(parent)!,
      merged: i > 0,
    }))
  );
  return { rows, edges, lanes: next };
}
