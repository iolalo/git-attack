import { Exercise, buildExercises, exerciseFromTemplate, topicOfTemplate } from "./challenges";
import { ROOMS, RoomMeta, roomOfTopic } from "./rooms";
import {
  AnswerResult,
  MAX_LEVEL,
  ProgressData,
  SessionRecord,
  TOPIC_ORDER,
  TopicBreakdown,
  TopicKey,
} from "./types";

const STORAGE_KEY = "git-attack:v1";
const MAX_HISTORY = 200;
// Repaso: cuántos desafíos errados se guardan y cuántos vuelven por sesión.
const MAX_REVIEW = 30;
const REVIEW_PER_ROOM_SESSION = 2;
const REVIEW_PER_MIXED_SESSION = 4;
const MIXED_SIZE = 6;

function defaultProgress(): ProgressData {
  return {
    version: 1,
    createdAtISO: new Date().toISOString(),
    roomLevels: {},
    bossesDefeated: {},
    history: [],
    streak: { count: 0, lastDateISO: null },
  };
}

// Instantánea compartida en memoria + mini pub-sub, para poder exponer el
// progreso vía useSyncExternalStore (en vez de leer localStorage y hacer
// setState dentro de un useEffect en cada pantalla).
let cachedProgress: ProgressData | null = null;
const SERVER_SNAPSHOT = defaultProgress();
type Listener = () => void;
const listeners = new Set<Listener>();

function emitChange() {
  for (const listener of listeners) listener();
}

export function subscribeProgress(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function todayISO(): string {
  return new Date().toLocaleDateString("en-CA");
}

function isConsecutiveDay(prevISO: string, currentISO: string): boolean {
  const prev = new Date(prevISO + "T00:00:00");
  const current = new Date(currentISO + "T00:00:00");
  const diffDays = Math.round((current.getTime() - prev.getTime()) / 86400000);
  return diffDays === 1;
}

function loadFromLocalStorage(): ProgressData {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProgress();
    const parsed = JSON.parse(raw) as ProgressData;
    if (!parsed.version || !parsed.history) return defaultProgress();
    if (!parsed.roomLevels) parsed.roomLevels = {};
    if (!parsed.bossesDefeated) parsed.bossesDefeated = {};
    return parsed;
  } catch {
    return defaultProgress();
  }
}

/** Snapshot estable para useSyncExternalStore (y para lectura directa). */
export function getProgress(): ProgressData {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  if (!cachedProgress) cachedProgress = loadFromLocalStorage();
  return cachedProgress;
}

export function getServerProgressSnapshot(): ProgressData {
  return SERVER_SNAPSHOT;
}

function saveProgress(data: ProgressData) {
  cachedProgress = data;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // almacenamiento lleno o no disponible: se ignora silenciosamente, no es crítico
    }
  }
  emitChange();
}

export function resetProgress() {
  saveProgress(defaultProgress());
}

/** Nivel de un sector puntual: todos arrancan de Pasante (0). */
export function roomLevel(progress: ProgressData, roomId: string): number {
  return Math.min(MAX_LEVEL, progress.roomLevels[roomId] ?? 0);
}

/** ¿Ya le ganaste alguna vez al jefe de este sector? */
export function isBossDefeated(progress: ProgressData, roomId: string): boolean {
  return (progress.bossesDefeated[roomId] ?? 0) > 0;
}

/** Cada sector abre recién cuando le ganaste al jefe del anterior. */
export function isRoomLocked(progress: ProgressData, roomIndex: number): boolean {
  return roomIndex > 0 && !isBossDefeated(progress, ROOMS[roomIndex - 1].id);
}

/** El sector más avanzado que ya tiene la puerta abierta. */
export function frontierIndex(progress: ProgressData): number {
  let index = 0;
  while (index < ROOMS.length - 1 && !isRoomLocked(progress, index + 1)) index++;
  return index;
}

export function bossesBeaten(progress: ProgressData): number {
  return ROOMS.filter((room) => isBossDefeated(progress, room.id)).length;
}

/** Último sector donde jugaste, para volver al pasillo parado en su puerta. */
export function lastRoomIndex(progress: ProgressData): number {
  const last = progress.history.findLast((session) => session.roomId);
  return Math.max(0, ROOMS.findIndex((room) => room.id === last?.roomId));
}

/** Malos consejos de los jefes que frenaste y que dejaste pasar, en el historial guardado. */
export function scamStats(progress: ProgressData): { caught: number; fooled: number } {
  const stats = { caught: 0, fooled: 0 };
  for (const session of progress.history) {
    for (const result of session.results) {
      if (result.scam) stats[result.scam]++;
    }
  }
  return stats;
}

export function setHero(heroId: string) {
  saveProgress({ ...getProgress(), heroId });
}

/** Ya viste abrirse los sectores hasta `roomIndex`: no se repite la animación de la puerta. */
export function markUnlocksSeen(roomIndex: number) {
  const progress = getProgress();
  if ((progress.unlocksSeen ?? 0) >= roomIndex) return;
  saveProgress({ ...progress, unlocksSeen: roomIndex });
}

export function hasSeenLesson(progress: ProgressData, roomId: string): boolean {
  return (progress.lessonsSeen ?? []).includes(roomId);
}

export function markLessonSeen(roomId: string) {
  const progress = getProgress();
  if (hasSeenLesson(progress, roomId)) return;
  saveProgress({ ...progress, lessonsSeen: [...(progress.lessonsSeen ?? []), roomId] });
}

/** Desafíos pendientes de repaso (de un tema, o de todos), por id. */
export function reviewQueue(progress: ProgressData, topic?: TopicKey): string[] {
  return (progress.review ?? []).filter((id) => {
    const itemTopic = topicOfTemplate(id);
    return itemTopic !== undefined && (!topic || itemTopic === topic);
  });
}

function shuffled<T>(items: T[]): T[] {
  return items
    .map((item) => ({ item, order: Math.random() }))
    .sort((a, b) => a.order - b.order)
    .map(({ item }) => item);
}

function reviewExercises(progress: ProgressData, ids: string[]): Exercise[] {
  return ids.flatMap((id) => {
    const level = roomLevel(progress, roomOfTopic(topicOfTemplate(id)!).id);
    return exerciseFromTemplate(id, level) ?? [];
  });
}

/**
 * Los desafíos de un sector: `regular` pedidos del día y después `boss`
 * cruces con el jefe. Entre los pedidos vuelven algunos que erraste antes.
 */
export function buildRoomSession(room: RoomMeta, regular: number, boss: number): Exercise[] {
  const progress = getProgress();
  const level = roomLevel(progress, room.id);
  const review = reviewExercises(progress, reviewQueue(progress, room.topic).slice(0, REVIEW_PER_ROOM_SESSION));
  const fresh = buildExercises(
    room.topic,
    level,
    regular + boss - review.length,
    review.map((exercise) => exercise.templateId)
  );
  const opening = regular - review.length;
  return [...shuffled([...review, ...fresh.slice(0, opening)]), ...fresh.slice(opening)];
}

/** Repaso rápido: primero lo que erraste, y el resto al azar entre los sectores abiertos. */
export function buildMixedSession(size: number = MIXED_SIZE): Exercise[] {
  const progress = getProgress();
  const review = reviewExercises(progress, reviewQueue(progress).slice(0, REVIEW_PER_MIXED_SESSION));
  const open = ROOMS.slice(0, frontierIndex(progress) + 1);
  const exercises = [...review];
  const used = review.map((exercise) => exercise.templateId);
  for (let tries = 0; exercises.length < size && tries < size * 5; tries++) {
    const room = open[Math.floor(Math.random() * open.length)];
    const [exercise] = buildExercises(room.topic, roomLevel(progress, room.id), 1, used);
    if (!exercise) continue;
    exercises.push(exercise);
    used.push(exercise.templateId);
  }
  return shuffled(exercises);
}

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// En un sector se asciende ganándole al jefe con buena puntería.
const LEVEL_UP_ACCURACY = 0.75;

/** La cola de repaso después de la sesión: entran los errados, salen los resueltos bien. */
function updatedReview(current: string[], results: AnswerResult[]): string[] {
  let review = [...current];
  for (const result of results) {
    if (result.correct) review = review.filter((id) => id !== result.templateId);
    else if (!review.includes(result.templateId)) review.push(result.templateId);
  }
  return review.slice(-MAX_REVIEW);
}

export function recordSession(
  results: AnswerResult[],
  durationMs: number,
  room?: { id: string; bossDefeated: boolean }
): SessionRecord {
  const progress = getProgress();

  const topicBreakdown: Partial<Record<TopicKey, TopicBreakdown>> = {};
  for (const topic of TOPIC_ORDER) {
    const topicResults = results.filter((r) => r.topic === topic);
    if (topicResults.length === 0) continue;
    topicBreakdown[topic] = {
      correct: topicResults.filter((r) => r.correct).length,
      total: topicResults.length,
      avgMs: Math.round(average(topicResults.map((r) => r.timeMs))),
    };
  }

  const overallAccuracy = results.length > 0 ? results.filter((r) => r.correct).length / results.length : 0;
  const roomLevels = { ...progress.roomLevels };
  const bossesDefeated = { ...progress.bossesDefeated };
  let levelChange: SessionRecord["levelChange"];
  if (room?.bossDefeated) {
    bossesDefeated[room.id] = (bossesDefeated[room.id] ?? 0) + 1;
    const from = roomLevel(progress, room.id);
    if (overallAccuracy >= LEVEL_UP_ACCURACY && from < MAX_LEVEL) {
      levelChange = { from, to: from + 1 };
      roomLevels[room.id] = from + 1;
    }
  }

  const today = todayISO();
  const prevStreak = progress.streak;
  let nextStreak = prevStreak;
  if (prevStreak.lastDateISO !== today) {
    if (prevStreak.lastDateISO && isConsecutiveDay(prevStreak.lastDateISO, today)) {
      nextStreak = { count: prevStreak.count + 1, lastDateISO: today };
    } else {
      nextStreak = { count: 1, lastDateISO: today };
    }
  }

  const record: SessionRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    dateISO: today,
    durationMs,
    roomId: room?.id,
    results,
    overallAccuracy,
    overallAvgMs: Math.round(average(results.map((r) => r.timeMs))),
    topicBreakdown,
    levelChange,
  };

  saveProgress({
    ...progress,
    roomLevels,
    bossesDefeated,
    review: updatedReview(progress.review ?? [], results),
    history: [...progress.history, record].slice(-MAX_HISTORY),
    streak: nextStreak,
  });
  return record;
}
