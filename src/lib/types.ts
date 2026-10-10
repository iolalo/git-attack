export type TopicKey =
  | "inicio"
  | "guardar"
  | "historial"
  | "deshacer"
  | "ramas"
  | "merge"
  | "tiempo"
  | "remoto"
  | "push"
  | "pull"
  | "pr";

export const TOPIC_ORDER: TopicKey[] = [
  "inicio",
  "guardar",
  "historial",
  "deshacer",
  "ramas",
  "merge",
  "tiempo",
  "remoto",
  "push",
  "pull",
  "pr",
];

export interface TopicMeta {
  key: TopicKey;
  label: string;
  /** Los comandos que se practican, para el subtítulo. */
  commands: string;
  emoji: string;
}

export const TOPICS: Record<TopicKey, TopicMeta> = {
  inicio: { key: "inicio", label: "Primeros pasos", commands: "init · status", emoji: "🛎️" },
  guardar: { key: "guardar", label: "Guardar cambios", commands: "add · commit", emoji: "💾" },
  historial: { key: "historial", label: "Historial", commands: "log · diff · show", emoji: "🗄️" },
  deshacer: { key: "deshacer", label: "Deshacer", commands: "restore · amend", emoji: "☕" },
  ramas: { key: "ramas", label: "Ramas", commands: "branch · switch", emoji: "🌿" },
  merge: { key: "merge", label: "Merge y conflictos", commands: "merge · rebase", emoji: "🤝" },
  tiempo: { key: "tiempo", label: "Viajar en el tiempo", commands: "reset · revert · stash", emoji: "⏳" },
  remoto: { key: "remoto", label: "El remoto", commands: "clone · remote", emoji: "☁️" },
  push: { key: "push", label: "Subir cambios", commands: "push", emoji: "⬆️" },
  pull: { key: "pull", label: "Bajar cambios", commands: "fetch · pull", emoji: "⬇️" },
  pr: { key: "pr", label: "Pull requests", commands: "gh pr · Fabric", emoji: "🔍" },
};

// El nivel de cada sector define cómo respondés: de Pasante elegís entre
// opciones; de Junior escribís el comando con una pista; de Senior, sin red.
export const LEVEL_LABELS = ["Pasante", "Junior", "Senior"] as const;
export const MAX_LEVEL = LEVEL_LABELS.length - 1;

export interface AnswerResult {
  exerciseId: string;
  /** Desafío del que salió (ver challenges.ts): es lo que vuelve en el repaso. */
  templateId: string;
  topic: TopicKey;
  correct: boolean;
  timeMs: number;
  /** Pelea final: el jefe propuso algo mal y lo frenaste ("caught") o lo dejaste pasar ("fooled"). */
  scam?: "caught" | "fooled";
}

export interface TopicBreakdown {
  correct: number;
  total: number;
  avgMs: number;
}

export interface SessionRecord {
  id: string;
  dateISO: string;
  durationMs: number;
  /** Sector donde se jugó; ausente en el repaso rápido. */
  roomId?: string;
  results: AnswerResult[];
  overallAccuracy: number;
  overallAvgMs: number;
  topicBreakdown: Partial<Record<TopicKey, TopicBreakdown>>;
  /** Ascenso conseguido en el sector. */
  levelChange?: { from: number; to: number };
}

export interface StreakState {
  count: number;
  lastDateISO: string | null;
}

export interface ProgressData {
  version: 1;
  createdAtISO: string;
  /** Nivel de cada sector (por id): todos arrancan de Pasante. */
  roomLevels: Record<string, number>;
  /** Veces que le ganaste al jefe de cada sector (por id): abre el sector siguiente. */
  bossesDefeated: Record<string, number>;
  /** Personaje elegido (id de HEROES); sin elegir hasta pasar por la pantalla de selección. */
  heroId?: string;
  /** Desafíos errados que todavía no resolviste bien (los más viejos primero). */
  review?: string[];
  /** Escenarios cuya mini lección ya viste (por id). */
  lessonsSeen?: string[];
  /** Hasta qué sector ya viste abrirse la puerta (índice de ROOMS). */
  unlocksSeen?: number;
  history: SessionRecord[];
  streak: StreakState;
}
