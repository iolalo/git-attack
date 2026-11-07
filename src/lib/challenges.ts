// Los desafíos del juego, ambientados en el trabajo con un informe de Power BI
// guardado como proyecto (.pbip): medidas y tablas en archivos .tmdl, páginas
// y tema en .json. A diferencia de una cuenta, un comando de Git no se
// puede inventar al azar: cada desafío está escrito a mano como una situación
// (un repositorio armado con `setup`), un pedido y una meta que se comprueba
// sobre el repositorio simulado. Así vale cualquier comando que deje las
// cosas como se pidió, no sólo el de la respuesta modelo.

import {
  Change,
  ParsedCommand,
  Repo,
  currentBranch,
  headId,
  headTree,
  isAncestor,
  isClean,
  resolveRef,
  status,
  visibleCommits,
} from "./git/sim";
import { CASE_TEMPLATES } from "./cases";
import { TopicKey } from "./types";

export interface GoalContext {
  /** El repositorio después del comando. */
  repo: Repo;
  /** El repositorio como estaba al empezar el desafío. */
  before: Repo;
  /** Los comandos que corrieron bien en esta línea. */
  commands: ParsedCommand[];
}

export type Goal = (context: GoalContext) => boolean;

/** Nombres que cambian de una partida a otra, para que no se memorice el texto. */
interface Names {
  f: string;
  g: string;
  h: string;
  b: string;
  b2: string;
}

interface ConceptDef {
  prompt: string;
  answer: string;
  wrong: string[];
  explain: string;
}

interface CommandDef {
  prompt: string;
  setup: string[];
  /** Respuesta modelo: un comando por paso. */
  solution: string[];
  /** Comandos que parecen servir pero no cumplen el pedido. */
  wrong: string[];
  goal: Goal;
  explain: string;
  /** Pista para cuando hay que escribir el comando. */
  hint: string;
}

export interface Template {
  id: string;
  topic: TopicKey;
  /** Desde qué nivel del sector aparece: 0 Pasante, 1 Junior, 2 Senior. */
  tier: number;
  build: (names: Names) => ConceptDef | CommandDef;
}

/** Un desafío listo para jugar. */
export interface Exercise {
  id: string;
  templateId: string;
  topic: TopicKey;
  tier: number;
  /** Nivel del sector con el que se juega: define si se elige o se escribe. */
  level: number;
  kind: "concept" | "command";
  prompt: string;
  explain: string;
  /** Concepto: la respuesta. Comando: un comando por paso. */
  solution: string[];
  wrong: string[];
  hint?: string;
  setup: string[];
  goal?: Goal;
  /** Desafío que erraste antes y vuelve para repasar. */
  review?: boolean;
}

// ------------------------------------------------------------ metas comunes

const paths = (changes: Change[]) => changes.map((change) => change.path);

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((item) => b.includes(item));

const count = (repo: Repo) => visibleCommits(repo).length;

/** Se corrió ese subcomando de git (con esas opciones, si se piden). */
const ran =
  (sub: string, ...needs: string[]): Goal =>
  ({ commands }) =>
    commands.some((c) => c.program === "git" && c.sub === sub && needs.every((need) => c.args.includes(need)));

const parentOf = (repo: Repo, id: string | null) => (id ? repo.commits[id].parents[0] ?? null : null);

const sameTree = (a: Record<string, string>, b: Record<string, string>) =>
  sameSet(Object.keys(a), Object.keys(b)) && Object.keys(a).every((path) => a[path] === b[path]);

// --------------------------------------------------------------- escenarios

const w = (file: string, text: string) => `write ${file} "${text}"`;

/** Repo recién nacido: un archivo y un commit. */
const one = ({ f }: Names) => ["git init", w(f, "version 1"), "git add .", 'git commit -m "Primer commit"'];

const two = (n: Names) => [...one(n), w(n.g, "borrador"), "git add .", `git commit -m "Agrega ${n.g}"`];

const three = (n: Names) => [...two(n), w(n.f, "version 2"), `git commit -am "Actualiza ${n.f}"`];

/** Una rama con un commit de más; main no se movió (da fast-forward). */
const ahead = (n: Names) => [
  ...two(n),
  `git switch -c ${n.b}`,
  w(n.g, "version final"),
  `git commit -am "Termina ${n.g}"`,
  "git switch main",
];

/** main y la rama avanzaron cada una por su lado, en archivos distintos. */
const diverged = (n: Names) => [...ahead(n), w(n.h, "nuevo"), "git add .", `git commit -m "Agrega ${n.h}"`];

/** main y la rama cambiaron la misma línea del mismo archivo. */
const clash = (n: Names) => [
  ...one(n),
  `git switch -c ${n.b}`,
  w(n.f, `version de ${n.b}`),
  `git commit -am "Cambia ${n.f} en ${n.b}"`,
  "git switch main",
  w(n.f, "version de main"),
  `git commit -am "Cambia ${n.f} en main"`,
];

const conflicted = (n: Names) => [...clash(n), `git merge ${n.b}`];

const dirty = (n: Names) => [...two(n), w(n.f, "version 2 a medias")];

const URL = "https://github.com/gpi/ventas.git";

/** El repositorio ya está en GitHub, y tu compu y el remoto están iguales. */
const shared = (n: Names) => [...two(n), "publish"];

/** Tenés un commit que todavía no subiste. */
const unpushed = (n: Names) => [...shared(n), w(n.f, "version 2"), `git commit -am "Actualiza ${n.f}"`];

/** Un compañero subió un commit a main y vos todavía no lo bajaste. */
const teamAhead = (n: Names) => [...shared(n), `teammate main ${n.h} "nuevo" "Agrega ${n.h}"`];

/** Vos commiteaste en main y un compañero subió otro commit antes que vos. */
const raced = (n: Names) => [...teamAhead(n), w(n.f, "version 2"), `git commit -am "Actualiza ${n.f}"`];

/** Una rama con un commit propio, todavía sin subir. */
const featureLocal = (n: Names) => [
  ...shared(n),
  `git switch -c ${n.b}`,
  w(n.g, "version final"),
  `git commit -am "Termina ${n.g}"`,
];

const featurePushed = (n: Names) => [...featureLocal(n), `git push -u origin ${n.b}`];

const remoteTip = (repo: Repo, branch: string) => repo.remote?.branches[branch];

// ---------------------------------------------------------------- desafíos

const TEMPLATES: Template[] = [
  ...CASE_TEMPLATES,
  // ===== Workspace nuevo: primeros pasos =====
  {
    id: "i-repo",
    topic: "inicio",
    tier: 0,
    build: () => ({
      prompt: "¿Qué es un repositorio de Git?",
      answer: "Una carpeta con todo su historial de cambios guardado",
      wrong: ["Una página web para subir archivos", "Un programa para escribir código", "Una copia de seguridad en la nube"],
      explain: "Un repositorio es la carpeta de tu informe más el historial completo de cambios, que Git guarda adentro.",
    }),
  },
  {
    id: "i-git-github",
    topic: "inicio",
    tier: 0,
    build: () => ({
      prompt: "¿Git y GitHub son lo mismo?",
      answer: "No: Git guarda el historial en tu compu; GitHub es un sitio para compartirlo",
      wrong: ["Sí, son dos nombres del mismo programa", "No: GitHub es la versión paga de Git", "Sí, GitHub es Git en castellano"],
      explain: "Git es la herramienta y funciona sin internet. GitHub es un servicio web donde se suben repositorios para trabajar en equipo.",
    }),
  },
  {
    id: "i-pbip",
    topic: "inicio",
    tier: 0,
    build: () => ({
      prompt: "¿Por qué conviene guardar el informe como proyecto (.pbip) para usar Git?",
      answer: "Porque queda en archivos de texto y Git puede mostrar qué cambió",
      wrong: ["Porque el .pbix no se puede abrir", "Porque ocupa menos lugar en el disco", "Porque Git sólo acepta carpetas"],
      explain: "Un .pbix es un solo archivo binario: Git lo guarda, pero no puede decir qué cambió. El .pbip separa medidas, tablas y páginas en archivos de texto.",
    }),
  },
  {
    id: "i-init",
    topic: "inicio",
    tier: 0,
    build: () => ({
      prompt: "Guardaste el informe como proyecto (.pbip) y quedó en una carpeta común. Convertila en un repositorio de Git.",
      setup: [w("Ventas.pbip", "informe de ventas")],
      solution: ["git init"],
      wrong: ["git start", "git status", 'git commit -m "Inicio"'],
      goal: ({ repo }) => repo.initialized,
      explain: "git init crea la carpeta oculta .git, donde Git va a guardar el historial. Se hace una sola vez por proyecto.",
      hint: "git init",
    }),
  },
  {
    id: "i-status",
    topic: "inicio",
    tier: 0,
    build: (n) => ({
      prompt: "Antes de tocar nada: preguntale a Git en qué estado está el repositorio.",
      setup: [...one(n), w(n.g, "borrador")],
      solution: ["git status"],
      wrong: ["git state", "git init", "git log"],
      goal: ran("status"),
      explain: "git status es el comando más usado: muestra en qué rama estás y qué archivos tienen cambios sin guardar. No modifica nada.",
      hint: "git status",
    }),
  },
  {
    id: "i-untracked",
    topic: "inicio",
    tier: 0,
    build: (n) => ({
      prompt: `Git dice «Archivos sin seguimiento: ${n.g}». ¿Qué significa?`,
      answer: "Git ve el archivo, pero todavía no lo guarda en el historial",
      wrong: ["El archivo está dañado", "El archivo ya está en el último commit", "Git borró el archivo"],
      explain: "Un archivo nuevo queda «sin seguimiento» hasta que le hacés git add. Mientras tanto, Git no guarda sus cambios.",
    }),
  },
  {
    id: "i-zonas",
    topic: "inicio",
    tier: 0,
    build: () => ({
      prompt: "¿Por qué tres zonas pasa un cambio hasta quedar guardado?",
      answer: "Carpeta de trabajo → staging → commit",
      wrong: ["Commit → staging → carpeta de trabajo", "Staging → carpeta de trabajo → commit", "Carpeta de trabajo → commit → staging"],
      explain: "Editás en la carpeta de trabajo, con git add pasás el cambio al staging y con git commit queda en el historial.",
    }),
  },
  {
    id: "i-commit-que",
    topic: "inicio",
    tier: 0,
    build: () => ({
      prompt: "¿Qué es un commit?",
      answer: "Una foto del proyecto en un momento, con un mensaje que la explica",
      wrong: ["Un archivo comprimido con el proyecto", "Un mensaje que se le manda al equipo", "Una rama nueva del proyecto"],
      explain: "Cada commit guarda cómo estaba todo el proyecto en ese momento. El historial es la cadena de esas fotos.",
    }),
  },
  {
    id: "i-limpio",
    topic: "inicio",
    tier: 0,
    build: () => ({
      prompt: "Git dice «nada para confirmar, el árbol de trabajo está limpio». ¿Qué quiere decir?",
      answer: "No hay cambios sin guardar: todo está en el último commit",
      wrong: ["El repositorio está vacío", "Se borraron todos los archivos", "Falta hacer git init"],
      explain: "«Limpio» es la buena noticia: tu carpeta está igual que el último commit y no hay nada pendiente.",
    }),
  },
  {
    id: "i-status-corto",
    topic: "inicio",
    tier: 1,
    build: (n) => ({
      prompt: "Pedí el estado del repositorio en formato corto, una línea por archivo.",
      setup: [...one(n), w(n.g, "borrador"), w(n.f, "version 2")],
      solution: ["git status -s"],
      wrong: ["git status --mini", "git log -s", "git short"],
      goal: ({ commands }) =>
        commands.some((c) => c.sub === "status" && (c.args.includes("-s") || c.args.includes("--short"))),
      explain: "Con -s cada archivo ocupa una línea: «??» sin seguimiento, « M» modificado, «A » preparado.",
      hint: "git status con la opción -s",
    }),
  },
  {
    id: "i-dotgit",
    topic: "inicio",
    tier: 1,
    build: () => ({
      prompt: "¿Qué guarda la carpeta oculta .git?",
      answer: "Todo el historial y la configuración del repositorio",
      wrong: ["Sólo los archivos borrados", "Una copia del proyecto en internet", "Las contraseñas del equipo"],
      explain: "El repositorio entero vive en .git. Si la borrás, la carpeta vuelve a ser una carpeta común y perdés el historial.",
    }),
  },
  {
    id: "i-reinit",
    topic: "inicio",
    tier: 1,
    build: () => ({
      prompt: "Corrés git init en una carpeta que ya era un repositorio. ¿Qué pasa?",
      answer: "Nada grave: el historial queda como estaba",
      wrong: ["Se borra todo el historial", "Se crea un segundo repositorio adentro", "Se suben los archivos a GitHub"],
      explain: "Repetir git init es inofensivo: Git avisa que «reinicializó» el repositorio y no toca tus commits.",
    }),
  },
  {
    id: "i-init-status",
    topic: "inicio",
    tier: 2,
    build: () => ({
      prompt: "Carpeta de un informe nuevo, sin Git. Inicializá el repositorio y después revisá su estado.",
      setup: [w("Ventas.pbip", "informe de ventas")],
      solution: ["git init", "git status"],
      wrong: ["git status && git init", "git init && git log", "git start && git status"],
      goal: ({ repo, commands }) => repo.initialized && commands.some((c) => c.sub === "status"),
      explain: "Primero git init (sin repositorio, status falla) y después git status para ver qué encontró Git en la carpeta.",
      hint: "Dos comandos: primero crear el repo, después mirar el estado",
    }),
  },

  // ===== Modelo semántico: guardar cambios =====
  {
    id: "g-add",
    topic: "guardar",
    tier: 0,
    build: (n) => ({
      prompt: `Creaste ${n.g}. Preparalo para el próximo commit.`,
      setup: [...one(n), w(n.g, "borrador")],
      solution: [`git add ${n.g}`],
      wrong: [`git commit ${n.g}`, `git status ${n.g}`, `git save ${n.g}`],
      goal: ({ repo }) => sameSet(paths(status(repo).staged), [n.g]),
      explain: "git add pasa el archivo al staging: la lista de lo que va a entrar en el próximo commit.",
      hint: "git add <archivo>",
    }),
  },
  {
    id: "g-commit",
    topic: "guardar",
    tier: 0,
    build: (n) => ({
      prompt: `${n.g} ya está en el staging. Guardalo en el historial con un mensaje.`,
      setup: [...one(n), w(n.g, "borrador"), `git add ${n.g}`],
      solution: [`git commit -m "Agrega ${n.g}"`],
      wrong: [`git add -m "Agrega ${n.g}"`, `git save "Agrega ${n.g}"`, `git commit ${n.g}`],
      goal: ({ repo, before }) => count(repo) === count(before) + 1 && status(repo).staged.length === 0,
      explain: "git commit guarda lo que hay en el staging. Con -m va el mensaje, entre comillas, que explica qué cambiaste.",
      hint: 'git commit -m "mensaje"',
    }),
  },
  {
    id: "g-add-todo",
    topic: "guardar",
    tier: 0,
    build: (n) => ({
      prompt: `Creaste ${n.g} y ${n.h}. Preparalos a los dos de una sola vez.`,
      setup: [...one(n), w(n.g, "borrador"), w(n.h, "borrador")],
      solution: ["git add ."],
      wrong: ["git add", "git add all", "git commit ."],
      goal: ({ repo }) => sameSet(paths(status(repo).staged), [n.g, n.h]),
      explain: "El punto significa «todo lo de esta carpeta»: git add . prepara todos los cambios juntos.",
      hint: "git add y un punto",
    }),
  },
  {
    id: "g-add-uno",
    topic: "guardar",
    tier: 0,
    build: (n) => ({
      prompt: `Cambiaste ${n.f} y creaste ${n.g}, pero en este commit sólo va ${n.f}. Prepará sólo ese.`,
      setup: [...one(n), w(n.f, "version 2"), w(n.g, "borrador")],
      solution: [`git add ${n.f}`],
      wrong: ["git add .", `git add ${n.g}`, `git commit ${n.f}`],
      goal: ({ repo }) => sameSet(paths(status(repo).staged), [n.f]),
      explain: "El staging existe para esto: elegís qué cambios entran en cada commit, y el resto espera su turno.",
      hint: "git add <archivo>",
    }),
  },
  {
    id: "g-orden",
    topic: "guardar",
    tier: 0,
    build: () => ({
      prompt: "¿En qué orden se guarda un cambio?",
      answer: "Editar → git add → git commit",
      wrong: ["git commit → git add → editar", "Editar → git commit → git add", "git add → editar → git commit"],
      explain: "Primero cambiás el archivo, después lo preparás con git add y recién ahí lo guardás con git commit.",
    }),
  },
  {
    id: "g-mensaje",
    topic: "guardar",
    tier: 0,
    build: () => ({
      prompt: "¿Cuál es el mejor mensaje de commit?",
      answer: "Corrige el IVA en la medida Venta Neta",
      wrong: ["cambios", "asdf", "arreglo cosas varias del informe"],
      explain: "Un buen mensaje dice qué cambió y se entiende meses después, sin abrir el commit.",
    }),
  },
  {
    id: "g-staging-para",
    topic: "guardar",
    tier: 0,
    build: () => ({
      prompt: "¿Para qué sirve el staging?",
      answer: "Para elegir qué cambios entran en el próximo commit",
      wrong: ["Para subir archivos a internet", "Para borrar archivos viejos", "Para hacer una copia de seguridad"],
      explain: "El staging es la mesa de preparación: ponés ahí sólo lo que querés guardar junto en un commit.",
    }),
  },
  {
    id: "g-modificado",
    topic: "guardar",
    tier: 0,
    build: (n) => ({
      prompt: `Modificaste ${n.f}, que ya estaba en el repositorio. Prepará ese cambio.`,
      setup: [...one(n), w(n.f, "version 2")],
      solution: [`git add ${n.f}`],
      wrong: [`git update ${n.f}`, `git commit ${n.f}`, `git restore ${n.f}`],
      goal: ({ repo }) => sameSet(paths(status(repo).staged), [n.f]),
      explain: "git add no es sólo para archivos nuevos: cada vez que modificás uno hay que volver a prepararlo.",
      hint: "git add <archivo>",
    }),
  },
  {
    id: "g-nada",
    topic: "guardar",
    tier: 1,
    build: () => ({
      prompt: "Modificás un archivo y hacés git commit sin haber hecho git add. ¿Qué pasa?",
      answer: "Git avisa que no hay nada preparado y no crea el commit",
      wrong: ["Se guarda el cambio igual", "Se borra el cambio", "Git prepara todo solo y hace el commit"],
      explain: "El commit sólo toma lo que está en el staging. Si está vacío, no hay nada que guardar.",
    }),
  },
  {
    id: "g-am",
    topic: "guardar",
    tier: 1,
    build: (n) => ({
      prompt: `Modificaste ${n.f}, que Git ya seguía. Preparalo y guardalo con un solo comando.`,
      setup: [...one(n), w(n.f, "version 2")],
      solution: [`git commit -am "Actualiza ${n.f}"`],
      wrong: [`git commit -m "Actualiza ${n.f}"`, `git add ${n.f}`, `git add -m "Actualiza ${n.f}"`],
      goal: ({ repo, before }) => count(repo) === count(before) + 1 && isClean(repo),
      explain: "La opción -a prepara sola los archivos que Git ya seguía. No incluye archivos nuevos: a esos hay que hacerles git add.",
      hint: 'git commit con -a y -m juntos: -am "mensaje"',
    }),
  },
  {
    id: "g-am-nuevos",
    topic: "guardar",
    tier: 1,
    build: () => ({
      prompt: "git commit -am, ¿incluye los archivos nuevos sin seguimiento?",
      answer: "No: sólo los archivos que Git ya seguía",
      wrong: ["Sí, incluye todo lo de la carpeta", "Sí, pero sólo los .txt", "No incluye ningún archivo"],
      explain: "-a sólo prepara cambios de archivos que ya están en el repositorio. Un archivo nuevo necesita su git add.",
    }),
  },
  {
    id: "g-add-commit",
    topic: "guardar",
    tier: 2,
    build: (n) => ({
      prompt: `Creaste ${n.g}. Dejalo guardado en el historial, de principio a fin.`,
      setup: [...one(n), w(n.g, "borrador")],
      solution: [`git add ${n.g}`, `git commit -m "Agrega ${n.g}"`],
      wrong: [`git commit -am "Agrega ${n.g}"`, `git commit -m "Agrega ${n.g}" && git add ${n.g}`, `git add ${n.g} && git commit`],
      goal: ({ repo, before }) => count(repo) === count(before) + 1 && n.g in headTree(repo) && isClean(repo),
      explain: "El circuito completo: git add lo prepara y git commit -m lo guarda. Un archivo nuevo no entra con -am.",
      hint: "Dos pasos: preparar y guardar",
    }),
  },
  {
    id: "g-dos-commits",
    topic: "guardar",
    tier: 2,
    build: (n) => ({
      prompt: `Cambiaste ${n.f} y creaste ${n.g}: son dos temas distintos. Guardá cada uno en su propio commit.`,
      setup: [...one(n), w(n.f, "version 2"), w(n.g, "borrador")],
      solution: [`git add ${n.f}`, `git commit -m "Actualiza ${n.f}"`, `git add ${n.g}`, `git commit -m "Agrega ${n.g}"`],
      wrong: ['git add . && git commit -m "Cambios"', `git add ${n.f} && git commit -m "Todo"`, 'git commit -am "Cambios"'],
      goal: ({ repo, before }) => {
        const head = headId(repo);
        const previous = parentOf(repo, head);
        return (
          isClean(repo) &&
          !!head &&
          !!previous &&
          parentOf(repo, previous) === headId(before) &&
          !sameTree(repo.commits[head].tree, repo.commits[previous].tree)
        );
      },
      explain: "Un commit por tema: preparás un archivo, lo guardás, y repetís con el otro. Así el historial se lee solo.",
      hint: "add y commit de un archivo; después add y commit del otro",
    }),
  },

  // ===== Linaje de versiones: historial =====
  {
    id: "h-log",
    topic: "historial",
    tier: 0,
    build: (n) => ({
      prompt: "Necesitás ver la lista de commits del proyecto.",
      setup: three(n),
      solution: ["git log"],
      wrong: ["git history", "git status", "git commits"],
      goal: ran("log"),
      explain: "git log muestra el historial, del commit más nuevo al más viejo, con su identificador y su mensaje.",
      hint: "git log",
    }),
  },
  {
    id: "h-oneline",
    topic: "historial",
    tier: 0,
    build: (n) => ({
      prompt: "Mostrá el historial resumido: un commit por línea.",
      setup: three(n),
      solution: ["git log --oneline"],
      wrong: ["git log --short", "git status -s", "git oneline"],
      goal: ran("log", "--oneline"),
      explain: "--oneline achica cada commit a una línea: el hash corto y el mensaje. Ideal para mirar rápido.",
      hint: "git log con la opción --oneline",
    }),
  },
  {
    id: "h-diff",
    topic: "historial",
    tier: 0,
    build: (n) => ({
      prompt: `Tocaste ${n.f} y no te acordás qué cambiaste. Mirá las diferencias.`,
      setup: [...two(n), w(n.f, "version 2")],
      solution: ["git diff"],
      wrong: ["git status", "git log", "git changes"],
      goal: ({ commands }) =>
        commands.some((c) => c.sub === "diff" && !c.args.includes("--staged") && !c.args.includes("--cached")),
      explain: "git diff muestra línea por línea lo que cambiaste y todavía no preparaste: «-» lo que salió, «+» lo que entró.",
      hint: "git diff",
    }),
  },
  {
    id: "h-diff-staged",
    topic: "historial",
    tier: 0,
    build: (n) => ({
      prompt: `Ya le hiciste git add a ${n.f}. Revisá qué va a entrar en el commit.`,
      setup: [...two(n), w(n.f, "version 2"), `git add ${n.f}`],
      solution: ["git diff --staged"],
      wrong: ["git diff", "git log --staged", "git status --diff"],
      goal: ({ commands }) =>
        commands.some((c) => c.sub === "diff" && (c.args.includes("--staged") || c.args.includes("--cached"))),
      explain: "git diff a secas no muestra lo que ya está preparado. Con --staged ves lo que está en el staging.",
      hint: "git diff con la opción --staged",
    }),
  },
  {
    id: "h-hash",
    topic: "historial",
    tier: 0,
    build: () => ({
      prompt: "¿Qué es ese código tipo a1b2c3d que tiene cada commit?",
      answer: "El identificador único del commit (hash)",
      wrong: ["La contraseña del repositorio", "El número de línea que cambió", "La fecha escrita en clave"],
      explain: "Cada commit tiene un hash que lo identifica. Sirve para nombrarlo en otros comandos, como git show a1b2c3d.",
    }),
  },
  {
    id: "h-head",
    topic: "historial",
    tier: 0,
    build: () => ({
      prompt: "En el historial aparece «HEAD -> main». ¿Qué es HEAD?",
      answer: "Dónde estás parado ahora: el commit actual",
      wrong: ["El primer commit del proyecto", "El dueño del repositorio", "El commit más viejo de la rama"],
      explain: "HEAD es el «usted está aquí» de Git. «HEAD -> main» dice que estás en la rama main, en su último commit.",
    }),
  },
  {
    id: "h-show",
    topic: "historial",
    tier: 0,
    build: (n) => ({
      prompt: "Mostrá qué cambió exactamente en el último commit.",
      setup: three(n),
      solution: ["git show"],
      wrong: ["git diff", "git status", "git last"],
      goal: ran("show"),
      explain: "git show muestra un commit completo: mensaje y diferencias. Sin nada más, muestra el último (HEAD).",
      hint: "git show",
    }),
  },
  {
    id: "h-status-diff",
    topic: "historial",
    tier: 0,
    build: () => ({
      prompt: "¿Qué diferencia hay entre git status y git diff?",
      answer: "status dice qué archivos cambiaron; diff muestra qué líneas",
      wrong: ["Son dos nombres del mismo comando", "status muestra el historial; diff, las ramas", "diff guarda los cambios; status los borra"],
      explain: "status es el resumen (qué archivos); diff es el detalle (qué líneas). Ninguno de los dos modifica nada.",
    }),
  },
  {
    id: "h-log-n",
    topic: "historial",
    tier: 1,
    build: (n) => ({
      prompt: "Mostrá sólo los últimos 2 commits del historial.",
      setup: three(n),
      solution: ["git log -n 2"],
      wrong: ["git log 2", "git log --last 2", "git show 2"],
      goal: ({ commands }) =>
        commands.some(
          (c) =>
            c.sub === "log" &&
            (c.args.includes("-2") || c.args.includes("-n2") || c.args[c.args.indexOf("-n") + 1] === "2")
        ),
      explain: "-n limita cuántos commits se muestran. También se puede escribir más corto: git log -2.",
      hint: "git log con -n y la cantidad",
    }),
  },
  {
    id: "h-show-prev",
    topic: "historial",
    tier: 1,
    build: (n) => ({
      prompt: "Mostrá el commit anterior al último.",
      setup: three(n),
      solution: ["git show HEAD~1"],
      wrong: ["git show", "git show -1", "git log HEAD~1"],
      goal: ({ repo, commands }) =>
        commands.some(
          (c) => c.sub === "show" && c.args.slice(1).some((arg) => resolveRef(repo, arg) === parentOf(repo, headId(repo)))
        ),
      explain: "HEAD~1 significa «un commit antes de HEAD». También sirve el hash de ese commit.",
      hint: "git show y el commit: HEAD~1 es «el anterior»",
    }),
  },
  {
    id: "h-diff-file",
    topic: "historial",
    tier: 1,
    build: (n) => ({
      prompt: `Cambiaste ${n.f} y ${n.g}. Mirá las diferencias sólo de ${n.f}.`,
      setup: [...two(n), w(n.f, "version 2"), w(n.g, "version final")],
      solution: [`git diff ${n.f}`],
      wrong: ["git diff --staged", `git show ${n.f}`, `git log ${n.g}`],
      goal: ({ commands }) => commands.some((c) => c.sub === "diff" && c.args.includes(n.f) && !c.args.includes(n.g)),
      explain: "Si a git diff le pasás un archivo, muestra sólo las diferencias de ese archivo.",
      hint: "git diff <archivo>",
    }),
  },
  {
    id: "h-menos",
    topic: "historial",
    tier: 1,
    build: () => ({
      prompt: "En la salida de git diff, una línea que empieza con «-» es...",
      answer: "Una línea que se quitó",
      wrong: ["Una línea que se agregó", "Un comentario de Git", "Una línea que no cambió"],
      explain: "«-» marca lo que había antes y ya no está; «+» marca lo nuevo. Una línea modificada aparece como un «-» y un «+».",
    }),
  },
  {
    id: "h-graph",
    topic: "historial",
    tier: 2,
    build: (n) => ({
      prompt: "Mostrá el historial de todas las ramas, resumido y con el dibujo de las ramas.",
      setup: diverged(n),
      solution: ["git log --oneline --graph --all"],
      wrong: ["git log --oneline", "git branch --graph", "git log --all"],
      goal: ran("log", "--oneline", "--graph", "--all"),
      explain: "--all incluye todas las ramas, --graph dibuja cómo se abren y se juntan, y --oneline lo deja legible.",
      hint: "git log con tres opciones: --oneline, --graph y --all",
    }),
  },

  // ===== Power Query: deshacer =====
  {
    id: "d-restore",
    topic: "deshacer",
    tier: 0,
    build: (n) => ({
      prompt: `Un cambio mal hecho rompió ${n.f} y todavía no lo preparaste. Descartá el cambio y volvé a la versión guardada.`,
      setup: [...two(n), w(n.f, "paso mal aplicado")],
      solution: [`git restore ${n.f}`],
      wrong: [`git restore --staged ${n.f}`, `git rm ${n.f}`, `git undo ${n.f}`],
      goal: ({ repo }) => repo.work[n.f] === headTree(repo)[n.f] && status(repo).unstaged.length === 0,
      explain: "git restore devuelve el archivo a como estaba guardado. Ojo: el cambio descartado no se recupera.",
      hint: "git restore <archivo>",
    }),
  },
  {
    id: "d-unstage",
    topic: "deshacer",
    tier: 0,
    build: (n) => ({
      prompt: `Le hiciste git add a ${n.h} sin querer. Sacalo del staging, sin perder el archivo.`,
      setup: [...two(n), w(n.h, "borrador"), `git add ${n.h}`],
      solution: [`git restore --staged ${n.h}`],
      wrong: [`git restore ${n.h}`, `git rm ${n.h}`, `git unstage ${n.h}`],
      goal: ({ repo }) => status(repo).staged.length === 0 && n.h in repo.work,
      explain: "Con --staged, restore sólo saca el archivo del staging. El archivo sigue en tu carpeta, intacto.",
      hint: "git restore con la opción --staged",
    }),
  },
  {
    id: "d-amend-msg",
    topic: "deshacer",
    tier: 0,
    build: (n) => ({
      prompt: "El último commit quedó con un error de tipeo en el mensaje. Corregilo.",
      setup: [...two(n), w(n.f, "version 2"), `git commit -am "Actualisa ${n.f}"`],
      solution: [`git commit --amend -m "Actualiza ${n.f}"`],
      wrong: [`git commit -m "Actualiza ${n.f}"`, "git revert HEAD", `git log --amend "Actualiza ${n.f}"`],
      goal: ({ repo, before }) => {
        const head = headId(repo);
        const old = headId(before);
        return (
          !!head &&
          !!old &&
          count(repo) === count(before) &&
          repo.commits[head].message !== before.commits[old].message &&
          sameTree(headTree(repo), headTree(before))
        );
      },
      explain: "--amend reemplaza el último commit por uno corregido. Usalo sólo si todavía no lo compartiste con nadie.",
      hint: 'git commit --amend -m "mensaje nuevo"',
    }),
  },
  {
    id: "d-restore-peligro",
    topic: "deshacer",
    tier: 0,
    build: () => ({
      prompt: "Descartás cambios con git restore y te arrepentís. ¿Se pueden recuperar?",
      answer: "No: lo que nunca se guardó en un commit se pierde",
      wrong: ["Sí, con git log", "Sí, quedan en el staging", "Sí, en la papelera de Git"],
      explain: "Git sólo puede devolverte lo que alguna vez guardaste en un commit. Lo descartado sin guardar no vuelve.",
    }),
  },
  {
    id: "d-gitignore",
    topic: "deshacer",
    tier: 0,
    build: () => ({
      prompt: "¿Para qué sirve el archivo .gitignore?",
      answer: "Para listar archivos que Git no tiene que seguir",
      wrong: ["Para borrar archivos del disco", "Para esconder commits viejos", "Para que Git ignore los errores"],
      explain: "En .gitignore anotás lo que no va al repositorio. En un proyecto de Power BI: la copia local de los datos (cache.abf) y tu configuración personal.",
    }),
  },
  {
    id: "d-que-ignorar",
    topic: "deshacer",
    tier: 0,
    build: () => ({
      prompt: "¿Cuál de estos archivos conviene poner en .gitignore?",
      answer: "cache.abf (copia local de los datos)",
      wrong: ["Medidas.tmdl", "paginas.json", "Ventas.pbip"],
      explain: "cache.abf pesa mucho y puede tener datos sensibles: una vez en el historial, los ve cualquiera que tenga el repositorio. El modelo y el informe sí van.",
    }),
  },
  {
    id: "d-amend-que",
    topic: "deshacer",
    tier: 0,
    build: () => ({
      prompt: "¿Qué hace git commit --amend?",
      answer: "Reemplaza el último commit por uno corregido",
      wrong: ["Borra todos los commits", "Crea una rama nueva", "Deshace el último git add"],
      explain: "--amend rehace el último commit: sirve para corregir el mensaje o sumarle un archivo que te olvidaste.",
    }),
  },
  {
    id: "d-restore-dos",
    topic: "deshacer",
    tier: 0,
    build: () => ({
      prompt: "¿Qué cambia entre git restore y git restore --staged?",
      answer: "Sin --staged descarta los cambios; con --staged sólo saca del staging",
      wrong: ["Hacen exactamente lo mismo", "Con --staged se borra el archivo", "Sin --staged se hace un commit"],
      explain: "restore a secas pisa tu archivo con la versión guardada. Con --staged no toca el archivo: sólo lo «des-prepara».",
    }),
  },
  {
    id: "d-rm-cached",
    topic: "deshacer",
    tier: 1,
    build: (n) => ({
      prompt: "cache.abf (la copia local de los datos) se guardó en el repositorio por error. Hacé que Git deje de seguirlo, sin borrarlo de tu carpeta.",
      setup: [...one(n), w("cache.abf", "datos de ventas"), "git add .", 'git commit -m "Agrega el informe"'],
      solution: ["git rm --cached cache.abf"],
      wrong: ["git rm cache.abf", "git restore cache.abf", "git ignore cache.abf"],
      goal: ({ repo }) => !("cache.abf" in repo.index) && "cache.abf" in repo.work,
      explain: "git rm --cached saca el archivo del repositorio pero lo deja en tu carpeta. Después conviene sumarlo a .gitignore.",
      hint: "git rm con la opción --cached",
    }),
  },
  {
    id: "d-restore-todo",
    topic: "deshacer",
    tier: 1,
    build: (n) => ({
      prompt: "Rompiste varios archivos a la vez. Descartá todos los cambios sin preparar.",
      setup: [...two(n), w(n.f, "roto"), w(n.g, "roto")],
      solution: ["git restore ."],
      wrong: ["git restore --staged .", "git add .", "git reset"],
      goal: ({ repo }) => isClean(repo) && repo.stash.length === 0,
      explain: "Igual que con git add, el punto significa «todo»: git restore . devuelve todos los archivos a su versión guardada.",
      hint: "git restore y un punto",
    }),
  },
  {
    id: "d-unstage-keep",
    topic: "deshacer",
    tier: 1,
    build: (n) => ({
      prompt: `Preparaste ${n.f} pero todavía no lo querés guardar. Sacalo del staging conservando tus cambios.`,
      setup: [...two(n), w(n.f, "version 2"), `git add ${n.f}`],
      solution: [`git restore --staged ${n.f}`],
      wrong: [`git restore ${n.f}`, "git reset --hard", "git commit --amend"],
      goal: ({ repo }) => status(repo).staged.length === 0 && paths(status(repo).unstaged).includes(n.f),
      explain: "restore --staged devuelve el archivo a «modificado, sin preparar». Tus cambios siguen en la carpeta.",
      hint: "git restore con la opción --staged",
    }),
  },
  {
    id: "d-amend-file",
    topic: "deshacer",
    tier: 2,
    build: (n) => ({
      prompt: `Te olvidaste de incluir ${n.h} en el último commit. Sumalo a ese commit, sin crear uno nuevo.`,
      setup: [...two(n), w(n.h, "olvidado")],
      solution: [`git add ${n.h}`, "git commit --amend --no-edit"],
      wrong: [`git add ${n.h} && git commit -m "Olvido"`, "git commit --amend --no-edit", `git commit --amend ${n.h}`],
      goal: ({ repo, before }) => count(repo) === count(before) && n.h in headTree(repo) && isClean(repo),
      explain: "Preparás lo que faltaba y --amend lo mete en el último commit. --no-edit conserva el mensaje que ya tenía.",
      hint: "Preparar el archivo y después git commit --amend --no-edit",
    }),
  },
  {
    id: "d-ignore-write",
    topic: "deshacer",
    tier: 2,
    build: (n) => ({
      prompt: "Power BI dejó cache.abf en la carpeta y no querés que Git lo vea. Creá el .gitignore para que ignore todos los .abf.",
      setup: [...one(n), w("cache.abf", "datos de ventas")],
      solution: ['echo "*.abf" > .gitignore'],
      wrong: ["git ignore *.abf", "git rm cache.abf", "git add cache.abf"],
      goal: ({ repo }) =>
        ".gitignore" in repo.work && "cache.abf" in repo.work && !status(repo).untracked.includes("cache.abf"),
      explain: "*.abf significa «cualquier archivo terminado en .abf». El .gitignore también se guarda en el repositorio.",
      hint: 'echo "patrón" > .gitignore',
    }),
  },

  // ===== Ambiente DEV: ramas =====
  {
    id: "r-que",
    topic: "ramas",
    tier: 0,
    build: () => ({
      prompt: "¿Qué es una rama?",
      answer: "Una línea de trabajo paralela, para probar cosas sin tocar main",
      wrong: ["Una copia del repositorio en otra compu", "Un commit muy grande", "Una carpeta dentro del proyecto"],
      explain: "Una rama es un camino aparte en el historial. Lo que guardás ahí no afecta a main hasta que las juntás.",
    }),
  },
  {
    id: "r-create",
    topic: "ramas",
    tier: 0,
    build: (n) => ({
      prompt: `Vas a arrancar «${n.b}». Creá la rama, pero quedate en main por ahora.`,
      setup: two(n),
      solution: [`git branch ${n.b}`],
      wrong: [`git switch ${n.b}`, `git checkout ${n.b}`, `git branch -d ${n.b}`],
      goal: ({ repo }) => !!repo.branches[n.b] && currentBranch(repo) === "main",
      explain: "git branch <nombre> crea la rama en el commit actual, pero vos seguís parado donde estabas.",
      hint: "git branch <nombre>",
    }),
  },
  {
    id: "r-switch",
    topic: "ramas",
    tier: 0,
    build: (n) => ({
      prompt: `La rama ${n.b} ya existe. Pasate a ella.`,
      setup: [...two(n), `git branch ${n.b}`],
      solution: [`git switch ${n.b}`],
      wrong: [`git branch ${n.b}`, `git switch -c ${n.b}`, `git merge ${n.b}`],
      goal: ({ repo }) => currentBranch(repo) === n.b,
      explain: "git switch te cambia de rama. Vas a ver que HEAD pasa a apuntar a la rama nueva.",
      hint: "git switch <rama>",
    }),
  },
  {
    id: "r-create-switch",
    topic: "ramas",
    tier: 0,
    build: (n) => ({
      prompt: `Creá la rama ${n.b} y pasate a ella, todo en un solo comando.`,
      setup: two(n),
      solution: [`git switch -c ${n.b}`],
      wrong: [`git branch ${n.b}`, `git switch ${n.b}`, `git checkout ${n.b}`],
      goal: ({ repo }) => currentBranch(repo) === n.b,
      explain: "La opción -c («create») crea la rama y te pasa a ella de una. Es lo más común al empezar una tarea.",
      hint: "git switch con la opción -c",
    }),
  },
  {
    id: "r-list",
    topic: "ramas",
    tier: 0,
    build: (n) => ({
      prompt: "¿Qué ramas tiene el repositorio? Listalas.",
      setup: [...two(n), `git branch ${n.b}`, `git branch ${n.b2}`],
      solution: ["git branch"],
      wrong: ["git branches", "git status", "git log"],
      goal: ({ commands }) =>
        commands.some(
          (c) => c.sub === "branch" && c.args.slice(1).every((arg) => ["-a", "-v", "--list", "--all"].includes(arg))
        ),
      explain: "git branch sin nada más lista las ramas. La que tiene el asterisco es en la que estás parado.",
      hint: "git branch",
    }),
  },
  {
    id: "r-donde",
    topic: "ramas",
    tier: 0,
    build: (n) => ({
      prompt: `Estás en la rama ${n.b} y hacés un commit. ¿Qué le pasa a main?`,
      answer: "Nada: main queda donde estaba",
      wrong: ["main también avanza", "main se borra", "El commit queda en las dos ramas"],
      explain: "Los commits avanzan sólo la rama en la que estás parado. Las demás no se enteran.",
    }),
  },
  {
    id: "r-asterisco",
    topic: "ramas",
    tier: 0,
    build: (n) => ({
      prompt: `git branch muestra «* ${n.b}» y «  main». ¿Qué indica el asterisco?`,
      answer: "La rama en la que estás parado",
      wrong: ["La rama más nueva", "La rama que tiene errores", "La rama principal del proyecto"],
      explain: "El asterisco marca tu rama actual: la misma a la que apunta HEAD.",
    }),
  },
  {
    id: "r-delete",
    topic: "ramas",
    tier: 0,
    build: (n) => ({
      prompt: `La rama ${n.b} ya se fusionó en main y no hace falta más. Borrala.`,
      setup: [...ahead(n), `git merge ${n.b}`],
      solution: [`git branch -d ${n.b}`],
      wrong: [`git branch ${n.b}`, `git rm ${n.b}`, `git switch -d ${n.b}`],
      goal: ({ repo }) => !repo.branches[n.b],
      explain: "git branch -d borra la rama (el nombre), no los commits: esos ya están en main.",
      hint: "git branch con la opción -d",
    }),
  },
  {
    id: "r-volver",
    topic: "ramas",
    tier: 1,
    build: (n) => ({
      prompt: `Terminaste por hoy en ${n.b}. Volvé a la rama principal.`,
      setup: [...two(n), `git switch -c ${n.b}`, w(n.f, "version 2"), `git commit -am "Avanza ${n.b}"`],
      solution: ["git switch main"],
      wrong: ["git switch -c main", "git branch main", "git merge main"],
      goal: ({ repo }) => currentBranch(repo) === "main",
      explain: "Al cambiar de rama, Git deja tu carpeta como estaba en esa rama: los archivos cambian solos.",
      hint: "git switch <rama>",
    }),
  },
  {
    id: "r-rename",
    topic: "ramas",
    tier: 1,
    build: (n) => ({
      prompt: `Estás en una rama que se llama «cosas». Ponele un nombre claro: ${n.b}.`,
      setup: [...two(n), "git switch -c cosas"],
      solution: [`git branch -m ${n.b}`],
      wrong: [`git branch ${n.b}`, `git rename ${n.b}`, `git switch -c ${n.b}`],
      goal: ({ repo }) => !repo.branches.cosas && !!repo.branches[n.b] && currentBranch(repo) === n.b,
      explain: "git branch -m («move») renombra la rama en la que estás. Los commits no cambian.",
      hint: "git branch con la opción -m",
    }),
  },
  {
    id: "r-no-fusionada",
    topic: "ramas",
    tier: 1,
    build: () => ({
      prompt: "git branch -d falla y dice que la rama «no está completamente fusionada». ¿Por qué?",
      answer: "Git te cuida: esa rama tiene commits que se perderían",
      wrong: ["Porque la rama está vacía", "Porque hay que borrar main primero", "Porque falta conexión a internet"],
      explain: "-d sólo borra ramas ya fusionadas. Para borrarla igual (y perder esos commits) existe -D, en mayúscula.",
    }),
  },
  {
    id: "r-commit-en-rama",
    topic: "ramas",
    tier: 2,
    build: (n) => ({
      prompt: `Modificaste ${n.f} estando en main, pero ese cambio va en una rama nueva: ${n.b}. Creala y guardalo ahí.`,
      setup: [...two(n), w(n.f, "version 2")],
      solution: [`git switch -c ${n.b}`, `git commit -am "Actualiza ${n.f}"`],
      wrong: [`git commit -am "Actualiza ${n.f}" && git switch -c ${n.b}`, `git branch ${n.b} && git commit -am "Actualiza ${n.f}"`, `git switch -c ${n.b}`],
      goal: ({ repo, before }) =>
        currentBranch(repo) === n.b &&
        repo.branches.main === before.branches.main &&
        parentOf(repo, headId(repo)) === before.branches.main &&
        isClean(repo),
      explain: "Los cambios sin guardar viajan con vos al cambiar de rama: creás la rama y recién ahí hacés el commit.",
      hint: "Primero la rama nueva (switch -c), después el commit",
    }),
  },
  {
    id: "r-desde",
    topic: "ramas",
    tier: 2,
    build: (n) => ({
      prompt: `Creá la rama ${n.b} y pasate a ella, pero que nazca del commit anterior al último.`,
      setup: three(n),
      solution: [`git switch -c ${n.b} HEAD~1`],
      wrong: [`git switch -c ${n.b}`, `git branch ${n.b} HEAD~1`, "git switch HEAD~1"],
      goal: ({ repo, before }) => currentBranch(repo) === n.b && headId(repo) === parentOf(before, headId(before)),
      explain: "Después del nombre podés decir desde dónde nace la rama. HEAD~1 es el commit anterior al actual.",
      hint: "git switch -c <rama> <commit de partida>",
    }),
  },

  {
    id: "r-head-suelta",
    topic: "ramas",
    tier: 1,
    build: () => ({
      prompt: "Git avisa que estás con la «HEAD desacoplada». ¿Qué significa?",
      answer: "Estás parado en un commit, no en una rama",
      wrong: ["Se borró la rama main", "El repositorio está dañado", "Hay un conflicto sin resolver"],
      explain: "Normalmente HEAD apunta a una rama. Si te parás directo en un commit, HEAD queda suelta: sirve para mirar, pero lo que guardes ahí no queda en ninguna rama.",
    }),
  },
  {
    id: "r-detach",
    topic: "ramas",
    tier: 1,
    build: (n) => ({
      prompt: "Querés mirar cómo estaba el informe en el commit anterior, sin mover ninguna rama. Parate en ese commit.",
      setup: three(n),
      solution: ["git checkout HEAD~1"],
      wrong: ["git reset --hard HEAD~1", "git revert HEAD", "git branch HEAD~1"],
      goal: ({ repo, before }) =>
        currentBranch(repo) === null &&
        headId(repo) === parentOf(before, headId(before)) &&
        repo.branches.main === before.branches.main,
      explain: "git checkout con un commit (en vez de una rama) te deja con la HEAD desacoplada: ves esa versión y main no se mueve. Se vuelve con git switch main.",
      hint: "git checkout <commit>: HEAD~1 es el anterior",
    }),
  },
  // ===== Integración: merge, conflictos y rebase =====
  {
    id: "m-que",
    topic: "merge",
    tier: 0,
    build: () => ({
      prompt: "¿Qué hace git merge?",
      answer: "Trae los commits de otra rama a la rama donde estás",
      wrong: ["Borra la otra rama", "Deshace el último commit", "Crea una rama nueva"],
      explain: "merge junta dos líneas de trabajo: suma a tu rama actual lo que se hizo en la otra.",
    }),
  },
  {
    id: "m-merge",
    topic: "merge",
    tier: 0,
    build: (n) => ({
      prompt: `El trabajo de ${n.b} está terminado. Estás en main: traé esos cambios.`,
      setup: ahead(n),
      solution: [`git merge ${n.b}`],
      wrong: ["git merge main", `git switch ${n.b}`, `git branch ${n.b}`],
      goal: ({ repo, before }) =>
        currentBranch(repo) === "main" && isAncestor(repo, before.branches[n.b], headId(repo)!),
      explain: "Parado en la rama que recibe (main), le decís a merge qué rama traer. Mirá cómo main alcanza a la otra.",
      hint: "git merge <rama que querés traer>",
    }),
  },
  {
    id: "m-donde",
    topic: "merge",
    tier: 0,
    build: (n) => ({
      prompt: `Querés llevar los cambios de ${n.b} a main. ¿En qué rama tenés que estar parado?`,
      answer: "En main, la que recibe los cambios",
      wrong: [`En ${n.b}, la que tiene los cambios`, "En cualquiera, da lo mismo", "En una rama nueva"],
      explain: "merge siempre trae hacia donde estás. Para sumar cosas a main: git switch main y después git merge.",
    }),
  },
  {
    id: "m-ff",
    topic: "merge",
    tier: 0,
    build: () => ({
      prompt: "Al fusionar, Git dice «Fast-forward». ¿Qué pasó?",
      answer: "main no tenía commits nuevos: sólo se adelantó hasta la otra rama",
      wrong: ["Hubo un conflicto", "Se borraron commits", "El merge quedó a medias"],
      explain: "Si tu rama no avanzó desde que nació la otra, no hay nada que mezclar: Git sólo mueve la etiqueta hacia adelante.",
    }),
  },
  {
    id: "m-merge-div",
    topic: "merge",
    tier: 0,
    build: (n) => ({
      prompt: `main y ${n.b} avanzaron cada una por su lado. Estás en main: fusioná ${n.b}.`,
      setup: diverged(n),
      solution: [`git merge ${n.b}`],
      wrong: ["git merge main", `git switch ${n.b}`, 'git commit -m "Merge"'],
      goal: ({ repo, before }) =>
        currentBranch(repo) === "main" && isAncestor(repo, before.branches[n.b], headId(repo)!),
      explain: "Como las dos ramas tenían commits propios, Git crea un commit de merge con dos padres que las une.",
      hint: "git merge <rama que querés traer>",
    }),
  },
  {
    id: "m-conflicto-que",
    topic: "merge",
    tier: 0,
    build: () => ({
      prompt: "¿Cuándo aparece un conflicto de merge?",
      answer: "Cuando las dos ramas cambiaron la misma parte del mismo archivo",
      wrong: ["Siempre que hay dos ramas", "Cuando el mensaje del commit es muy largo", "Cuando una rama tiene más commits que la otra"],
      explain: "Si los cambios tocan lugares distintos, Git los junta solo. Sólo te pregunta cuando se pisan: por ejemplo, dos analistas que editaron la misma medida.",
    }),
  },
  {
    id: "m-marcas",
    topic: "merge",
    tier: 0,
    build: () => ({
      prompt: "En un conflicto, ¿qué hay entre «<<<<<<< HEAD» y «=======»?",
      answer: "Tu versión: la de la rama donde estás parado",
      wrong: ["La versión de la otra rama", "La versión original, antes de las dos", "Código que Git borró"],
      explain: "Arriba del ======= está lo tuyo (HEAD); abajo, hasta el >>>>>>>, lo que viene de la otra rama.",
    }),
  },
  {
    id: "m-abort",
    topic: "merge",
    tier: 0,
    build: (n) => ({
      prompt: "El merge dio conflicto y no lo querés resolver ahora. Cancelalo y volvé a como estabas.",
      setup: conflicted(n),
      solution: ["git merge --abort"],
      wrong: ["git merge --undo", 'git commit -m "Listo"', `git restore ${n.f}`],
      goal: ({ repo }) => !repo.merging && isClean(repo),
      explain: "git merge --abort deshace el intento de merge: tu rama queda exactamente como antes de empezar.",
      hint: "git merge con la opción --abort",
    }),
  },
  {
    id: "m-status-conflicto",
    topic: "merge",
    tier: 1,
    build: (n) => ({
      prompt: "Hubo conflicto. ¿Qué archivos quedaron sin fusionar? Preguntale a Git.",
      setup: conflicted(n),
      solution: ["git status"],
      wrong: ["git merge --list", "git log", "git branch"],
      goal: ran("status"),
      explain: "En medio de un merge, git status lista las «rutas sin fusionar»: los archivos que tenés que resolver.",
      hint: "El comando de siempre para ver el estado",
    }),
  },
  {
    id: "m-resolver-add",
    topic: "merge",
    tier: 1,
    build: (n) => ({
      prompt: `Ya editaste ${n.f} y lo dejaste como tiene que quedar. Avisale a Git que el conflicto está resuelto.`,
      setup: [...conflicted(n), w(n.f, "version acordada")],
      solution: [`git add ${n.f}`],
      wrong: ["git merge --continue", `git merge ${n.b}`, `git resolve ${n.f}`],
      goal: ({ repo }) => !!repo.merging && repo.merging.conflicts.length === 0,
      explain: "Durante un merge, git add es la forma de decir «este archivo ya está resuelto».",
      hint: "git add <archivo>",
    }),
  },
  {
    id: "m-cerrar",
    topic: "merge",
    tier: 1,
    build: (n) => ({
      prompt: "El conflicto ya está resuelto y preparado. Cerrá el merge.",
      setup: [...conflicted(n), w(n.f, "version acordada"), `git add ${n.f}`],
      solution: [`git commit -m "Fusiona ${n.b}"`],
      wrong: [`git merge ${n.b}`, "git merge --abort", "git add ."],
      goal: ({ repo }) => !repo.merging && repo.commits[headId(repo)!].parents.length === 2,
      explain: "Un merge con conflictos se cierra con un commit. Ese commit queda con dos padres: uno por rama.",
      hint: 'git commit -m "mensaje"',
    }),
  },
  {
    id: "m-despues",
    topic: "merge",
    tier: 1,
    build: (n) => ({
      prompt: `Fusionaste ${n.b} en main. ¿Qué pasa con la rama ${n.b}?`,
      answer: "Sigue existiendo; si no hace falta, se borra con git branch -d",
      wrong: ["Se borra sola", "Queda vacía, sin commits", "Pasa a llamarse main"],
      explain: "merge no borra nada. La rama queda apuntando a su último commit hasta que la borres vos.",
    }),
  },
  {
    id: "m-ida-y-merge",
    topic: "merge",
    tier: 2,
    build: (n) => ({
      prompt: `Estás parado en ${n.b} y el trabajo está terminado. Llevalo a main.`,
      setup: [...diverged(n), `git switch ${n.b}`],
      solution: ["git switch main", `git merge ${n.b}`],
      wrong: ["git merge main", `git merge ${n.b}`, `git switch main && git merge main`],
      goal: ({ repo, before }) =>
        currentBranch(repo) === "main" && isAncestor(repo, before.branches[n.b], headId(repo)!),
      explain: "Primero te parás en la rama que recibe (main) y después traés la otra. Al revés, main no se entera.",
      hint: "Dos pasos: ir a main y fusionar la otra rama",
    }),
  },
  {
    id: "m-theirs",
    topic: "merge",
    tier: 2,
    build: (n) => ({
      prompt: `Conflicto en ${n.f}. Quedate con la versión que viene de ${n.b} y cerrá el merge.`,
      setup: conflicted(n),
      solution: [`git checkout --theirs ${n.f}`, `git add ${n.f}`, `git commit -m "Fusiona ${n.b}"`],
      wrong: [`git checkout --ours ${n.f} && git add ${n.f} && git commit -m "Fusiona ${n.b}"`, "git merge --abort", `git add ${n.f} && git commit -m "Fusiona ${n.b}"`],
      goal: ({ repo }) => {
        const head = repo.commits[headId(repo)!];
        return !repo.merging && head.parents.length === 2 && head.tree[n.f] === `version de ${n.b}`;
      },
      explain: "--theirs elige la versión de la rama que entra (--ours, la tuya). Después: git add para resolver y commit para cerrar.",
      hint: "checkout --theirs <archivo>, después add y commit",
    }),
  },

  {
    id: "m-rebase-que",
    topic: "merge",
    tier: 1,
    build: () => ({
      prompt: "¿Qué diferencia hay entre git merge y git rebase?",
      answer: "merge une las ramas con un commit; rebase vuelve a escribir tus commits arriba de la otra rama",
      wrong: ["Son dos nombres del mismo comando", "rebase borra la otra rama; merge la conserva", "merge sólo sirve en GitHub; rebase, en tu compu"],
      explain: "Los dos integran cambios. merge conserva la historia como fue; rebase la deja en línea recta, pero cambia tus commits: no se usa sobre lo que ya compartiste.",
    }),
  },
  {
    id: "m-rebase",
    topic: "merge",
    tier: 2,
    build: (n) => ({
      prompt: `Estás en ${n.b} y main avanzó. Apoyá tus commits arriba de main, para que el historial quede en línea recta.`,
      setup: [...diverged(n), `git switch ${n.b}`],
      solution: ["git rebase main"],
      wrong: ["git merge main", "git reset --hard main", "git switch main"],
      goal: ({ repo, before }) => {
        const head = headId(repo)!;
        return (
          currentBranch(repo) === n.b &&
          repo.commits[head].parents.length === 1 &&
          parentOf(repo, head) === before.branches.main &&
          headTree(repo)[n.g] === "version final"
        );
      },
      explain: "rebase copia tus commits uno por uno arriba de main. Mirá el árbol: ya no hay bifurcación, y tus commits tienen hash nuevo.",
      hint: "git rebase <rama sobre la que te apoyás>",
    }),
  },
  {
    id: "m-circuito",
    topic: "merge",
    tier: 2,
    build: (n) => ({
      prompt: `Misión completa: el cambio en ${n.f} tiene que pasar por una rama. Creá ${n.b}, guardalo ahí, volvé a main, fusionala y borrá la rama.`,
      setup: [...two(n), w(n.f, "version 2")],
      solution: [
        `git switch -c ${n.b}`,
        `git commit -am "Actualiza ${n.f}"`,
        "git switch main",
        `git merge ${n.b}`,
        `git branch -d ${n.b}`,
      ],
      wrong: [
        `git commit -am "Actualiza ${n.f}"`,
        `git switch -c ${n.b} && git commit -am "Actualiza ${n.f}" && git switch main`,
        `git switch -c ${n.b} && git commit -am "Actualiza ${n.f}" && git merge main`,
      ],
      goal: ({ repo, before, commands }) =>
        currentBranch(repo) === "main" &&
        !repo.branches[n.b] &&
        headTree(repo)[n.f] === "version 2" &&
        count(repo) === count(before) + 1 &&
        isClean(repo) &&
        // el mismo resultado sin pasar por la rama no vale
        commands.some((c) => c.sub === "merge"),
      explain: "El circuito de siempre: rama para el cambio, commit, vuelta a main, merge y limpieza. En equipo, el merge pasa a ser un pull request.",
      hint: "switch -c, commit -am, switch main, merge, branch -d",
    }),
  },

  // ===== Producción: viajar en el tiempo =====
  {
    id: "t-stash",
    topic: "tiempo",
    tier: 0,
    build: (n) => ({
      prompt: `Estás a mitad de un cambio en ${n.f} y te piden algo urgente. Guardá tus cambios a un costado, sin hacer commit.`,
      setup: dirty(n),
      solution: ["git stash"],
      wrong: [`git restore ${n.f}`, 'git commit -m "A medias"', "git branch guardado"],
      goal: ({ repo }) => repo.stash.length === 1 && isClean(repo),
      explain: "git stash guarda tus cambios sin terminar en un cajón aparte y deja la carpeta limpia para hacer otra cosa.",
      hint: "git stash",
    }),
  },
  {
    id: "t-stash-pop",
    topic: "tiempo",
    tier: 0,
    build: (n) => ({
      prompt: "Terminaste lo urgente. Recuperá los cambios que habías guardado en el stash.",
      setup: [...dirty(n), "git stash"],
      solution: ["git stash pop"],
      wrong: ["git stash", "git stash drop", "git stash list"],
      goal: ({ repo }) => paths(status(repo).unstaged).includes(n.f),
      explain: "git stash pop saca lo último que guardaste en el cajón y lo vuelve a poner en tu carpeta.",
      hint: "git stash pop",
    }),
  },
  {
    id: "t-stash-que",
    topic: "tiempo",
    tier: 0,
    build: () => ({
      prompt: "¿Qué hace git stash?",
      answer: "Guarda tus cambios sin terminar en un cajón temporal y limpia la carpeta",
      wrong: ["Borra los cambios para siempre", "Crea un commit con todo", "Sube los cambios a GitHub"],
      explain: "El stash es un cajón temporal: no es un commit ni aparece en el historial. Se recupera con git stash pop.",
    }),
  },
  {
    id: "t-revert",
    topic: "tiempo",
    tier: 0,
    build: (n) => ({
      prompt: "El último commit rompió algo y el equipo ya lo tiene. Deshacelo con un commit nuevo que lo invierta.",
      setup: three(n),
      solution: ["git revert HEAD"],
      wrong: ["git reset --hard HEAD~1", 'git commit --amend -m "Arreglo"', "git restore HEAD"],
      goal: ({ repo, before }) => {
        const old = headId(before)!;
        const undone = parentOf(before, old);
        return (
          count(repo) === count(before) + 1 &&
          isAncestor(repo, old, headId(repo)!) &&
          !!undone &&
          sameTree(headTree(repo), before.commits[undone].tree)
        );
      },
      explain: "git revert no borra nada: agrega un commit que hace lo contrario. El historial queda intacto para todos.",
      hint: "git revert <commit>: HEAD es el último",
    }),
  },
  {
    id: "t-revert-reset",
    topic: "tiempo",
    tier: 0,
    build: () => ({
      prompt: "¿Qué diferencia hay entre git revert y git reset?",
      answer: "revert agrega un commit que deshace; reset mueve la rama hacia atrás",
      wrong: ["Son dos nombres del mismo comando", "revert borra archivos; reset los crea", "reset agrega un commit; revert lo borra"],
      explain: "revert suma historial (seguro para lo compartido). reset reescribe el historial (sólo para lo que nadie más tiene).",
    }),
  },
  {
    id: "t-hard-peligro",
    topic: "tiempo",
    tier: 0,
    build: () => ({
      prompt: "¿Por qué git reset --hard es peligroso?",
      answer: "Borra los cambios sin guardar y no hay vuelta atrás",
      wrong: ["Porque borra el repositorio entero", "Porque sube todo a internet", "Porque cambia el nombre de las ramas"],
      explain: "--hard pisa tu carpeta y el staging con el commit elegido. Lo que no estaba en un commit, se pierde.",
    }),
  },
  {
    id: "t-reset-soft",
    topic: "tiempo",
    tier: 0,
    build: (n) => ({
      prompt: "Hiciste el último commit antes de tiempo. Deshacé el commit, pero dejá sus cambios preparados en el staging.",
      setup: three(n),
      solution: ["git reset --soft HEAD~1"],
      wrong: ["git reset --hard HEAD~1", "git reset HEAD~1", "git revert HEAD"],
      goal: ({ repo, before }) =>
        headId(repo) === parentOf(before, headId(before)) && paths(status(repo).staged).includes(n.f),
      explain: "--soft sólo mueve la rama un commit atrás. Los cambios de ese commit quedan en el staging, listos para rehacerlo.",
      hint: "git reset --soft <a qué commit volver>",
    }),
  },
  {
    id: "t-reset-hard",
    topic: "tiempo",
    tier: 0,
    build: (n) => ({
      prompt: "El último commit fue un desastre y nadie más lo vio. Eliminalo por completo, cambios incluidos.",
      setup: three(n),
      solution: ["git reset --hard HEAD~1"],
      wrong: ["git reset --soft HEAD~1", "git reset HEAD~1", "git revert HEAD"],
      goal: ({ repo, before }) => headId(repo) === parentOf(before, headId(before)) && isClean(repo),
      explain: "--hard vuelve la rama, el staging y la carpeta al commit elegido. El commit borrado desaparece del historial.",
      hint: "git reset --hard <a qué commit volver>",
    }),
  },
  {
    id: "t-head1",
    topic: "tiempo",
    tier: 0,
    build: () => ({
      prompt: "¿Qué significa HEAD~1?",
      answer: "El commit anterior al actual",
      wrong: ["El primer commit del repositorio", "La rama main", "El próximo commit que vas a hacer"],
      explain: "El ~ cuenta hacia atrás desde donde estás: HEAD~1 es el anterior, HEAD~2 el de antes, y así.",
    }),
  },
  {
    id: "t-reset-mixed",
    topic: "tiempo",
    tier: 1,
    build: (n) => ({
      prompt: "Deshacé el último commit dejando sus cambios en la carpeta, sin preparar.",
      setup: three(n),
      solution: ["git reset HEAD~1"],
      wrong: ["git reset --soft HEAD~1", "git reset --hard HEAD~1", "git revert HEAD"],
      goal: ({ repo, before }) =>
        headId(repo) === parentOf(before, headId(before)) &&
        status(repo).staged.length === 0 &&
        paths(status(repo).unstaged).includes(n.f),
      explain: "Sin opciones, reset mueve la rama y vacía el staging, pero no toca tus archivos (es el modo --mixed).",
      hint: "git reset <a qué commit volver>, sin opciones",
    }),
  },
  {
    id: "t-stash-list",
    topic: "tiempo",
    tier: 1,
    build: (n) => ({
      prompt: "¿Habías dejado algo guardado en el stash? Fijate qué hay.",
      setup: [...dirty(n), "git stash"],
      solution: ["git stash list"],
      wrong: ["git stash", "git stash show-all", "git log --stash"],
      goal: ran("stash", "list"),
      explain: "git stash list muestra todo lo que hay en el cajón. Lo más nuevo es stash@{0}.",
      hint: "git stash list",
    }),
  },
  {
    id: "t-compartido",
    topic: "tiempo",
    tier: 1,
    build: () => ({
      prompt: "Un commit que el equipo ya tiene está mal. ¿Qué conviene usar para deshacerlo?",
      answer: "git revert: no reescribe el historial de los demás",
      wrong: ["git reset --hard", "git commit --amend", "Borrar el repositorio y empezar de nuevo"],
      explain: "reset y amend cambian commits que otros ya tienen, y eso les rompe el historial. revert suma un commit y listo.",
    }),
  },
  {
    id: "t-stash-switch",
    topic: "tiempo",
    tier: 2,
    build: (n) => ({
      prompt: `Tenés cambios a medias en main y hay que mirar algo en ${n.b}. Guardalos a un costado y pasate a esa rama.`,
      setup: [
        ...two(n),
        `git switch -c ${n.b}`,
        w(n.f, `version de ${n.b}`),
        `git commit -am "Cambia ${n.f} en ${n.b}"`,
        "git switch main",
        w(n.f, "version 2 a medias"),
      ],
      solution: ["git stash", `git switch ${n.b}`],
      wrong: [`git switch ${n.b}`, `git restore ${n.f} && git switch ${n.b}`, `git stash pop && git switch ${n.b}`],
      goal: ({ repo }) => repo.stash.length === 1 && currentBranch(repo) === n.b,
      explain: "Git no te deja cambiar de rama si eso pisaría tus cambios. Con stash los apartás y después volvés por ellos.",
      hint: "Dos pasos: guardar en el stash y cambiar de rama",
    }),
  },
  {
    id: "t-revert-viejo",
    topic: "tiempo",
    tier: 2,
    build: (n) => ({
      prompt: `El commit que agregó ${n.g} (el anterior al último) fue un error. Revertí sólo ese.`,
      setup: three(n),
      solution: ["git revert HEAD~1"],
      wrong: ["git revert HEAD", "git reset --hard HEAD~1", "git reset --hard HEAD~2"],
      goal: ({ repo, before }) =>
        count(repo) === count(before) + 1 && !(n.g in headTree(repo)) && headTree(repo)[n.f] === "version 2",
      explain: "revert puede deshacer cualquier commit, no sólo el último: invierte ese cambio y deja en pie los de después.",
      hint: "git revert <commit>: HEAD~1 es el anterior al último",
    }),
  },
  {
    id: "t-cherry-que",
    topic: "tiempo",
    tier: 1,
    build: () => ({
      prompt: "¿Qué hace git cherry-pick?",
      answer: "Copia un commit puntual de otra rama a la rama donde estás",
      wrong: ["Trae todos los commits de otra rama", "Borra un commit del historial", "Elige qué archivos entran al staging"],
      explain: "cherry-pick toma el cambio de un solo commit y lo vuelve a aplicar donde estás parado, sin traer el resto de la rama.",
    }),
  },
  {
    id: "t-cherry",
    topic: "tiempo",
    tier: 2,
    build: (n) => ({
      prompt: `De la rama ${n.b} sólo necesitás su último commit (el que agrega ${n.h}). Copialo a main, sin traer el resto.`,
      setup: [
        ...two(n),
        `git switch -c ${n.b}`,
        w(n.f, "version 2"),
        `git commit -am "Cambia ${n.f}"`,
        w(n.h, "nuevo"),
        "git add .",
        `git commit -m "Agrega ${n.h}"`,
        "git switch main",
      ],
      solution: [`git cherry-pick ${n.b}`],
      wrong: [`git merge ${n.b}`, `git rebase ${n.b}`, `git switch ${n.b}`],
      goal: ({ repo, before }) =>
        currentBranch(repo) === "main" &&
        parentOf(repo, headId(repo)) === before.branches.main &&
        n.h in headTree(repo) &&
        headTree(repo)[n.f] === "version 1",
      explain: "El nombre de una rama apunta a su último commit, así que cherry-pick copia sólo ese. También sirve pasarle el hash.",
      hint: "git cherry-pick <commit o rama>",
    }),
  },

  // ===== Repositorio remoto: clone y remote =====
  {
    id: "x-remoto-que",
    topic: "remoto",
    tier: 0,
    build: () => ({
      prompt: "¿Qué es un repositorio remoto?",
      answer: "Una copia del repositorio en un servidor, como GitHub, que comparte todo el equipo",
      wrong: ["Una carpeta compartida de OneDrive", "Una copia de seguridad automática de tu compu", "Un repositorio que sólo se puede leer"],
      explain: "El remoto es el punto de encuentro: cada uno trabaja en su copia y sube ahí sus commits para que los demás los bajen.",
    }),
  },
  {
    id: "x-origin",
    topic: "remoto",
    tier: 0,
    build: () => ({
      prompt: "¿Qué es «origin»?",
      answer: "El nombre que Git le pone por defecto al remoto",
      wrong: ["La primera rama del proyecto", "El primer commit del historial", "El dueño del repositorio"],
      explain: "origin es sólo un apodo para la dirección del remoto, así no hay que escribir la URL entera en cada comando.",
    }),
  },
  {
    id: "x-clone",
    topic: "remoto",
    tier: 0,
    build: (n) => ({
      prompt: `El informe de ventas ya está en GitHub (${URL}). Bajate una copia completa a tu compu.`,
      setup: [...two(n), "publish", "unclone"],
      solution: [`git clone ${URL}`],
      wrong: ["git init", `git download ${URL}`, "git pull"],
      goal: ({ repo }) => repo.initialized && !!repo.branches.main,
      explain: "git clone baja el repositorio entero, con todo su historial, y lo deja conectado al remoto. Se hace una sola vez por compu.",
      hint: "git clone <url> (acá sirve cualquier dirección)",
    }),
  },
  {
    id: "x-clone-que",
    topic: "remoto",
    tier: 0,
    build: () => ({
      prompt: "¿Qué te trae git clone?",
      answer: "Todos los archivos y todo el historial del proyecto",
      wrong: ["Sólo la última versión de los archivos", "Sólo la rama main, sin historial", "Un acceso directo a la página de GitHub"],
      explain: "Tu copia es un repositorio completo: podés ver el historial y hacer commits sin conexión.",
    }),
  },
  {
    id: "x-remote-v",
    topic: "remoto",
    tier: 0,
    build: (n) => ({
      prompt: "¿A qué servidor está conectado este repositorio? Mostrá los remotos con su dirección.",
      setup: shared(n),
      solution: ["git remote -v"],
      wrong: ["git origin", "git status", "git log"],
      goal: ran("remote", "-v"),
      explain: "git remote lista los remotos; con -v muestra también la dirección de cada uno.",
      hint: "git remote con la opción -v",
    }),
  },
  {
    id: "x-origin-main",
    topic: "remoto",
    tier: 0,
    build: () => ({
      prompt: "En el historial aparece «origin/main». ¿Qué es?",
      answer: "Dónde estaba main en GitHub la última vez que consultaste",
      wrong: ["Una rama nueva que creaste vos", "La copia de seguridad de main", "El commit más viejo de main"],
      explain: "origin/main es el recuerdo que tu compu tiene del remoto. Se pone al día cuando hacés fetch, pull o push.",
    }),
  },
  {
    id: "x-remote-add",
    topic: "remoto",
    tier: 0,
    build: (n) => ({
      prompt: `Creaste el repositorio en tu compu y en GitHub hay uno vacío esperando (${URL}). Conectalos.`,
      setup: two(n),
      solution: [`git remote add origin ${URL}`],
      wrong: [`git clone ${URL}`, "git push", `git remote origin ${URL}`],
      goal: ({ repo }) => !!repo.remote,
      explain: "git remote add le dice a tu repositorio dónde queda el remoto y con qué nombre llamarlo. Después de esto ya podés hacer push.",
      hint: "git remote add origin <url>",
    }),
  },
  {
    id: "x-donde-quedan",
    topic: "remoto",
    tier: 0,
    build: () => ({
      prompt: "¿Dónde quedan tus commits hasta que hacés git push?",
      answer: "Sólo en tu compu",
      wrong: ["En GitHub, al instante", "En la compu de todo el equipo", "En el workspace de Power BI"],
      explain: "commit guarda en tu repositorio local. Nadie más ve ese trabajo hasta que lo subís con push.",
    }),
  },
  {
    id: "x-pbip-github",
    topic: "remoto",
    tier: 0,
    build: () => ({
      prompt: "¿Qué ve el equipo en GitHub cuando subís un proyecto .pbip?",
      answer: "Cada medida, tabla y página como archivo de texto, con su historial",
      wrong: ["Una captura de pantalla del informe", "Un único archivo .pbix para descargar", "Sólo los datos, sin las medidas"],
      explain: "Por eso sirve el formato proyecto: en GitHub se puede ver qué medida cambió, quién la cambió y cómo era antes.",
    }),
  },
  {
    id: "x-clone-origin",
    topic: "remoto",
    tier: 1,
    build: () => ({
      prompt: "Clonaste el repositorio. ¿Hace falta hacer git remote add origin?",
      answer: "No: clone ya deja origin configurado",
      wrong: ["Sí, siempre", "Sí, pero sólo la primera vez", "No, porque clone no usa remotos"],
      explain: "remote add se usa cuando el repositorio nació en tu compu (git init). Si lo clonaste, la conexión ya viene hecha.",
    }),
  },
  {
    id: "x-branch-r",
    topic: "remoto",
    tier: 1,
    build: (n) => ({
      prompt: "¿Qué ramas hay en GitHub? Listá las ramas remotas.",
      setup: [...shared(n), `teammate ${n.b} ${n.g} "version final" "Termina ${n.g}"`, "git fetch"],
      solution: ["git branch -r"],
      wrong: ["git branch", "git remote", "git log"],
      goal: ({ commands }) =>
        commands.some((c) => c.sub === "branch" && ["-r", "-a", "--remotes", "--all"].some((flag) => c.args.includes(flag))),
      explain: "git branch a secas lista sólo tus ramas. Con -r muestra las del remoto (origin/...) y con -a, todas.",
      hint: "git branch con la opción -r",
    }),
  },
  {
    id: "x-clone-switch",
    topic: "remoto",
    tier: 2,
    build: (n) => ({
      prompt: `Cloná el repositorio (${URL}) y pasate a la rama ${n.b}, que un compañero ya subió.`,
      setup: [
        ...two(n),
        `git switch -c ${n.b}`,
        w(n.g, "version final"),
        `git commit -am "Termina ${n.g}"`,
        "git switch main",
        "publish",
        "unclone",
      ],
      solution: [`git clone ${URL}`, `git switch ${n.b}`],
      wrong: [`git clone ${URL}`, `git init && git switch ${n.b}`, `git clone ${URL} && git branch ${n.b}`],
      goal: ({ repo }) => currentBranch(repo) === n.b && headId(repo) === remoteTip(repo, n.b),
      explain: "Al clonar quedás en main. Las demás ramas del remoto están como origin/...: al hacerles switch, Git te arma la copia local.",
      hint: "Dos pasos: clonar y cambiar de rama",
    }),
  },

  // ===== Subida a GitHub: push =====
  {
    id: "p-que",
    topic: "push",
    tier: 0,
    build: () => ({
      prompt: "¿Qué hace git push?",
      answer: "Sube tus commits al remoto",
      wrong: ["Baja los commits del equipo", "Pasa los cambios al staging", "Publica el informe en el servicio de Power BI"],
      explain: "push manda al remoto los commits de tu rama que todavía no están allá.",
    }),
  },
  {
    id: "p-push",
    topic: "push",
    tier: 0,
    build: (n) => ({
      prompt: "Tenés un commit que el equipo todavía no ve. Subilo a GitHub.",
      setup: unpushed(n),
      solution: ["git push"],
      wrong: ["git pull", "git upload", 'git commit -m "Subir"'],
      goal: ({ repo }) => remoteTip(repo, "main") === headId(repo),
      explain: "Con la rama ya enlazada al remoto alcanza con git push. Mirá cómo origin/main alcanza a tu main.",
      hint: "git push",
    }),
  },
  {
    id: "p-push-u",
    topic: "push",
    tier: 0,
    build: (n) => ({
      prompt: `Es la primera vez que subís la rama ${n.b}. Subila y dejala enlazada con GitHub.`,
      setup: featureLocal(n),
      solution: [`git push -u origin ${n.b}`],
      wrong: ["git push", "git push origin main", `git branch -u ${n.b}`],
      goal: ({ repo }) => remoteTip(repo, n.b) === repo.branches[n.b] && repo.upstream.includes(n.b),
      explain: "Una rama nueva no tiene par en el remoto. Con -u la subís y queda enlazada: de ahí en más alcanza con git push.",
      hint: "git push -u origin <rama>",
    }),
  },
  {
    id: "p-u",
    topic: "push",
    tier: 0,
    build: () => ({
      prompt: "¿Para qué sirve el -u en git push -u origin rama?",
      answer: "Enlaza tu rama con la del remoto: después alcanza con git push",
      wrong: ["Sube sólo los archivos que cambiaron", "Deshace el último push", "Avisa al equipo por mail"],
      explain: "-u (upstream) le dice a Git cuál es la rama del remoto que le corresponde a la tuya. Se usa una sola vez por rama.",
    }),
  },
  {
    id: "p-adelantada",
    topic: "push",
    tier: 0,
    build: () => ({
      prompt: "git status dice «Tu rama está adelantada a 'origin/main' por 2 commits». ¿Qué significa?",
      answer: "Tenés 2 commits que todavía no subiste",
      wrong: ["El equipo subió 2 commits que no tenés", "Hay 2 archivos sin guardar", "Hay 2 conflictos por resolver"],
      explain: "«Adelantada» = tenés commits de más respecto del remoto. Se arregla con git push.",
    }),
  },
  {
    id: "p-status",
    topic: "push",
    tier: 0,
    build: (n) => ({
      prompt: "¿Te quedó algún commit sin subir? Preguntale a Git.",
      setup: unpushed(n),
      solution: ["git status"],
      wrong: ["git remote -v", "git diff", "git push --check"],
      goal: ran("status"),
      explain: "Con un remoto conectado, git status también dice si tu rama está adelantada o atrasada respecto de origin.",
      hint: "El comando de siempre para ver el estado",
    }),
  },
  {
    id: "p-rechazado",
    topic: "push",
    tier: 0,
    build: () => ({
      prompt: "git push falla con «rechazado (primero hacé fetch)». ¿Por qué?",
      answer: "En GitHub hay commits que vos todavía no tenés",
      wrong: ["Se cortó la conexión a internet", "Tu commit no tiene mensaje", "La rama no existe en tu compu"],
      explain: "Alguien subió antes que vos. Git no pisa su trabajo: primero tenés que traerlo con git pull, y después volver a subir.",
    }),
  },
  {
    id: "p-force",
    topic: "push",
    tier: 0,
    build: () => ({
      prompt: "¿Por qué es peligroso git push --force en una rama compartida?",
      answer: "Pisa los commits que subieron tus compañeros",
      wrong: ["Porque borra tu repositorio local", "Porque sube también el cache.abf", "Porque cierra todos los pull requests"],
      explain: "--force reemplaza la rama del remoto por la tuya, sin mirar qué había. En main no se usa nunca.",
    }),
  },
  {
    id: "p-publicar",
    topic: "push",
    tier: 0,
    build: () => ({
      prompt: "Hacés git push de tu informe. ¿Se actualiza solo el informe publicado en el servicio de Power BI?",
      answer: "No: push sólo sube los archivos a GitHub",
      wrong: ["Sí, al instante", "Sí, pero tarda una hora", "Sí, si el mensaje del commit dice «publicar»"],
      explain: "Git guarda versiones; publicar es otro paso. Para eso se publica desde Desktop o se sincroniza el workspace de Fabric con la rama.",
    }),
  },
  {
    id: "p-que-sube",
    topic: "push",
    tier: 1,
    build: () => ({
      prompt: "Tenés cambios sin commitear y hacés git push. ¿Qué se sube?",
      answer: "Sólo lo que ya está guardado en commits",
      wrong: ["Todo lo que hay en la carpeta", "Lo que está en el staging", "Nada: push falla"],
      explain: "push sube commits, no archivos sueltos. Lo que no commiteaste sigue sólo en tu compu.",
    }),
  },
  {
    id: "p-delete",
    topic: "push",
    tier: 1,
    build: (n) => ({
      prompt: `La rama ${n.b} ya no hace falta. Borrala de GitHub.`,
      setup: [...featurePushed(n), "git switch main"],
      solution: [`git push origin --delete ${n.b}`],
      wrong: [`git push origin ${n.b}`, `git remote rm ${n.b}`, `git branch -d ${n.b}`],
      goal: ({ repo }) => !remoteTip(repo, n.b),
      explain: "git branch -d borra la rama en tu compu; para borrarla del remoto hace falta push con --delete.",
      hint: "git push origin --delete <rama>",
    }),
  },
  {
    id: "p-commit-push",
    topic: "push",
    tier: 2,
    build: (n) => ({
      prompt: `Modificaste ${n.f}. Guardalo y dejalo subido en GitHub.`,
      setup: [...shared(n), w(n.f, "version 2")],
      solution: [`git commit -am "Actualiza ${n.f}"`, "git push"],
      wrong: ["git push", `git commit -am "Actualiza ${n.f}"`, `git push && git commit -am "Actualiza ${n.f}"`],
      goal: ({ repo, before }) =>
        remoteTip(repo, "main") === headId(repo) && count(repo) === count(before) + 1 && isClean(repo),
      explain: "Primero el commit (push no sube cambios sueltos) y después el push.",
      hint: "Dos pasos: guardar y subir",
    }),
  },
  {
    id: "p-rechazo-flujo",
    topic: "push",
    tier: 2,
    build: (n) => ({
      prompt: "Tu push fue rechazado: un compañero subió antes que vos. Traé sus cambios y volvé a subir.",
      setup: raced(n),
      solution: ["git pull", "git push"],
      wrong: ["git push --force", "git push", "git pull"],
      goal: ({ repo, before }) => {
        const theirs = remoteTip(before, "main")!;
        const head = headId(repo)!;
        return remoteTip(repo, "main") === head && isAncestor(repo, theirs, head);
      },
      explain: "pull integra lo del compañero con lo tuyo y recién ahí el push entra. Con --force habrías borrado su commit.",
      hint: "Dos pasos: bajar y volver a subir",
    }),
  },

  // ===== Novedades del equipo: fetch y pull =====
  {
    id: "l-que",
    topic: "pull",
    tier: 0,
    build: () => ({
      prompt: "¿Qué hace git pull?",
      answer: "Baja los commits del remoto y los integra en tu rama",
      wrong: ["Sube tus commits al remoto", "Borra tus cambios locales", "Crea una rama nueva"],
      explain: "pull es fetch (bajar las novedades) más merge (integrarlas en la rama donde estás).",
    }),
  },
  {
    id: "l-pull",
    topic: "pull",
    tier: 0,
    build: (n) => ({
      prompt: "Un compañero subió cambios a main. Traelos a tu compu.",
      setup: teamAhead(n),
      solution: ["git pull"],
      wrong: ["git fetch", "git push", `git clone ${URL}`],
      goal: ({ repo }) => headId(repo) === remoteTip(repo, "main"),
      explain: "git pull baja los commits nuevos y adelanta tu main. Mirá el árbol: apareció el commit de tu compañero.",
      hint: "git pull",
    }),
  },
  {
    id: "l-fetch-pull",
    topic: "pull",
    tier: 0,
    build: () => ({
      prompt: "¿Qué diferencia hay entre git fetch y git pull?",
      answer: "fetch sólo baja las novedades; pull además las integra en tu rama",
      wrong: ["Son dos nombres del mismo comando", "fetch sube y pull baja", "pull sólo funciona en main"],
      explain: "Con fetch mirás qué hay de nuevo sin tocar tu trabajo (se actualiza origin/main). pull da un paso más y lo mezcla con lo tuyo.",
    }),
  },
  {
    id: "l-fetch",
    topic: "pull",
    tier: 0,
    build: (n) => ({
      prompt: "Querés enterarte de qué subió el equipo, pero sin tocar tu rama todavía. Bajá las novedades.",
      setup: teamAhead(n),
      solution: ["git fetch"],
      wrong: ["git pull", "git status", "git log origin/main"],
      goal: ({ repo, before }) => repo.tracking.main === remoteTip(repo, "main") && headId(repo) === headId(before),
      explain: "fetch actualiza origin/main y deja tu main quieta. Después podés mirar con git log o git status antes de integrar.",
      hint: "git fetch",
    }),
  },
  {
    id: "l-detras",
    topic: "pull",
    tier: 0,
    build: () => ({
      prompt: "git status dice «Tu rama está detrás de 'origin/main' por 3 commits». ¿Qué hacés?",
      answer: "git pull, para traer esos commits",
      wrong: ["git push, para subirlos", "git commit, para guardarlos", "git init, para empezar de nuevo"],
      explain: "«Detrás» = el remoto tiene commits que a vos te faltan. Se arregla bajándolos.",
    }),
  },
  {
    id: "l-cuando",
    topic: "pull",
    tier: 0,
    build: () => ({
      prompt: "¿Cuándo conviene hacer git pull?",
      answer: "Antes de empezar a trabajar, para arrancar con lo último",
      wrong: ["Sólo cuando aparece un conflicto", "Una vez por mes", "Nunca: pisa tu trabajo"],
      explain: "Cuanto más viejo es tu punto de partida, más chances de conflicto. Arrancar el día con pull ahorra dolores de cabeza.",
    }),
  },
  {
    id: "l-status",
    topic: "pull",
    tier: 0,
    build: (n) => ({
      prompt: "Ya hiciste fetch. ¿Cuántos commits te faltan bajar? Preguntale a Git.",
      setup: [...teamAhead(n), "git fetch"],
      solution: ["git status"],
      wrong: ["git remote -v", "git fetch", "git branch"],
      goal: ran("status"),
      explain: "Después de un fetch, git status compara tu rama con origin/main y dice cuántos commits te llevan de ventaja.",
      hint: "El comando de siempre para ver el estado",
    }),
  },
  {
    id: "l-conflicto",
    topic: "pull",
    tier: 0,
    build: () => ({
      prompt: "Hacés git pull y un compañero había cambiado la misma medida que vos. ¿Qué pasa?",
      answer: "Aparece un conflicto de merge, igual que entre dos ramas",
      wrong: ["Git se queda con tu versión", "Git se queda con la del compañero", "Se borra la medida"],
      explain: "pull termina en un merge, así que se resuelve igual: elegís cómo queda el archivo, git add y git commit.",
    }),
  },
  {
    id: "l-desktop",
    topic: "pull",
    tier: 0,
    build: () => ({
      prompt: "Hiciste git pull con el informe abierto en Power BI Desktop. ¿Qué conviene hacer?",
      answer: "Cerrarlo y volver a abrirlo: Desktop no ve los cambios solo",
      wrong: ["Nada: se actualiza solo", "Apretar «Actualizar datos»", "Hacer git push"],
      explain: "Desktop lee los archivos al abrir. Si seguís con la versión vieja en pantalla y guardás, pisás lo que acabás de bajar.",
    }),
  },
  {
    id: "l-origin-viejo",
    topic: "pull",
    tier: 1,
    build: () => ({
      prompt: "¿origin/main se actualiza solo cuando alguien sube algo a GitHub?",
      answer: "No: se actualiza cuando hacés fetch o pull",
      wrong: ["Sí, en el momento", "Sí, una vez por día", "No se actualiza nunca"],
      explain: "Git no habla con el remoto por su cuenta. Hasta que no hacés fetch, lo que ves es una foto vieja.",
    }),
  },
  {
    id: "l-switch-remota",
    topic: "pull",
    tier: 1,
    build: (n) => ({
      prompt: `Un compañero subió la rama ${n.b}. Pasate a ella para revisar su trabajo.`,
      setup: [...shared(n), `teammate ${n.b} ${n.g} "version final" "Termina ${n.g}"`, "git fetch"],
      solution: [`git switch ${n.b}`],
      wrong: ["git branch -r", "git pull", `git merge origin/${n.b}`],
      goal: ({ repo }) => currentBranch(repo) === n.b,
      explain: "Si la rama existe en el remoto, git switch te arma la copia local y la deja enlazada.",
      hint: "git switch <rama>",
    }),
  },
  {
    id: "l-pull-rebase",
    topic: "pull",
    tier: 1,
    build: (n) => ({
      prompt: "Vos y un compañero commitearon en main. Traé lo suyo, pero dejando el historial en línea recta.",
      setup: raced(n),
      solution: ["git pull --rebase"],
      wrong: ["git pull", "git fetch", "git push --force"],
      goal: ({ repo, before }) => {
        const head = headId(repo)!;
        return (
          repo.commits[head].parents.length === 1 &&
          parentOf(repo, head) === remoteTip(before, "main") &&
          headTree(repo)[n.f] === "version 2"
        );
      },
      explain: "Con --rebase, pull apoya tu commit arriba de lo que bajó en vez de crear un commit de merge.",
      hint: "git pull con la opción --rebase",
    }),
  },
  {
    id: "l-fetch-merge",
    topic: "pull",
    tier: 2,
    build: (n) => ({
      prompt: "Bajá las novedades de main, y después integralas en tu rama. En dos pasos, sin usar pull.",
      setup: teamAhead(n),
      solution: ["git fetch", "git merge origin/main"],
      wrong: ["git fetch", "git merge origin/main", "git fetch && git merge main"],
      goal: ({ repo }) => headId(repo) === remoteTip(repo, "main"),
      explain: "Esto es exactamente lo que hace pull por dentro: fetch trae, merge integra.",
      hint: "git fetch, y después git merge origin/main",
    }),
  },
  {
    id: "l-pull-conflicto",
    topic: "pull",
    tier: 2,
    build: (n) => ({
      prompt: `Tu compañero y vos cambiaron ${n.f}. Traé lo suyo, quedate con su versión y cerrá el merge.`,
      setup: [
        ...shared(n),
        `teammate main ${n.f} "version del equipo" "Cambia ${n.f}"`,
        w(n.f, "version mia"),
        `git commit -am "Cambia ${n.f}"`,
      ],
      solution: ["git pull", `git checkout --theirs ${n.f}`, `git add ${n.f}`, 'git commit -m "Integra cambios del equipo"'],
      wrong: [
        "git push --force",
        "git pull",
        `git pull && git checkout --ours ${n.f} && git add ${n.f} && git commit -m "Integra cambios del equipo"`,
      ],
      goal: ({ repo }) => {
        const head = repo.commits[headId(repo)!];
        return !repo.merging && head.parents.length === 2 && head.tree[n.f] === "version del equipo";
      },
      explain: "El conflicto de un pull se resuelve como cualquier otro: elegir versión (--theirs es la que entra), git add y commit.",
      hint: "pull, checkout --theirs <archivo>, add, commit",
    }),
  },

  // ===== Pull request: el circuito de trabajo en equipo =====
  {
    id: "q-que",
    topic: "pr",
    tier: 0,
    build: () => ({
      prompt: "¿Qué es un pull request?",
      answer: "Un pedido para que revisen tu rama y la fusionen en main",
      wrong: ["Un comando para bajar cambios", "Una copia de seguridad de la rama", "Un mensaje de error de GitHub"],
      explain: "El pull request (PR) es una página de GitHub donde se ve qué cambia tu rama, se comenta y, cuando está aprobado, se fusiona.",
    }),
  },
  {
    id: "q-para-que",
    topic: "pr",
    tier: 0,
    build: () => ({
      prompt: "¿Para qué sirve que otra persona revise tu pull request?",
      answer: "Para encontrar errores antes de que lleguen a main",
      wrong: ["Para que el commit pese menos", "Para que Git corra más rápido", "Para no tener que hacer push"],
      explain: "Cuatro ojos ven más que dos: una medida mal calculada se frena en la revisión y no en la reunión de gerencia.",
    }),
  },
  {
    id: "q-orden",
    topic: "pr",
    tier: 0,
    build: () => ({
      prompt: "¿Cuál es el orden del circuito de trabajo en equipo?",
      answer: "Rama → commits → push → pull request → merge",
      wrong: ["Push → rama → merge → commits → pull request", "Pull request → rama → commits → push → merge", "Rama → merge → commits → pull request → push"],
      explain: "Trabajás en tu rama, la subís, pedís revisión con el PR y recién al final se fusiona en main.",
    }),
  },
  {
    id: "q-push-antes",
    topic: "pr",
    tier: 0,
    build: (n) => ({
      prompt: `Terminaste la rama ${n.b} y querés abrir un pull request. ¿Qué hace falta primero?`,
      setup: featureLocal(n),
      solution: [`git push -u origin ${n.b}`],
      wrong: ["gh pr merge", "git switch main", "git merge main"],
      goal: ({ repo }) => remoteTip(repo, n.b) === repo.branches[n.b],
      explain: "GitHub sólo puede armar un pull request con ramas que ya están en el remoto: primero hay que subirla.",
      hint: "git push -u origin <rama>",
    }),
  },
  {
    id: "q-create",
    topic: "pr",
    tier: 0,
    build: (n) => ({
      prompt: `La rama ${n.b} ya está en GitHub. Abrí el pull request desde la consola.`,
      setup: featurePushed(n),
      solution: ["gh pr create"],
      wrong: ["gh pr merge", "git pull request", `git merge ${n.b}`],
      goal: ({ repo }) => repo.remote?.prs.length === 1,
      explain: "gh es la consola de GitHub. En la web es lo mismo que el botón «Compare & pull request» que aparece al subir una rama.",
      hint: "gh pr create",
    }),
  },
  {
    id: "q-main-directo",
    topic: "pr",
    tier: 0,
    build: () => ({
      prompt: "¿Por qué no conviene commitear directo en main?",
      answer: "Porque main es lo que usa todo el equipo: lo que entra tiene que estar revisado",
      wrong: ["Porque main no acepta commits", "Porque main se borra todas las noches", "Porque en main no funciona git push"],
      explain: "main es la versión «buena» del informe. Los cambios entran por pull request para que nadie rompa lo que usan los demás.",
    }),
  },
  {
    id: "q-despues",
    topic: "pr",
    tier: 0,
    build: (n) => ({
      prompt: "Fusionaron tu pull request en GitHub. Dejá tu main al día.",
      setup: [...featurePushed(n), "gh pr create", "gh pr merge", "git switch main"],
      solution: ["git pull"],
      wrong: [`git merge ${n.b}`, "git push", "git fetch"],
      goal: ({ repo }) => headId(repo) === remoteTip(repo, "main"),
      explain: "La fusión pasó en GitHub, no en tu compu. Tu main recién se entera cuando hacés pull.",
      hint: "git pull",
    }),
  },
  {
    id: "q-fabric",
    topic: "pr",
    tier: 0,
    build: () => ({
      prompt: "En Fabric, ¿qué hace conectar un workspace a Git?",
      answer: "Sincroniza los informes y modelos del workspace con una rama del repositorio",
      wrong: ["Hace una copia de seguridad diaria", "Publica el informe en la web", "Convierte los .pbix en planillas de Excel"],
      explain: "Cada workspace se conecta a una rama y una carpeta. Lo que está en la rama y lo que está en el workspace se pueden poner al día en los dos sentidos.",
    }),
  },
  {
    id: "q-fabric-updates",
    topic: "pr",
    tier: 0,
    build: () => ({
      prompt: "En el panel de control de código fuente de Fabric aparece «Actualizaciones». ¿Qué significa?",
      answer: "La rama tiene commits que el workspace todavía no recibió",
      wrong: ["Hay que refrescar los datos del modelo", "Venció la licencia", "Hay usuarios nuevos en el workspace"],
      explain: "Es el equivalente a estar «detrás» del remoto: con «Actualizar todo» el workspace trae lo último de la rama.",
    }),
  },
  {
    id: "q-fabric-commit",
    topic: "pr",
    tier: 1,
    build: () => ({
      prompt: "Editaste una medida directo en el workspace de Fabric. ¿Cómo llega ese cambio a Git?",
      answer: "Con «Confirmar», en el panel de control de código fuente",
      wrong: ["Sola, al guardar el informe", "Con git pull desde tu compu", "No se puede: hay que rehacerla en Desktop"],
      explain: "El panel muestra el cambio como pendiente; al confirmarlo se crea un commit en la rama conectada. Desde tu compu lo bajás con pull.",
    }),
  },
  {
    id: "q-merge",
    topic: "pr",
    tier: 1,
    build: (n) => ({
      prompt: "Ya aprobaron tu pull request. Fusionalo.",
      setup: [...featurePushed(n), "gh pr create"],
      solution: ["gh pr merge"],
      wrong: ["gh pr create", "git push", `git merge ${n.b}`],
      goal: ({ repo }) => repo.remote?.prs[0]?.merged === true,
      explain: "La fusión pasa en GitHub: main del remoto recibe un commit de merge. En la web es el botón «Merge pull request».",
      hint: "gh pr merge",
    }),
  },
  {
    id: "q-limpiar",
    topic: "pr",
    tier: 1,
    build: (n) => ({
      prompt: `El pull request ya está fusionado y tu main al día. Borrá tu rama local ${n.b}.`,
      setup: [...featurePushed(n), "gh pr create", "gh pr merge", "git switch main", "git pull"],
      solution: [`git branch -d ${n.b}`],
      wrong: ["git branch -d main", "gh pr merge", "git push"],
      goal: ({ repo }) => !repo.branches[n.b],
      explain: "Una rama fusionada ya cumplió su función. Borrarla mantiene ordenado el repositorio; sus commits siguen en main.",
      hint: "git branch -d <rama>",
    }),
  },
  {
    id: "q-vieja",
    topic: "pr",
    tier: 1,
    build: () => ({
      prompt: "Mientras trabajabas en tu rama, main avanzó. ¿Qué conviene hacer antes de pedir la fusión?",
      answer: "Traer main a tu rama y volver a subirla",
      wrong: ["Borrar la rama y empezar de nuevo", "Hacer git push --force sobre main", "Nada: GitHub lo arregla solo"],
      explain: "Así los conflictos (si hay) los resolvés vos en tu rama, y el pull request entra limpio.",
    }),
  },
  {
    id: "q-actualizar-rama",
    topic: "pr",
    tier: 2,
    build: (n) => ({
      prompt: `main avanzó en GitHub mientras trabajabas en ${n.b}. Traé main a tu rama y subila.`,
      setup: [...featureLocal(n), `teammate main ${n.h} "nuevo" "Agrega ${n.h}"`],
      solution: ["git pull origin main", `git push -u origin ${n.b}`],
      wrong: [`git push -u origin ${n.b}`, "git pull origin main", "git switch main && git pull"],
      goal: ({ repo }) => {
        const head = headId(repo)!;
        return isAncestor(repo, remoteTip(repo, "main")!, head) && remoteTip(repo, n.b) === head;
      },
      explain: "git pull origin main trae main del remoto y lo fusiona en la rama donde estás. Después subís la rama ya actualizada.",
      hint: "git pull origin main, y después push -u de tu rama",
    }),
  },
  {
    id: "q-circuito",
    topic: "pr",
    tier: 2,
    build: (n) => ({
      prompt: `Misión completa: el cambio en ${n.f} tiene que entrar por pull request. Rama ${n.b}, commit, subida, pull request, fusión, y tu main al día.`,
      setup: [...shared(n), w(n.f, "version 2")],
      solution: [
        `git switch -c ${n.b}`,
        `git commit -am "Actualiza ${n.f}"`,
        `git push -u origin ${n.b}`,
        "gh pr create",
        "gh pr merge",
        "git switch main",
        "git pull",
      ],
      wrong: [
        `git commit -am "Actualiza ${n.f}" && git push`,
        `git switch -c ${n.b} && git commit -am "Actualiza ${n.f}" && git push -u origin ${n.b} && gh pr create`,
        `git switch -c ${n.b} && git commit -am "Actualiza ${n.f}" && git push -u origin ${n.b} && gh pr create && gh pr merge && git switch main`,
      ],
      goal: ({ repo }) =>
        currentBranch(repo) === "main" &&
        repo.remote?.prs[0]?.merged === true &&
        headId(repo) === remoteTip(repo, "main") &&
        headTree(repo)[n.f] === "version 2" &&
        isClean(repo),
      explain: "Este es el circuito de todos los días con un informe compartido: nada entra a main sin rama, subida, revisión y fusión.",
      hint: "switch -c, commit -am, push -u, gh pr create, gh pr merge, switch main, pull",
    }),
  },
];

// ------------------------------------------------------------- generación

// Archivos de un proyecto .pbip y pedidos típicos del negocio.
const FILES = ["Medidas.tmdl", "Ventas.tmdl", "Calendario.tmdl", "Clientes.tmdl", "Productos.tmdl", "tema.json", "paginas.json", "relaciones.tmdl"];
const BRANCHES = ["medida-margen", "pagina-resumen", "tema-corporativo", "fix-iva", "kpi-cobertura", "rls-sucursal", "calendario-fiscal"];

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function randomNames(): Names {
  const [f, g, h] = shuffled(FILES);
  const [b, b2] = shuffled(BRANCHES);
  return { f, g, h, b, b2 };
}

let serial = 0;

function instantiate(template: Template, level: number, names: Names = randomNames()): Exercise {
  const def = template.build(names);
  const base = {
    id: `${template.id}-${Date.now()}-${serial++}`,
    templateId: template.id,
    topic: template.topic,
    tier: template.tier,
    level,
    prompt: def.prompt,
    explain: def.explain,
    wrong: def.wrong,
  };
  if ("answer" in def) return { ...base, kind: "concept", solution: [def.answer], setup: [] };
  return { ...base, kind: "command", solution: def.solution, hint: def.hint, setup: def.setup, goal: def.goal };
}

/**
 * Desafíos de un tema para el nivel del sector: entran los de ese nivel y
 * los anteriores, con más peso para los del nivel actual. No se repiten
 * dentro de la misma tanda.
 */
export function buildExercises(topic: TopicKey, level: number, size: number, exclude: string[] = []): Exercise[] {
  const pool = TEMPLATES.filter((t) => t.topic === topic && t.tier <= level && !exclude.includes(t.id));
  const weighted = pool
    .map((template) => ({ template, order: Math.random() * (template.tier === level ? 3 : 1) }))
    .sort((a, b) => b.order - a.order);
  return weighted.slice(0, size).map(({ template }) => instantiate(template, level));
}

/** Vuelve a armar un desafío guardado en el repaso; undefined si ya no existe. */
export function exerciseFromTemplate(templateId: string, level: number): Exercise | undefined {
  const template = TEMPLATES.find((t) => t.id === templateId);
  return template && { ...instantiate(template, level), review: true };
}

export function topicOfTemplate(templateId: string): TopicKey | undefined {
  return TEMPLATES.find((t) => t.id === templateId)?.topic;
}

/** Se responde eligiendo (conceptos y nivel Pasante) o escribiendo el comando. */
export function answerMode(exercise: Exercise): "choice" | "terminal" {
  return exercise.kind === "concept" || exercise.level === 0 ? "choice" : "terminal";
}

/** Las opciones para elegir: la respuesta modelo mezclada con las incorrectas. */
export function choicesOf(exercise: Exercise): string[] {
  return shuffled([answerText(exercise), ...exercise.wrong.slice(0, 3)]);
}

/** La respuesta modelo en una sola línea (los pasos, unidos con &&). */
export function answerText(exercise: Exercise): string {
  return exercise.solution.join(" && ");
}

/** Para el control de contenido (scripts/check-challenges.ts). */
export function allExercises(): Exercise[] {
  const names: Names = { f: "Medidas.tmdl", g: "Ventas.tmdl", h: "Calendario.tmdl", b: "medida-margen", b2: "tema-corporativo" };
  return TEMPLATES.map((template) => instantiate(template, template.tier, names));
}
