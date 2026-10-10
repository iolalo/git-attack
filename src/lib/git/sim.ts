// Git de mentira: un repositorio entero en memoria que entiende los comandos
// de todos los días. No toca el disco ni usa Git de verdad; sirve para que
// cada desafío muestre qué le hace un comando a la carpeta, al staging y al
// historial. Los mensajes imitan la traducción al castellano de Git.

export type Files = Record<string, string>;

export interface Commit {
  id: string;
  parents: string[];
  message: string;
  tree: Files;
  /** Orden de creación: el historial se muestra del más nuevo al más viejo. */
  seq: number;
}

export type Head = { branch: string } | { detached: string };

interface StashEntry {
  message: string;
  work: Files;
  index: Files;
}

interface MergeState {
  theirs: string;
  /** Nombre de la rama que se está trayendo. */
  name: string;
  /** Archivos que todavía tienen el conflicto sin resolver. */
  conflicts: string[];
}

export interface PullRequest {
  number: number;
  branch: string;
  title: string;
  merged: boolean;
}

/** El servidor (GitHub): lo que hay subido, lo sepa o no este repositorio. */
export interface Remote {
  url: string;
  branches: Record<string, string>;
  prs: PullRequest[];
}

export interface Repo {
  /** false = carpeta común, todavía sin `git init`. */
  initialized: boolean;
  /** Carpeta de trabajo. */
  work: Files;
  /** Staging: lo que entra en el próximo commit. */
  index: Files;
  commits: Record<string, Commit>;
  /** Una rama sin commits todavía no figura acá. */
  branches: Record<string, string>;
  head: Head;
  stash: StashEntry[];
  merging: MergeState | null;
  /** Las ramas origin/x: dónde estaba cada rama del remoto en el último fetch. */
  tracking: Record<string, string>;
  /** Ramas locales ya enlazadas con su par del remoto (push -u). */
  upstream: string[];
  /** null = todavía no hay remoto conectado. */
  remote: Remote | null;
  seq: number;
}

export interface ParsedCommand {
  /** "git", "echo", "ls"... */
  program: string;
  /** Subcomando de git ("commit", "status"...); vacío en los demás. */
  sub: string;
  /** Todo lo que viene después del programa (incluye el subcomando). */
  args: string[];
}

export interface RunResult {
  repo: Repo;
  output: string[];
  /** false = el comando falló: el repositorio queda como estaba. */
  ok: boolean;
  /** El comando modificó algo (carpeta, staging, historial o ramas). */
  changed: boolean;
  commands: ParsedCommand[];
}

export interface Change {
  path: string;
  kind: "new" | "modified" | "deleted";
}

export interface RepoStatus {
  staged: Change[];
  unstaged: Change[];
  untracked: string[];
  conflicts: string[];
}

class SimError extends Error {}

function fail(message: string): never {
  throw new SimError(message);
}

export function emptyRepo(): Repo {
  return {
    initialized: false,
    work: {},
    index: {},
    commits: {},
    branches: {},
    head: { branch: "main" },
    stash: [],
    merging: null,
    tracking: {},
    upstream: [],
    remote: null,
    seq: 0,
  };
}

// ---------------------------------------------------------------- consultas

export function headId(repo: Repo): string | null {
  return "branch" in repo.head ? repo.branches[repo.head.branch] ?? null : repo.head.detached;
}

export function headTree(repo: Repo): Files {
  const id = headId(repo);
  return id ? repo.commits[id].tree : {};
}

/** Rama en la que estás parado; null con la HEAD desacoplada. */
export function currentBranch(repo: Repo): string | null {
  return "branch" in repo.head ? repo.head.branch : null;
}

/** El commit y todos sus antepasados. */
export function ancestors(repo: Repo, id: string): Set<string> {
  const seen = new Set<string>();
  const pending = [id];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (seen.has(current) || !repo.commits[current]) continue;
    seen.add(current);
    pending.push(...repo.commits[current].parents);
  }
  return seen;
}

/** ¿`older` está en el historial de `newer` (o es el mismo commit)? */
export function isAncestor(repo: Repo, older: string, newer: string): boolean {
  return ancestors(repo, newer).has(older);
}

/** Traduce HEAD, HEAD~2, una rama o el comienzo de un hash al id del commit. */
export function resolveRef(repo: Repo, ref: string): string | null {
  const match = /^(.*?)((?:~\d*|\^)*)$/.exec(ref);
  if (!match) return null;
  const [, base, suffix] = match;
  let id: string | null;
  if (base === "HEAD" || base === "@") id = headId(repo);
  else if (repo.branches[base]) id = repo.branches[base];
  else if (base.startsWith("origin/") && repo.tracking[base.slice(7)]) id = repo.tracking[base.slice(7)];
  else {
    const found = base.length >= 4 ? Object.keys(repo.commits).filter((commit) => commit.startsWith(base)) : [];
    id = found.length === 1 ? found[0] : null;
  }
  for (const step of suffix.match(/~\d*|\^/g) ?? []) {
    const times = step === "^" || step === "~" ? 1 : Number(step.slice(1));
    for (let i = 0; i < times && id; i++) id = repo.commits[id].parents[0] ?? null;
  }
  return id;
}

function diffTrees(from: Files, to: Files): Change[] {
  const changes: Change[] = [];
  for (const path of [...new Set([...Object.keys(from), ...Object.keys(to)])].sort()) {
    if (from[path] === to[path]) continue;
    changes.push({ path, kind: !(path in from) ? "new" : !(path in to) ? "deleted" : "modified" });
  }
  return changes;
}

function matchesPattern(path: string, pattern: string): boolean {
  if (pattern.endsWith("/")) return path.startsWith(pattern);
  if (pattern.includes("*")) {
    const regex = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
    return regex.test(path) || regex.test(path.split("/").pop()!);
  }
  return path === pattern || path.split("/").pop() === pattern;
}

function isIgnored(repo: Repo, path: string): boolean {
  const patterns = (repo.work[".gitignore"] ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  return patterns.some((pattern) => matchesPattern(path, pattern));
}

/** Lo que mostraría `git status`, separado por zona. */
export function status(repo: Repo): RepoStatus {
  const conflicts = repo.merging?.conflicts ?? [];
  const staged = diffTrees(headTree(repo), repo.index).filter((change) => !conflicts.includes(change.path));
  const unstaged: Change[] = [];
  for (const path of Object.keys(repo.index).sort()) {
    if (conflicts.includes(path)) continue;
    if (!(path in repo.work)) unstaged.push({ path, kind: "deleted" });
    else if (repo.work[path] !== repo.index[path]) unstaged.push({ path, kind: "modified" });
  }
  const untracked = Object.keys(repo.work)
    .filter((path) => !(path in repo.index) && !conflicts.includes(path) && !isIgnored(repo, path))
    .sort();
  return { staged, unstaged, untracked, conflicts };
}

/** Nada pendiente: ni preparado, ni modificado, ni sin seguimiento. */
export function isClean(repo: Repo): boolean {
  const { staged, unstaged, untracked, conflicts } = status(repo);
  return staged.length + unstaged.length + untracked.length + conflicts.length === 0;
}

/** Commits que se ven desde alguna rama o desde HEAD, del más nuevo al más viejo. */
export function visibleCommits(repo: Repo): Commit[] {
  const ids = new Set<string>();
  const tips = [...Object.values(repo.branches), ...Object.values(repo.tracking), headId(repo), repo.merging?.theirs];
  for (const tip of tips) if (tip) for (const id of ancestors(repo, tip)) ids.add(id);
  return [...ids].map((id) => repo.commits[id]).sort((a, b) => b.seq - a.seq);
}

/** Commits que están en `from` y no en `to`. */
function countMissing(repo: Repo, from: string | undefined, to: string | undefined): number {
  if (!from) return 0;
  const have = to ? ancestors(repo, to) : new Set<string>();
  return [...ancestors(repo, from)].filter((id) => !have.has(id)).length;
}

/**
 * Cuántos commits de la rama faltan subir (`ahead`) y cuántos del remoto
 * faltan bajar (`behind`). Con `known` se compara contra origin/x (lo que
 * sabe este repositorio); sin eso, contra lo que hay de verdad en el servidor.
 */
export function aheadBehind(repo: Repo, branch: string, known = false): { ahead: number; behind: number } | null {
  const theirs = known ? repo.tracking[branch] : repo.remote?.branches[branch];
  const mine = repo.branches[branch];
  if (!theirs || !mine) return null;
  return { ahead: countMissing(repo, mine, theirs), behind: countMissing(repo, theirs, mine) };
}

// ------------------------------------------------------------- utilidades

function clone(repo: Repo): Repo {
  return JSON.parse(JSON.stringify(repo)) as Repo;
}

function makeId(seed: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 7);
}

function moveHead(repo: Repo, id: string) {
  if ("branch" in repo.head) repo.branches[repo.head.branch] = id;
  else repo.head = { detached: id };
}

/** Guarda un commit sin mover ninguna rama (así commitea también el servidor). */
function addCommit(repo: Repo, message: string, parents: string[], tree: Files): string {
  repo.seq++;
  let id = makeId(`${repo.seq}|${message}|${parents.join()}`);
  while (repo.commits[id]) id = makeId(id);
  repo.commits[id] = { id, parents, message, tree: { ...tree }, seq: repo.seq };
  return id;
}

function createCommit(repo: Repo, message: string, parents: string[], tree: Files): string {
  const id = addCommit(repo, message, parents, tree);
  moveHead(repo, id);
  return id;
}

/** Tira los commits a los que ya no se llega desde ninguna rama. */
function collectGarbage(repo: Repo) {
  const keep = new Set(visibleCommits(repo).map((commit) => commit.id));
  // lo que está en el servidor existe aunque todavía no lo hayas bajado
  for (const tip of Object.values(repo.remote?.branches ?? {})) for (const id of ancestors(repo, tip)) keep.add(id);
  for (const id of Object.keys(repo.commits)) if (!keep.has(id)) delete repo.commits[id];
}

function untrackedFiles(repo: Repo): Files {
  return Object.fromEntries(Object.entries(repo.work).filter(([path]) => !(path in repo.index)));
}

/**
 * Pasa la carpeta y el staging de un commit a otro, llevándose los cambios
 * sin guardar. Falla si alguno de esos cambios quedaría pisado.
 */
function moveWorktree(repo: Repo, from: Files, to: Files, action: string) {
  const changed = diffTrees(from, to).map((change) => change.path);
  const blocked = changed.filter((path) => repo.index[path] !== from[path] || repo.work[path] !== from[path]);
  if (blocked.length > 0) {
    fail(
      `error: tus cambios locales en ${blocked.join(", ")} serían sobrescritos por ${action}.\nHacé commit o guardalos con git stash antes.`
    );
  }
  for (const path of changed) {
    if (path in to) {
      repo.index[path] = to[path];
      repo.work[path] = to[path];
    } else {
      delete repo.index[path];
      delete repo.work[path];
    }
  }
}

function requireCleanTracked(repo: Repo, action: string) {
  const { staged, unstaged } = status(repo);
  if (staged.length + unstaged.length > 0) {
    fail(`error: tus cambios locales serían sobrescritos por ${action}.\nHacé commit o guardalos con git stash antes.`);
  }
}

function requireCommit(repo: Repo): string {
  return headId(repo) ?? fail(`fatal: tu rama actual '${currentBranch(repo)}' todavía no tiene commits`);
}

function validBranchName(name: string): boolean {
  return /^[\w][\w./-]*$/.test(name) && name !== "HEAD";
}

const KIND_LABEL: Record<Change["kind"], string> = {
  new: "nuevo archivo:",
  modified: "modificado:   ",
  deleted: "borrado:      ",
};

function shortLine(repo: Repo, id: string): string {
  return `${id} ${repo.commits[id].message}`;
}

function decorations(repo: Repo, id: string): string {
  const names: string[] = [];
  const current = currentBranch(repo);
  if (headId(repo) === id) names.push(current ? `HEAD -> ${current}` : "HEAD");
  for (const branch of Object.keys(repo.branches).sort()) {
    if (repo.branches[branch] === id && branch !== current) names.push(branch);
  }
  for (const branch of Object.keys(repo.tracking).sort()) {
    if (repo.tracking[branch] === id) names.push(`origin/${branch}`);
  }
  return names.length > 0 ? ` (${names.join(", ")})` : "";
}

function diffLines(from: Files, to: Files, only?: string[]): string[] {
  const lines: string[] = [];
  for (const { path } of diffTrees(from, to)) {
    if (only && only.length > 0 && !only.includes(path)) continue;
    const before = path in from ? from[path].split("\n") : [];
    const after = path in to ? to[path].split("\n") : [];
    lines.push(`diff --git a/${path} b/${path}`);
    lines.push(path in from ? `--- a/${path}` : "--- /dev/null");
    lines.push(path in to ? `+++ b/${path}` : "+++ /dev/null");
    for (const line of before) if (!after.includes(line)) lines.push(`-${line}`);
    for (const line of after) if (!before.includes(line)) lines.push(`+${line}`);
  }
  return lines;
}

function statusLines(repo: Repo): string[] {
  const lines: string[] = [];
  const branch = currentBranch(repo);
  lines.push(branch ? `En la rama ${branch}` : `HEAD desacoplada en ${headId(repo)}`);
  if (!headId(repo)) lines.push("No hay commits todavía");
  const sync = branch ? aheadBehind(repo, branch, true) : null;
  if (sync) {
    const plural = (n: number) => `${n} ${n === 1 ? "commit" : "commits"}`;
    if (sync.ahead && sync.behind) {
      lines.push(`Tu rama y 'origin/${branch}' han divergido: tienen ${sync.ahead} y ${sync.behind} commits distintos cada una.`);
    } else if (sync.ahead) {
      lines.push(`Tu rama está adelantada a 'origin/${branch}' por ${plural(sync.ahead)}.`, '  (usá "git push" para publicar tus commits)');
    } else if (sync.behind) {
      lines.push(`Tu rama está detrás de 'origin/${branch}' por ${plural(sync.behind)}.`, '  (usá "git pull" para actualizar tu rama)');
    } else lines.push(`Tu rama está actualizada con 'origin/${branch}'.`);
  }
  const { staged, unstaged, untracked, conflicts } = status(repo);
  if (repo.merging) {
    lines.push(
      conflicts.length > 0
        ? 'Tenés rutas sin fusionar. (arreglá los conflictos y ejecutá "git commit")'
        : 'Todos los conflictos resueltos, pero seguís en un merge. (usá "git commit" para cerrarlo)'
    );
  }
  if (staged.length > 0) {
    lines.push("Cambios a ser confirmados:");
    for (const change of staged) lines.push(`    ${KIND_LABEL[change.kind]} ${change.path}`);
  }
  if (conflicts.length > 0) {
    lines.push("Rutas sin fusionar:");
    for (const path of conflicts) lines.push(`    ambos modificaron: ${path}`);
  }
  if (unstaged.length > 0) {
    lines.push("Cambios no preparados para el commit:");
    for (const change of unstaged) lines.push(`    ${KIND_LABEL[change.kind]} ${change.path}`);
  }
  if (untracked.length > 0) {
    lines.push("Archivos sin seguimiento:");
    for (const path of untracked) lines.push(`    ${path}`);
  }
  if (staged.length + unstaged.length + untracked.length + conflicts.length === 0 && !repo.merging) {
    lines.push("nada para confirmar, el árbol de trabajo está limpio");
  } else if (staged.length === 0 && conflicts.length === 0 && !repo.merging) {
    lines.push('no se agregaron cambios al commit (usá "git add")');
  }
  return lines;
}

// --------------------------------------------------------- comandos de git

type Out = (...lines: string[]) => void;

/** Separa las opciones (-m, --hard) de lo demás; `withValue` son las que llevan un dato atrás. */
function parseArgs(args: string[], withValue: string[] = []) {
  const flags = new Set<string>();
  const values: Record<string, string> = {};
  const rest: string[] = [];
  let onlyPaths = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (onlyPaths || !arg.startsWith("-") || arg === "-") rest.push(arg);
    else if (arg === "--") onlyPaths = true;
    else if (withValue.includes(arg)) {
      if (i + 1 >= args.length) fail(`error: la opción '${arg}' necesita un valor`);
      values[arg] = args[++i];
    } else flags.add(arg);
  }
  return { flags, values, rest, onlyPaths };
}

function rejectUnknownFlags(command: string, flags: Set<string>, known: string[]) {
  for (const flag of flags) if (!known.includes(flag)) fail(`error: opción desconocida '${flag}' para git ${command}`);
}

function gitStatus(repo: Repo, args: string[], out: Out) {
  const { flags } = parseArgs(args);
  rejectUnknownFlags("status", flags, ["-s", "--short"]);
  if (flags.size === 0) return out(...statusLines(repo));
  const { staged, unstaged, untracked, conflicts } = status(repo);
  const letter = { new: "A", modified: "M", deleted: "D" };
  for (const change of staged) out(`${letter[change.kind]}  ${change.path}`);
  for (const path of conflicts) out(`UU ${path}`);
  for (const change of unstaged) out(` ${letter[change.kind]} ${change.path}`);
  for (const path of untracked) out(`?? ${path}`);
}

function gitAdd(repo: Repo, args: string[]) {
  const { flags, rest } = parseArgs(args);
  rejectUnknownFlags("add", flags, ["-A", "--all"]);
  const everything = flags.size > 0 || rest.includes(".");
  if (!everything && rest.length === 0) {
    fail('Nada especificado, nada agregado.\nQuizás quisiste decir "git add ."');
  }
  const stage = (path: string) => {
    if (path in repo.work) repo.index[path] = repo.work[path];
    else delete repo.index[path];
    if (repo.merging) repo.merging.conflicts = repo.merging.conflicts.filter((conflict) => conflict !== path);
  };
  if (everything) {
    for (const path of new Set([...Object.keys(repo.work), ...Object.keys(repo.index)])) {
      if (path in repo.index || !isIgnored(repo, path)) stage(path);
    }
    return;
  }
  for (const target of rest) {
    const known = [...new Set([...Object.keys(repo.work), ...Object.keys(repo.index)])];
    const matches = known.filter((path) => path === target || (target.includes("*") && matchesPattern(path, target)));
    if (matches.length === 0) fail(`fatal: la ruta especificada '${target}' no concordó con ningún archivo`);
    for (const path of matches) {
      if (!(path in repo.index) && isIgnored(repo, path)) {
        fail(`La siguiente ruta es ignorada por tu archivo .gitignore:\n${path}`);
      }
      stage(path);
    }
  }
}

function gitCommit(repo: Repo, args: string[], out: Out) {
  const { flags, values } = parseArgs(args, ["-m", "-am", "-ma", "--message"]);
  rejectUnknownFlags("commit", flags, ["-a", "--all", "--amend", "--no-edit"]);
  const given = values["-m"] ?? values["-am"] ?? values["-ma"] ?? values["--message"];
  if (flags.has("-a") || flags.has("--all") || "-am" in values || "-ma" in values) {
    for (const path of Object.keys(repo.index)) {
      if (path in repo.work) repo.index[path] = repo.work[path];
      else delete repo.index[path];
    }
  }
  if (given !== undefined && given.trim() === "") fail("Abortando el commit: el mensaje está vacío.");
  const branch = currentBranch(repo) ?? "HEAD desacoplada";
  const parent = headId(repo);

  if (repo.merging) {
    if (repo.merging.conflicts.length > 0) {
      fail(
        "error: no se puede hacer el commit porque tenés archivos sin fusionar.\nArreglalos y usá git add para marcarlos como resueltos."
      );
    }
    const message = given ?? `Merge branch '${repo.merging.name}'`;
    const id = createCommit(repo, message, [parent!, repo.merging.theirs], repo.index);
    repo.merging = null;
    return out(`[${branch} ${id}] ${message}`);
  }

  if (flags.has("--amend")) {
    const old = repo.commits[requireCommit(repo)];
    const message = given ?? old.message;
    repo.seq++;
    let id = makeId(`${repo.seq}|${message}|amend`);
    while (repo.commits[id]) id = makeId(id);
    // ocupa el lugar del commit que corrige: mismo orden en el historial
    repo.commits[id] = { id, parents: old.parents, message, tree: { ...repo.index }, seq: old.seq };
    moveHead(repo, id);
    return out(`[${branch} ${id}] ${message}`);
  }

  const changes = diffTrees(headTree(repo), repo.index);
  if (changes.length === 0) {
    const { unstaged, untracked } = status(repo);
    fail(
      [
        `En la rama ${branch}`,
        unstaged.length + untracked.length > 0
          ? 'no se agregaron cambios al commit (usá "git add" para prepararlos)'
          : "nada para confirmar, el árbol de trabajo está limpio",
      ].join("\n")
    );
  }
  if (given === undefined) {
    fail('Falta el mensaje del commit. Usá: git commit -m "qué cambiaste"');
  }
  const id = createCommit(repo, given, parent ? [parent] : [], repo.index);
  out(`[${branch}${parent ? "" : " (commit raíz)"} ${id}] ${given}`);
  out(` ${changes.length} ${changes.length === 1 ? "archivo cambiado" : "archivos cambiados"}`);
}

function gitLog(repo: Repo, args: string[], out: Out) {
  const { flags, values, rest } = parseArgs(args, ["-n", "--max-count"]);
  let limit = Number(values["-n"] ?? values["--max-count"] ?? Infinity);
  for (const flag of [...flags]) {
    if (/^-\d+$/.test(flag) || /^-n\d+$/.test(flag)) {
      limit = Number(flag.replace(/^-n?/, ""));
      flags.delete(flag);
    }
  }
  rejectUnknownFlags("log", flags, ["--oneline", "--graph", "--all", "--decorate"]);
  if (Number.isNaN(limit)) fail("fatal: -n necesita un número");
  const start = rest[0] ? resolveRef(repo, rest[0]) ?? fail(`fatal: argumento ambiguo '${rest[0]}': revisión desconocida`) : requireCommit(repo);
  const ids = flags.has("--all") ? new Set(visibleCommits(repo).map((commit) => commit.id)) : ancestors(repo, start);
  const commits = [...ids].map((id) => repo.commits[id]).sort((a, b) => b.seq - a.seq).slice(0, limit);
  for (const commit of commits) {
    if (flags.has("--oneline")) {
      out(`${flags.has("--graph") ? "* " : ""}${commit.id}${decorations(repo, commit.id)} ${commit.message}`);
    } else {
      out(`commit ${commit.id}${decorations(repo, commit.id)}`, `    ${commit.message}`);
    }
  }
}

function gitDiff(repo: Repo, args: string[], out: Out) {
  const { flags, rest } = parseArgs(args);
  rejectUnknownFlags("diff", flags, ["--staged", "--cached"]);
  const staged = flags.size > 0;
  const from = staged ? headTree(repo) : repo.index;
  // sin --staged sólo cuentan los archivos que Git ya sigue
  const to = staged
    ? repo.index
    : Object.fromEntries(Object.entries(repo.work).filter(([path]) => path in repo.index));
  out(...diffLines(from, to, rest));
}

function gitShow(repo: Repo, args: string[], out: Out) {
  const { rest } = parseArgs(args);
  const ref = rest[0] ?? "HEAD";
  if (!rest[0]) requireCommit(repo);
  const id = resolveRef(repo, ref) ?? fail(`fatal: argumento ambiguo '${ref}': revisión desconocida`);
  const commit = repo.commits[id];
  const parent = commit.parents[0] ? repo.commits[commit.parents[0]].tree : {};
  out(`commit ${id}${decorations(repo, id)}`, `    ${commit.message}`, ...diffLines(parent, commit.tree));
}

function gitBranch(repo: Repo, args: string[], out: Out) {
  const { flags, rest } = parseArgs(args);
  rejectUnknownFlags("branch", flags, ["-d", "-D", "--delete", "-m", "-M", "--move", "-a", "-v", "--list", "--all", "-r", "--remotes"]);
  const current = currentBranch(repo);
  const deleting = flags.has("-d") || flags.has("-D") || flags.has("--delete");
  const renaming = flags.has("-m") || flags.has("-M") || flags.has("--move");

  if (deleting) {
    if (rest.length === 0) fail("fatal: hace falta el nombre de la rama");
    for (const name of rest) {
      const tip = repo.branches[name] ?? fail(`error: rama '${name}' no encontrada`);
      if (name === current) fail(`error: no se puede borrar la rama '${name}': estás parado en ella`);
      const head = headId(repo);
      if (!flags.has("-D") && (!head || !isAncestor(repo, tip, head))) {
        fail(
          `error: la rama '${name}' no está completamente fusionada.\nSi estás seguro de querer borrarla, ejecutá 'git branch -D ${name}'`
        );
      }
      delete repo.branches[name];
      out(`Eliminada la rama ${name} (era ${tip}).`);
    }
    return;
  }

  if (renaming) {
    const [from, to] = rest.length >= 2 ? rest : [current, rest[0]];
    if (!from || !to) fail("fatal: hace falta el nombre nuevo de la rama");
    if (!validBranchName(to)) fail(`fatal: '${to}' no es un nombre de rama válido`);
    if (repo.branches[to]) fail(`fatal: una rama llamada '${to}' ya existe`);
    if (!repo.branches[from] && from !== current) fail(`error: rama '${from}' no encontrada`);
    if (repo.branches[from]) {
      repo.branches[to] = repo.branches[from];
      delete repo.branches[from];
    }
    if (current === from) repo.head = { branch: to };
    return;
  }

  if (rest.length === 0) {
    const remotes = flags.has("-r") || flags.has("--remotes");
    const all = flags.has("-a") || flags.has("--all");
    if (!remotes) {
      if (!current) out(`* (HEAD desacoplada en ${headId(repo)})`);
      for (const name of Object.keys(repo.branches).sort()) out(`${name === current ? "*" : " "} ${name}`);
    }
    if (remotes || all) {
      for (const name of Object.keys(repo.tracking).sort()) out(`  ${all ? "remotes/" : ""}origin/${name}`);
    }
    return;
  }

  const [name, startRef] = rest;
  if (!validBranchName(name)) fail(`fatal: '${name}' no es un nombre de rama válido`);
  if (repo.branches[name]) fail(`fatal: una rama llamada '${name}' ya existe`);
  const start = startRef
    ? resolveRef(repo, startRef) ?? fail(`fatal: no es un nombre de objeto válido: '${startRef}'`)
    : headId(repo) ?? fail(`fatal: no es un nombre de objeto válido: '${current}' (todavía no hay commits)`);
  repo.branches[name] = start;
}

function switchTo(repo: Repo, name: string, out: Out) {
  if (name === currentBranch(repo)) return out(`Ya en '${name}'`);
  const target = repo.branches[name];
  moveWorktree(repo, headTree(repo), repo.commits[target].tree, "el cambio de rama");
  repo.head = { branch: name };
  out(`Cambiado a rama '${name}'`);
}

function createAndSwitch(repo: Repo, name: string | undefined, startRef: string | undefined, out: Out) {
  if (!name) fail("fatal: hace falta el nombre de la rama nueva");
  if (!validBranchName(name)) fail(`fatal: '${name}' no es un nombre de rama válido`);
  if (repo.branches[name]) fail(`fatal: una rama llamada '${name}' ya existe`);
  const head = headId(repo);
  if (startRef) {
    const start = resolveRef(repo, startRef) ?? fail(`fatal: '${startRef}' no es un commit`);
    moveWorktree(repo, headTree(repo), repo.commits[start].tree, "el cambio de rama");
    repo.branches[name] = start;
  } else if (head) repo.branches[name] = head;
  repo.head = { branch: name };
  out(`Cambiado a nueva rama '${name}'`);
}

function detach(repo: Repo, id: string, out: Out) {
  moveWorktree(repo, headTree(repo), repo.commits[id].tree, "el checkout");
  repo.head = { detached: id };
  out(`Nota: cambiando a '${id}'.`, "Estás en estado de 'HEAD desacoplada': los commits que hagas acá no quedan en ninguna rama.");
}

/** Pasarte a una rama que sólo existe en el remoto la crea en tu compu, ya enlazada. */
function trackRemoteBranch(repo: Repo, name: string, out: Out): boolean {
  const tip = repo.tracking[name];
  if (repo.branches[name] || !tip) return false;
  moveWorktree(repo, headTree(repo), repo.commits[tip].tree, "el cambio de rama");
  repo.branches[name] = tip;
  repo.upstream.push(name);
  repo.head = { branch: name };
  out(`rama '${name}' configurada para rastrear 'origin/${name}'.`, `Cambiado a nueva rama '${name}'`);
  return true;
}

function gitSwitch(repo: Repo, args: string[], out: Out) {
  const { flags, rest } = parseArgs(args);
  rejectUnknownFlags("switch", flags, ["-c", "-C", "--create", "--detach"]);
  if (repo.merging) fail("fatal: no se puede cambiar de rama en medio de un merge");
  if (flags.has("-c") || flags.has("-C") || flags.has("--create")) return createAndSwitch(repo, rest[0], rest[1], out);
  const name = rest[0] ?? fail("fatal: falta el nombre de la rama");
  if (flags.has("--detach")) return detach(repo, resolveRef(repo, name) ?? fail(`fatal: referencia inválida: ${name}`), out);
  if (trackRemoteBranch(repo, name, out)) return;
  if (!repo.branches[name]) {
    fail(
      resolveRef(repo, name)
        ? `fatal: se esperaba una rama, se obtuvo el commit '${name}'`
        : `fatal: referencia inválida: ${name}`
    );
  }
  switchTo(repo, name, out);
}

/** Vuelve archivos de la carpeta a como están en el staging (o al lado elegido de un merge). */
function restoreWork(repo: Repo, targets: string[], side?: "ours" | "theirs") {
  const conflicts = repo.merging?.conflicts ?? [];
  const all = targets.includes(".");
  const paths = all ? Object.keys(repo.index) : targets;
  for (const path of paths) {
    if (conflicts.includes(path)) {
      if (!side) {
        if (all) continue;
        fail(`error: la ruta '${path}' está sin fusionar`);
      }
      const tree = side === "ours" ? headTree(repo) : repo.commits[repo.merging!.theirs].tree;
      if (path in tree) repo.work[path] = tree[path];
      else delete repo.work[path];
      continue;
    }
    if (!(path in repo.index)) fail(`error: la ruta '${path}' no concordó con ningún archivo conocido por git`);
    repo.work[path] = repo.index[path];
  }
}

function sideOf(flags: Set<string>): "ours" | "theirs" | undefined {
  return flags.has("--ours") ? "ours" : flags.has("--theirs") ? "theirs" : undefined;
}

function gitCheckout(repo: Repo, args: string[], out: Out) {
  const { flags, rest, onlyPaths } = parseArgs(args);
  rejectUnknownFlags("checkout", flags, ["-b", "-B", "--ours", "--theirs"]);
  if (flags.has("-b") || flags.has("-B")) {
    if (repo.merging) fail("fatal: no se puede cambiar de rama en medio de un merge");
    return createAndSwitch(repo, rest[0], rest[1], out);
  }
  if (rest.length === 0) fail("fatal: falta la rama o el archivo");
  const side = sideOf(flags);
  const isPath = (name: string) => name === "." || name in repo.index || name in repo.work;
  if (onlyPaths || side || (!repo.branches[rest[0]] && isPath(rest[0]))) return restoreWork(repo, rest, side);
  if (repo.merging) fail("fatal: no se puede cambiar de rama en medio de un merge");
  if (repo.branches[rest[0]]) return switchTo(repo, rest[0], out);
  if (trackRemoteBranch(repo, rest[0], out)) return;
  const id = resolveRef(repo, rest[0]) ?? fail(`error: la ruta '${rest[0]}' no concordó con ninguna rama ni archivo`);
  detach(repo, id, out);
}

function gitRestore(repo: Repo, args: string[]) {
  const { flags, rest } = parseArgs(args);
  rejectUnknownFlags("restore", flags, ["--staged", "-S", "--worktree", "-W", "--ours", "--theirs"]);
  if (rest.length === 0) fail("fatal: tenés que indicar qué archivo restaurar");
  const staged = flags.has("--staged") || flags.has("-S");
  if (staged) {
    const head = headTree(repo);
    const paths = rest.includes(".") ? [...new Set([...Object.keys(repo.index), ...Object.keys(head)])] : rest;
    for (const path of paths) {
      if (!(path in repo.index) && !(path in head)) {
        fail(`error: la ruta '${path}' no concordó con ningún archivo conocido por git`);
      }
      if (path in head) repo.index[path] = head[path];
      else delete repo.index[path];
    }
  }
  if (!staged || flags.has("--worktree") || flags.has("-W")) restoreWork(repo, rest, sideOf(flags));
}

function gitReset(repo: Repo, args: string[], out: Out) {
  const { flags, rest } = parseArgs(args);
  rejectUnknownFlags("reset", flags, ["--soft", "--mixed", "--hard"]);
  const head = headTree(repo);
  const refId = rest[0] ? resolveRef(repo, rest[0]) : null;

  // git reset <archivo>: sólo lo saca del staging
  if (rest.length > 0 && (!refId || rest.length > 1)) {
    const paths = refId ? rest.slice(1) : rest;
    if (flags.size > 0) fail("fatal: no se puede combinar --soft/--hard con rutas de archivos");
    for (const path of paths.includes(".") ? Object.keys(repo.index) : paths) {
      if (!(path in repo.index) && !(path in head)) {
        fail(`fatal: argumento ambiguo '${path}': revisión o ruta desconocida`);
      }
      if (path in head) repo.index[path] = head[path];
      else delete repo.index[path];
    }
    return;
  }

  const target = refId ?? requireCommit(repo);
  const tree = repo.commits[target].tree;
  if (flags.has("--hard")) {
    repo.work = { ...untrackedFiles(repo), ...tree };
    repo.index = { ...tree };
    repo.merging = null;
  } else if (!flags.has("--soft")) {
    repo.index = { ...tree };
    repo.merging = null;
  }
  moveHead(repo, target);
  if (flags.has("--hard")) return out(`HEAD está ahora en ${shortLine(repo, target)}`);
  const { unstaged } = status(repo);
  if (!flags.has("--soft") && unstaged.length > 0) {
    out("Cambios fuera del área de staging tras el reset:");
    for (const change of unstaged) out(`M   ${change.path}`);
  }
}

/** Junta dos commits archivo por archivo, partiendo de su antepasado común. */
function mergeTrees(repo: Repo, ours: string, theirs: string): { merged: Files; conflicts: string[] } {
  const oursTree = repo.commits[ours].tree;
  const theirsTree = repo.commits[theirs].tree;
  const shared = [...ancestors(repo, theirs)].filter((id) => isAncestor(repo, id, ours));
  const base = shared.map((id) => repo.commits[id]).sort((a, b) => b.seq - a.seq)[0]?.tree ?? {};
  const merged: Files = {};
  const conflicts: string[] = [];
  for (const path of new Set([...Object.keys(base), ...Object.keys(oursTree), ...Object.keys(theirsTree)])) {
    const mine = oursTree[path];
    const yours = theirsTree[path];
    let result: string | undefined;
    if (mine === yours || yours === base[path]) result = mine;
    else if (mine === base[path]) result = yours;
    else {
      conflicts.push(path);
      continue;
    }
    if (result !== undefined) merged[path] = result;
  }
  return { merged, conflicts };
}

function gitMerge(repo: Repo, args: string[], out: Out) {
  const { flags, values, rest } = parseArgs(args, ["-m"]);
  rejectUnknownFlags("merge", flags, ["--abort", "--continue", "--no-ff", "--no-edit"]);
  if (flags.has("--abort")) {
    if (!repo.merging) fail("fatal: no hay ningún merge para abortar (falta MERGE_HEAD)");
    const head = headTree(repo);
    const conflicts = repo.merging.conflicts;
    const untracked = Object.fromEntries(
      Object.entries(untrackedFiles(repo)).filter(([path]) => !conflicts.includes(path))
    );
    repo.work = { ...untracked, ...head };
    repo.index = { ...head };
    repo.merging = null;
    return;
  }
  if (flags.has("--continue")) {
    if (!repo.merging) fail("fatal: no hay ningún merge en progreso (falta MERGE_HEAD)");
    return gitCommit(repo, [], out);
  }
  if (repo.merging) fail("fatal: no terminaste tu merge anterior (existe MERGE_HEAD).\nHacé commit de tus cambios antes de fusionar.");
  const name = rest[0] ?? fail("fatal: falta la rama a fusionar");
  const ours = requireCommit(repo);
  const theirs = resolveRef(repo, name) ?? fail(`merge: ${name} - no es algo que se pueda fusionar`);
  if (isAncestor(repo, theirs, ours)) return out("Ya está actualizado.");
  requireCleanTracked(repo, "el merge");

  const oursTree = repo.commits[ours].tree;
  const theirsTree = repo.commits[theirs].tree;
  if (isAncestor(repo, ours, theirs) && !flags.has("--no-ff")) {
    moveWorktree(repo, oursTree, theirsTree, "el merge");
    moveHead(repo, theirs);
    out(`Actualizando ${ours}..${theirs}`, "Fast-forward");
    for (const change of diffTrees(oursTree, theirsTree)) out(` ${change.path}`);
    return;
  }

  const { merged, conflicts } = mergeTrees(repo, ours, theirs);

  const untracked = untrackedFiles(repo);
  if (conflicts.length === 0) {
    repo.work = { ...untracked, ...merged };
    repo.index = { ...merged };
    const message = values["-m"] ?? `Merge branch '${name}'`;
    createCommit(repo, message, [ours, theirs], merged);
    return out("Merge hecho por la estrategia 'ort'.");
  }
  repo.work = { ...untracked, ...merged };
  repo.index = { ...merged };
  for (const path of conflicts.sort()) {
    if (path in oursTree) repo.index[path] = oursTree[path];
    repo.work[path] = ["<<<<<<< HEAD", oursTree[path] ?? "", "=======", theirsTree[path] ?? "", `>>>>>>> ${name}`].join("\n");
    out(`CONFLICTO (contenido): conflicto de merge en ${path}`);
  }
  repo.merging = { theirs, name, conflicts };
  out("Falló el merge automático; arreglá los conflictos y después hacé commit del resultado.");
}

function gitRevert(repo: Repo, args: string[], out: Out) {
  const { flags, rest } = parseArgs(args);
  rejectUnknownFlags("revert", flags, ["--no-edit"]);
  const ref = rest[0] ?? fail("fatal: falta indicar qué commit revertir (por ejemplo: git revert HEAD)");
  const head = requireCommit(repo);
  const id = resolveRef(repo, ref) ?? fail(`fatal: revisión incorrecta '${ref}'`);
  const commit = repo.commits[id];
  if (commit.parents.length > 1) fail("error: revertir un commit de merge no está disponible en este simulador");
  requireCleanTracked(repo, "el revert");
  const before = commit.parents[0] ? repo.commits[commit.parents[0]].tree : {};
  const current = repo.commits[head].tree;
  const result: Files = { ...current };
  for (const { path } of diffTrees(before, commit.tree)) {
    if (current[path] !== commit.tree[path]) {
      fail(`error: no se pudo revertir ${id}: ${path} cambió después de ese commit (conflicto)`);
    }
    if (path in before) result[path] = before[path];
    else delete result[path];
  }
  moveWorktree(repo, current, result, "el revert");
  const message = `Revert "${commit.message}"`;
  const created = createCommit(repo, message, [head], result);
  out(`[${currentBranch(repo) ?? "HEAD desacoplada"} ${created}] ${message}`);
}

/** Vuelve a aplicar sobre `base` el cambio que introdujo un commit. */
function replay(repo: Repo, id: string, base: Files): Files {
  const commit = repo.commits[id];
  if (commit.parents.length > 1) fail(`error: ${id} es un commit de merge: no se puede volver a aplicar en este simulador`);
  const before = commit.parents[0] ? repo.commits[commit.parents[0]].tree : {};
  const result: Files = { ...base };
  for (const { path } of diffTrees(before, commit.tree)) {
    if (base[path] !== before[path] && base[path] !== commit.tree[path]) {
      fail(`CONFLICTO (contenido): ${path} cambió en los dos lados.\nEste simulador sólo resuelve conflictos con git merge.`);
    }
    if (path in commit.tree) result[path] = commit.tree[path];
    else delete result[path];
  }
  return result;
}

function gitCherryPick(repo: Repo, args: string[], out: Out) {
  const { rest } = parseArgs(args);
  if (rest.length === 0) fail("fatal: falta indicar qué commit copiar (por ejemplo: git cherry-pick a1b2c3d)");
  requireCleanTracked(repo, "el cherry-pick");
  for (const ref of rest) {
    const head = requireCommit(repo);
    const id = resolveRef(repo, ref) ?? fail(`fatal: revisión incorrecta '${ref}'`);
    const current = repo.commits[head].tree;
    const tree = replay(repo, id, current);
    moveWorktree(repo, current, tree, "el cherry-pick");
    const message = repo.commits[id].message;
    const created = createCommit(repo, message, [head], tree);
    out(`[${currentBranch(repo) ?? "HEAD desacoplada"} ${created}] ${message}`);
  }
}

function gitRebase(repo: Repo, args: string[], out: Out) {
  const { rest } = parseArgs(args);
  const branch = currentBranch(repo) ?? fail("fatal: con la HEAD desacoplada no hay rama para mover");
  const target = rest[0] ?? fail("fatal: falta la rama sobre la que querés apoyar tus commits (por ejemplo: git rebase main)");
  if (repo.merging) fail("fatal: no se puede hacer rebase en medio de un merge");
  const head = requireCommit(repo);
  const onto = resolveRef(repo, target) ?? fail(`fatal: rama inválida '${target}'`);
  if (isAncestor(repo, onto, head)) return out(`La rama actual ${branch} está actualizada.`);
  requireCleanTracked(repo, "el rebase");
  // los commits propios de la rama, del más viejo al más nuevo
  const own: string[] = [];
  for (let id: string | undefined = head; id && !isAncestor(repo, id, onto); id = repo.commits[id].parents[0]) {
    own.unshift(id);
  }
  const oldTree = repo.commits[head].tree;
  repo.branches[branch] = onto;
  for (const id of own) {
    const tip = repo.branches[branch];
    createCommit(repo, repo.commits[id].message, [tip], replay(repo, id, repo.commits[tip].tree));
  }
  moveWorktree(repo, oldTree, headTree(repo), "el rebase");
  out(`Rebase aplicado satisfactoriamente y actualizado refs/heads/${branch}.`);
}

function requireRemote(repo: Repo): Remote {
  return (
    repo.remote ??
    fail("fatal: 'origin' no parece ser un repositorio git\nTodavía no conectaste un remoto: git remote add origin <url>")
  );
}

function gitRemote(repo: Repo, args: string[], out: Out) {
  const { flags, rest } = parseArgs(args);
  rejectUnknownFlags("remote", flags, ["-v", "--verbose"]);
  if (rest[0] === "add") {
    const [, name, url] = rest;
    if (!name || !url) fail("uso: git remote add <nombre> <url>");
    if (repo.remote) fail(`error: el remoto ${name} ya existe.`);
    repo.remote = { url, branches: {}, prs: [] };
    return;
  }
  if (rest.length > 0) fail(`error: subcomando desconocido: ${rest[0]}`);
  if (!repo.remote) return;
  if (flags.size > 0) out(`origin  ${repo.remote.url} (fetch)`, `origin  ${repo.remote.url} (push)`);
  else out("origin");
}

function gitFetch(repo: Repo, _args: string[], out: Out) {
  const remote = requireRemote(repo);
  const news = Object.entries(remote.branches).filter(([branch, tip]) => repo.tracking[branch] !== tip);
  if (news.length > 0) out(`Desde ${remote.url}`);
  for (const [branch, tip] of news) {
    const known = repo.tracking[branch];
    out(` ${known ? `${known}..${tip}` : "* [nueva rama]"}  ${branch} -> origin/${branch}`);
  }
  repo.tracking = { ...remote.branches };
}

function gitPush(repo: Repo, args: string[], out: Out) {
  const { flags, rest } = parseArgs(args);
  rejectUnknownFlags("push", flags, ["-u", "--set-upstream", "-f", "--force", "--force-with-lease", "--delete", "-d"]);
  const remote = requireRemote(repo);
  if (rest[0] && rest[0] !== "origin") fail(`fatal: '${rest[0]}' no parece ser un repositorio git`);
  const branch = rest[1] ?? currentBranch(repo) ?? fail("fatal: no estás en ninguna rama");

  if (flags.has("--delete") || flags.has("-d")) {
    if (!remote.branches[branch]) fail(`error: no se puede borrar '${branch}': la referencia remota no existe`);
    delete remote.branches[branch];
    delete repo.tracking[branch];
    repo.upstream = repo.upstream.filter((name) => name !== branch);
    return out(`A ${remote.url}`, ` - [eliminado]  ${branch}`);
  }

  const tip = repo.branches[branch] ?? fail(`error: el refspec '${branch}' no concuerda con ninguna rama`);
  const link = flags.has("-u") || flags.has("--set-upstream");
  if (!rest[1] && !link && !repo.upstream.includes(branch)) {
    fail(
      `fatal: La rama actual ${branch} no tiene una rama upstream.\nPara subirla y dejarla enlazada, usá:\n    git push --set-upstream origin ${branch}`
    );
  }
  const theirs = remote.branches[branch];
  const force = flags.has("-f") || flags.has("--force") || flags.has("--force-with-lease");
  if (theirs && theirs !== tip && !isAncestor(repo, theirs, tip) && !force) {
    fail(
      ` ! [rechazado]  ${branch} -> ${branch} (primero hacé fetch)\nerror: falló el push a '${remote.url}'\nEl remoto tiene commits que vos no tenés: traelos con git pull y volvé a intentar.`
    );
  }
  if (theirs === tip) out("Todo actualizado");
  else out(`A ${remote.url}`, theirs ? `   ${theirs}..${tip}  ${branch} -> ${branch}` : ` * [nueva rama]  ${branch} -> ${branch}`);
  remote.branches[branch] = tip;
  repo.tracking[branch] = tip;
  if (link && !repo.upstream.includes(branch)) {
    repo.upstream.push(branch);
    out(`rama '${branch}' configurada para rastrear 'origin/${branch}'.`);
  }
}

function gitPull(repo: Repo, args: string[], out: Out) {
  const { flags, rest } = parseArgs(args);
  rejectUnknownFlags("pull", flags, ["--rebase", "--no-rebase", "--ff-only"]);
  requireRemote(repo);
  if (rest[0] && rest[0] !== "origin") fail(`fatal: '${rest[0]}' no parece ser un repositorio git`);
  const branch = rest[1] ?? currentBranch(repo) ?? fail("fatal: no estás en ninguna rama");
  gitFetch(repo, [], out);
  if (!repo.tracking[branch]) {
    fail(`No hay información de seguimiento para la rama actual: '${branch}' no existe en el remoto.\nSubila primero con git push -u origin ${branch}`);
  }
  if (flags.has("--rebase")) gitRebase(repo, [`origin/${branch}`], out);
  else gitMerge(repo, [`origin/${branch}`], out);
}

/** La consola de GitHub: lo mínimo para abrir y fusionar pull requests. */
function runGh(repo: Repo, args: string[], out: Out) {
  if (!repo.initialized) fail("no es un repositorio git");
  const remote = requireRemote(repo);
  const [area, action, ...restArgs] = args;
  if (area !== "pr") fail("gh: en este simulador sólo está 'gh pr' (create, list, merge)");
  const { flags, values, rest } = parseArgs(restArgs, ["--title", "-t", "--body", "-b", "--base", "-B"]);
  const branch = currentBranch(repo);
  const open = remote.prs.filter((pr) => !pr.merged);

  if (action === "list" || action === "status") {
    if (remote.prs.length === 0) return out("No hay pull requests abiertos");
    for (const pr of remote.prs) out(`#${pr.number}  ${pr.title}  ${pr.branch}  ${pr.merged ? "FUSIONADO" : "ABIERTO"}`);
    return;
  }
  if (action === "create") {
    if (!branch) fail("no estás en ninguna rama");
    if (branch === "main") fail("no se puede abrir un pull request de main contra main: trabajá en una rama");
    const tip = repo.branches[branch];
    if (remote.branches[branch] !== tip) {
      fail(`la rama ${branch} todavía no está subida (o le faltan commits).\nSubila primero: git push -u origin ${branch}`);
    }
    if (remote.branches.main && isAncestor(repo, tip, remote.branches.main)) {
      fail(`no hay commits entre main y ${branch}: no hay nada para revisar`);
    }
    if (open.some((pr) => pr.branch === branch)) fail(`ya existe un pull request abierto para ${branch}`);
    const number = remote.prs.length + 1;
    const title = values["--title"] ?? values["-t"] ?? repo.commits[tip].message;
    remote.prs.push({ number, branch, title, merged: false });
    return out(`Creando pull request para ${branch} en main`, `${remote.url.replace(/\.git$/, "")}/pull/${number}`);
  }
  if (action === "merge") {
    const wanted = rest[0] ? Number(rest[0].replace("#", "")) : undefined;
    const pr =
      open.find((candidate) => (wanted ? candidate.number === wanted : candidate.branch === branch)) ??
      (open.length === 1 && !wanted ? open[0] : fail("no hay ningún pull request abierto para fusionar"));
    const main = remote.branches.main;
    const tip = remote.branches[pr.branch] ?? fail(`la rama ${pr.branch} ya no existe en el remoto`);
    const { merged, conflicts } = mergeTrees(repo, main, tip);
    if (conflicts.length > 0) {
      fail(`✗ El pull request #${pr.number} tiene conflictos con main (${conflicts.join(", ")}).\nTraé main a tu rama, resolvelos y volvé a subirla.`);
    }
    remote.branches.main = addCommit(repo, `Merge pull request #${pr.number} (${pr.branch})`, [main, tip], merged);
    pr.merged = true;
    if (flags.has("--delete-branch") || flags.has("-d")) delete remote.branches[pr.branch];
    return out(`✓ Pull request #${pr.number} fusionado en main (${pr.title})`);
  }
  fail(`gh pr: acción desconocida '${action ?? ""}' (probá create, list o merge)`);
}

function gitStash(repo: Repo, args: string[], out: Out) {
  const { values, rest } = parseArgs(args, ["-m", "--message"]);
  const action = rest[0] ?? "push";
  if (action === "push" || action === "save") {
    const head = requireCommit(repo);
    const { staged, unstaged } = status(repo);
    if (staged.length + unstaged.length === 0) return out("No hay cambios locales para guardar");
    const tracked = Object.fromEntries(Object.entries(repo.work).filter(([path]) => path in repo.index));
    const message = values["-m"] ?? values["--message"] ?? `WIP en ${currentBranch(repo) ?? "HEAD"}: ${shortLine(repo, head)}`;
    repo.stash.unshift({ message, work: tracked, index: { ...repo.index } });
    const tree = repo.commits[head].tree;
    repo.work = { ...untrackedFiles(repo), ...tree };
    repo.index = { ...tree };
    return out(`Directorio de trabajo y staging guardados: ${message}`);
  }
  if (action === "list") {
    repo.stash.forEach((entry, i) => out(`stash@{${i}}: ${entry.message}`));
    return;
  }
  if (action === "clear") {
    repo.stash = [];
    return;
  }
  if (repo.stash.length === 0) fail("No se encontraron entradas de stash.");
  if (action === "drop") {
    repo.stash.shift();
    return out("Descartado stash@{0}");
  }
  if (action === "pop" || action === "apply") {
    requireCleanTracked(repo, "el stash");
    const entry = repo.stash[0];
    const head = headTree(repo);
    for (const path of new Set([...Object.keys(entry.index), ...Object.keys(head)])) {
      if (path in entry.work) repo.work[path] = entry.work[path];
      else delete repo.work[path];
      // los archivos nuevos que estaban preparados vuelven al staging
      if (!(path in head) && path in entry.index) repo.index[path] = entry.index[path];
    }
    if (action === "pop") repo.stash.shift();
    out(...statusLines(repo));
    if (action === "pop") out("Descartado stash@{0}");
    return;
  }
  fail(`fatal: subcomando de stash desconocido: ${action}`);
}

function gitRm(repo: Repo, args: string[], out: Out) {
  const { flags, rest } = parseArgs(args);
  rejectUnknownFlags("rm", flags, ["--cached", "-f"]);
  if (rest.length === 0) fail("fatal: tenés que indicar qué archivo quitar");
  for (const path of rest) {
    if (!(path in repo.index)) fail(`fatal: la ruta especificada '${path}' no concordó con ningún archivo`);
    delete repo.index[path];
    if (!flags.has("--cached")) delete repo.work[path];
    out(`rm '${path}'`);
  }
}

function gitMv(repo: Repo, args: string[]) {
  const [from, to] = args;
  if (!from || !to) fail("fatal: uso: git mv <origen> <destino>");
  if (!(from in repo.index)) fail(`fatal: origen incorrecto, '${from}' no está bajo control de versiones`);
  repo.index[to] = repo.index[from];
  delete repo.index[from];
  if (from in repo.work) {
    repo.work[to] = repo.work[from];
    delete repo.work[from];
  }
}

const GIT_COMMANDS: Record<string, (repo: Repo, args: string[], out: Out) => void> = {
  status: gitStatus,
  add: gitAdd,
  commit: gitCommit,
  log: gitLog,
  diff: gitDiff,
  show: gitShow,
  branch: gitBranch,
  switch: gitSwitch,
  checkout: gitCheckout,
  restore: gitRestore,
  reset: gitReset,
  merge: gitMerge,
  revert: gitRevert,
  rebase: gitRebase,
  "cherry-pick": gitCherryPick,
  remote: gitRemote,
  fetch: gitFetch,
  push: gitPush,
  pull: gitPull,
  stash: gitStash,
  rm: gitRm,
  mv: gitMv,
};


function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

function runGit(repo: Repo, args: string[], out: Out) {
  const [sub, ...rest] = args;
  if (!sub || sub === "help" || sub === "--help") {
    return out("Comandos disponibles:", `  ${["init", "clone", ...Object.keys(GIT_COMMANDS)].join(", ")}`);
  }
  if (sub === "--version" || sub === "version") return out("git version 2.47.0 (simulador de Git Attack)");
  if (sub === "init") {
    if (repo.initialized) return out("Reinicializado el repositorio Git existente en ~/proyecto/.git/");
    repo.initialized = true;
    return out("Inicializado repositorio Git vacío en ~/proyecto/.git/");
  }
  if (sub === "clone") {
    if (repo.initialized) fail("fatal: ya estás dentro de un repositorio: clone se usa en una carpeta vacía");
    if (!rest[0]) fail("Tenés que indicar qué repositorio clonar: git clone <url>");
    const remote = repo.remote ?? fail(`fatal: repositorio '${rest[0]}' no encontrado`);
    const tree = remote.branches.main ? repo.commits[remote.branches.main].tree : {};
    repo.initialized = true;
    repo.tracking = { ...remote.branches };
    repo.branches = remote.branches.main ? { main: remote.branches.main } : {};
    repo.upstream = ["main"];
    repo.head = { branch: "main" };
    repo.work = { ...tree };
    repo.index = { ...tree };
    return out("Clonando en 'ventas'...", `Recibiendo objetos: 100% (${Object.keys(repo.commits).length} commits), listo.`);
  }
  const handler = GIT_COMMANDS[sub];
  if (!handler) {
    const close = Object.keys(GIT_COMMANDS)
      .concat("init", "clone")
      .filter((name) => editDistance(name, sub) <= 2);
    fail(
      `git: '${sub}' no es un comando de git.` +
        (close.length > 0 ? `\nEl comando más parecido es: ${close.join(", ")}` : "")
    );
  }
  if (!repo.initialized) fail("fatal: no es un repositorio git (falta la carpeta .git)");
  handler(repo, rest, out);
  collectGarbage(repo);
}

// ------------------------------------------------- consola (git + básicos)

interface Token {
  text: string;
  /** Operador de la consola (&&, >, >>), no texto. */
  op: boolean;
}

function tokenize(input: string): Token[] {
  // los teclados de celular meten comillas y guiones "lindos"
  const line = input
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "--")
    .trim();
  const tokens: Token[] = [];
  let i = 0;
  const operatorAt = (at: number) => ["&&", ">>", ">", ";"].find((op) => line.startsWith(op, at));
  while (i < line.length) {
    if (/\s/.test(line[i])) {
      i++;
      continue;
    }
    const op = operatorAt(i);
    if (op) {
      tokens.push({ text: op === ";" ? "&&" : op, op: true });
      i += op.length;
      continue;
    }
    let text = "";
    while (i < line.length && !/\s/.test(line[i]) && !operatorAt(i)) {
      if (line[i] === '"' || line[i] === "'") {
        const end = line.indexOf(line[i], i + 1);
        if (end === -1) fail("Falta cerrar las comillas.");
        text += line.slice(i + 1, end);
        i = end + 1;
      } else {
        text += line[i];
        i++;
      }
    }
    tokens.push({ text, op: false });
  }
  return tokens;
}

function execute(repo: Repo, tokens: Token[], out: Out): ParsedCommand {
  const redirectAt = tokens.findIndex((token) => token.op);
  const words = (redirectAt === -1 ? tokens : tokens.slice(0, redirectAt)).map((token) => token.text);
  const [program, ...args] = words;
  const parsed: ParsedCommand = { program: program ?? "", sub: "", args };
  if (!program) fail("Falta el comando.");

  if (program === "git") {
    parsed.sub = args[0] ?? "";
    runGit(repo, args, out);
    return parsed;
  }
  if (program === "gh") {
    runGh(repo, args, out);
    collectGarbage(repo);
    return parsed;
  }
  // Uso interno, para armar escenarios con remoto:
  //   publish             todo lo local queda subido y enlazado
  //   unclone             la carpeta local queda vacía, sin Git (el remoto sigue)
  //   teammate rama archivo "texto" "mensaje"   un compañero sube un commit
  if (program === "publish") {
    repo.remote ??= { url: "https://github.com/gpi/ventas.git", branches: {}, prs: [] };
    repo.remote.branches = { ...repo.branches };
    repo.tracking = { ...repo.branches };
    repo.upstream = Object.keys(repo.branches);
    return parsed;
  }
  if (program === "unclone") {
    Object.assign(repo, { initialized: false, work: {}, index: {}, branches: {}, tracking: {}, upstream: [], stash: [] });
    repo.head = { branch: "main" };
    return parsed;
  }
  if (program === "teammate") {
    const remote = requireRemote(repo);
    const [branch, path, text, message] = args;
    const parent = remote.branches[branch] ?? remote.branches.main;
    remote.branches[branch] = addCommit(repo, message, [parent], { ...repo.commits[parent].tree, [path]: text });
    return parsed;
  }
  if (program === "echo" || program === "write") {
    // `write archivo "texto"` es de uso interno: arma los escenarios
    const text = (program === "write" ? args.slice(1) : args).join(" ").replace(/\\n/g, "\n");
    const target = program === "write" ? args[0] : tokens[redirectAt + 1]?.text;
    if (program === "echo" && redirectAt === -1) {
      out(text);
      return parsed;
    }
    if (!target) fail("Falta el nombre del archivo.");
    const append = tokens[redirectAt]?.text === ">>" && target in repo.work;
    repo.work[target] = append ? `${repo.work[target]}\n${text}` : text;
    return parsed;
  }
  if (program === "touch") {
    if (args.length === 0) fail("touch: falta el nombre del archivo");
    for (const path of args) repo.work[path] ??= "";
    return parsed;
  }
  if (program === "ls") {
    const names = Object.keys(repo.work).sort();
    if (args.includes("-a") && repo.initialized) names.unshift(".git/");
    if (names.length > 0) out(names.join("  "));
    return parsed;
  }
  if (program === "cat") {
    for (const path of args) out(repo.work[path] ?? fail(`cat: ${path}: no existe el archivo`));
    return parsed;
  }
  if (program === "rm") {
    for (const path of args) {
      if (!(path in repo.work)) fail(`rm: no se puede borrar '${path}': no existe el archivo`);
      delete repo.work[path];
    }
    return parsed;
  }
  if (program in GIT_COMMANDS || program === "init" || program === "clone") {
    fail(`${program}: comando no encontrado. ¿Quisiste decir "git ${words.join(" ")}"?`);
  }
  fail(`${program}: comando no encontrado`);
}

/** Corre una línea de consola (admite varios comandos unidos con &&). */
export function run(repo: Repo, input: string): RunResult {
  const output: string[] = [];
  const commands: ParsedCommand[] = [];
  const out: Out = (...lines) => {
    for (const line of lines) output.push(...line.split("\n"));
  };
  let current = repo;
  let ok = true;
  try {
    const tokens = tokenize(input);
    const segments: Token[][] = [[]];
    for (const token of tokens) {
      if (token.op && token.text === "&&") segments.push([]);
      else segments[segments.length - 1].push(token);
    }
    for (const segment of segments) {
      const next = clone(current);
      commands.push(execute(next, segment, out));
      current = next;
    }
  } catch (error) {
    if (!(error instanceof SimError)) throw error;
    out(error.message);
    ok = false;
  }
  return {
    repo: current,
    output,
    ok,
    changed: JSON.stringify(current) !== JSON.stringify(repo),
    commands,
  };
}

/** Arma un repositorio corriendo una lista de comandos desde cero. */
export function buildRepo(setup: string[]): Repo {
  let repo = emptyRepo();
  for (const line of setup) {
    const result = run(repo, line);
    if (!result.ok) throw new Error(`Escenario roto en "${line}": ${result.output.join(" ")}`);
    repo = result.repo;
  }
  return repo;
}
