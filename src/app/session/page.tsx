"use client";

import { CSSProperties, Suspense, useEffect, useEffectEvent, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import ArcadeMenu from "@/components/ArcadeMenu";
import PixelSprite from "@/components/PixelSprite";
import RepoView from "@/components/RepoView";
import SoundToggle, { useMusic } from "@/components/SoundToggle";
import Terminal, { TerminalLine } from "@/components/Terminal";
import { playSfx } from "@/lib/audio";
import { Exercise, answerMode, answerText, choicesOf } from "@/lib/challenges";
import { LESSONS } from "@/lib/lessons";
import { plain } from "@/lib/text";
import { ParsedCommand, Repo, RunResult, buildRepo, emptyRepo, run } from "@/lib/git/sim";
import { ROOMS, RoomMeta, getRoom, roomOfTopic } from "@/lib/rooms";
import {
  buildMixedSession,
  buildRoomSession,
  getProgress,
  hasSeenLesson,
  markLessonSeen,
  recordSession,
  reviewQueue,
} from "@/lib/storage";
import { personPalette, personRows } from "@/lib/sprites";
import { AnswerResult, LEVEL_LABELS, SessionRecord, TOPICS } from "@/lib/types";
import { useHeroLook } from "@/lib/useProgress";

type Phase = "lesson" | "playing" | "bossIntro" | "summary";

// En un escenario, primero van los pedidos del día y después la pelea con el
// jefe: el primero que acierta/erra BOSS_HP veces se queda con la ronda.
const REGULAR_ROUNDS = 5;
const BOSS_ROUNDS = 3;
const BOSS_HP = 2;
const PLAYER_HEARTS = 2;
// Escribiendo en la consola: cuántos comandos fallidos se perdonan, y el
// tope de comandos por desafío (mirar con status o log no cuesta nada).
const MAX_ERRORS = 3;
const EXTRA_COMMANDS = 7;

/** Cómo terminó un cruce con el jefe (ver `fightMessage`). */
type FightNote = "fair" | "caught" | "fooled" | "falseAlarm" | "badFix";

/** El desafío que se está jugando: su repositorio y lo que se fue corriendo. */
interface Round {
  /** El repositorio como arranca el desafío. */
  start: Repo;
  repo: Repo;
  lines: TerminalLine[];
  commands: ParsedCommand[];
  /** Comandos que modificaron algo, comandos fallidos y comandos en total. */
  steps: number;
  errors: number;
  typed: number;
  choices: string[];
  /** La opción que elegiste, para marcarla al corregir. */
  picked: string | null;
  /** Pelea final: lo que el jefe propone hacer (a veces está mal). */
  claim: string | null;
  /** Pelea final: lo frenaste y ahora te toca decir cómo era. */
  accusing: boolean;
  feedback: { correct: boolean; note?: FightNote } | null;
}

interface SessionState {
  exercises: Exercise[];
  /** Índice del primer desafío del jefe final; null en el repaso rápido (sin jefe). */
  bossStart: number | null;
  /** Pelea final: en qué cruces el jefe propone algo mal (uno por ronda). */
  lies: boolean[];
  index: number;
  results: AnswerResult[];
  round: Round;
  phase: Phase;
  record: SessionRecord | null;
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * En qué cruces de la pelea se equivoca el jefe: al azar, pero nunca todo
 * bien ni todo mal (si no, alcanzaría con apretar siempre lo mismo).
 */
function planLies(): boolean[] {
  const lies = Array.from({ length: BOSS_ROUNDS }, () => Math.random() < 0.5);
  if (lies.every((lie) => lie === lies[0])) {
    const flipped = Math.floor(Math.random() * BOSS_ROUNDS);
    lies[flipped] = !lies[flipped];
  }
  return lies;
}

function freshRound(exercise: Exercise, lie?: boolean): Round {
  const start = exercise.kind === "command" ? buildRepo(exercise.setup) : emptyRepo();
  return {
    start,
    repo: start,
    lines: [],
    commands: [],
    steps: 0,
    errors: 0,
    typed: 0,
    choices: choicesOf(exercise),
    picked: null,
    claim: lie === undefined ? null : lie ? pickRandom(exercise.wrong) : answerText(exercise),
    accusing: false,
    feedback: null,
  };
}

function freshSession(room?: RoomMeta, lesson = false): SessionState {
  const exercises = room ? buildRoomSession(room, REGULAR_ROUNDS, BOSS_ROUNDS) : buildMixedSession();
  return {
    exercises,
    bossStart: room ? REGULAR_ROUNDS : null,
    lies: planLies(),
    index: 0,
    results: [],
    round: freshRound(exercises[0]),
    phase: lesson ? "lesson" : "playing",
    record: null,
  };
}

/** Cómo viene la pelea final: vida que le queda al jefe y corazones que te quedan a vos. */
function fightStatus(bossStart: number | null, results: AnswerResult[]) {
  if (bossStart === null) return null;
  const rounds = results.slice(bossStart);
  const hits = rounds.filter((r) => r.correct).length;
  return { bossHp: BOSS_HP - hits, hearts: PLAYER_HEARTS - (rounds.length - hits) };
}

/** Cómo queda el repositorio con la respuesta modelo; null si el pedido no cambia nada (sólo mirar). */
function goalRepo(exercise: Exercise, start: Repo): Repo | null {
  const solved = exercise.solution.reduce((repo, step) => run(repo, step).repo, start);
  return JSON.stringify(solved) === JSON.stringify(start) ? null : solved;
}

/** Lo que salió por la consola al correr un comando. */
function logOf(input: string, result: RunResult): TerminalLine[] {
  const kind = result.ok ? "out" : "err";
  return [{ kind: "cmd", text: input }, ...result.output.map((text): TerminalLine => ({ kind, text }))];
}

function fightMessage(note: FightNote | undefined, room: RoomMeta): string {
  const owner = room.owner.name;
  switch (note) {
    case "fair":
      return "Lo que proponía estaba bien, y no te dejaste confundir.";
    case "caught":
      return `¡Frenaste a ${owner} antes de que usara ${room.attack}!`;
    case "fooled":
      return `¡${owner} usó ${room.attack} y lo dejaste pasar!`;
    case "falseAlarm":
      return "¡Lo que proponía estaba bien! Lo frenaste de más.";
    default:
      return "Estaba mal, pero tu respuesta tampoco sirvió.";
  }
}

export default function SessionPage() {
  return (
    <Suspense fallback={null}>
      <SessionContent />
    </Suspense>
  );
}

function SessionContent() {
  const searchParams = useSearchParams();
  const focusedRoom = getRoom(searchParams.get("room") ?? "");

  const [session, setSession] = useState<SessionState | null>(null);
  /** Id del desafío cuya pista se pidió ver (de Senior no se muestra sola). */
  const [revealedHintId, setRevealedHintId] = useState<string | null>(null);

  /** Id del desafío cuyo objetivo se pidió ver: el árbol como tiene que quedar. */
  const [revealedGoalId, setRevealedGoalId] = useState<string | null>(null);

  const exerciseStartRef = useRef<number>(0);
  const sessionStartRef = useRef<number>(0);
  const feedbackRef = useRef<HTMLDivElement>(null);

  function startNewSession() {
    const now = Date.now();
    exerciseStartRef.current = now;
    sessionStartRef.current = now;
    setSession(freshSession(focusedRoom));
  }

  // La primera vez que entrás a un escenario (o si pediste repasarla), antes va su mini lección.
  const startOnMount = useEffectEvent(() => {
    const lesson =
      !!focusedRoom && (searchParams.get("leccion") !== null || !hasSeenLesson(getProgress(), focusedRoom.id));
    setSession(freshSession(focusedRoom, lesson));
  });

  function finishLesson() {
    if (!session || !focusedRoom) return;
    markLessonSeen(focusedRoom.id);
    const now = Date.now();
    exerciseStartRef.current = now;
    sessionStartRef.current = now;
    setSession({ ...session, phase: "playing" });
  }

  useEffect(() => {
    // Arma la primera ronda (desafíos al azar) sólo del lado del cliente:
    // el SSR y el primer render del cliente deben coincidir (ambos muestran
    // "Cargando..."), así que el contenido real recién se crea acá.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    startOnMount();
  }, []);

  const fighting = !!session && session.bossStart !== null && session.index >= session.bossStart;
  useMusic(!session || session.phase === "summary" ? null : fighting && session.phase !== "lesson" ? "boss" : "shop");

  // La explicación aparece debajo de todo: que no quede fuera de la pantalla.
  const answered = !!session?.round.feedback;
  useEffect(() => {
    if (answered) feedbackRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [answered]);

  /** Pasa al desafío siguiente, o cierra la ronda si no quedan (o si terminó la pelea). */
  function advance() {
    if (!session || !session.round.feedback) return;
    const { results } = session;
    const nextIndex = session.index + 1;
    const fight = fightStatus(session.bossStart, results);
    const fightOver = !!fight && (fight.bossHp <= 0 || fight.hearts <= 0);
    if (nextIndex >= session.exercises.length || fightOver) {
      const bossDefeated = !!fight && fight.bossHp <= 0;
      const record = recordSession(
        results,
        Date.now() - sessionStartRef.current,
        focusedRoom && { id: focusedRoom.id, bossDefeated }
      );
      playSfx(focusedRoom && !bossDefeated ? "lose" : "win");
      setSession({ ...session, phase: "summary", record });
      return;
    }
    const startsBoss = nextIndex === session.bossStart;
    const inFight = session.bossStart !== null && nextIndex >= session.bossStart;
    if (startsBoss) playSfx("bossIntro");
    exerciseStartRef.current = Date.now();
    setSession({
      ...session,
      index: nextIndex,
      round: freshRound(
        session.exercises[nextIndex],
        inFight ? session.lies[nextIndex - session.bossStart!] : undefined
      ),
      phase: startsBoss ? "bossIntro" : "playing",
    });
  }

  /** Cierra el desafío actual con su resultado y muestra la explicación. */
  function finish(round: Round, correct: boolean, note?: FightNote) {
    if (!session || session.phase !== "playing" || session.round.feedback) return;
    const current = session.exercises[session.index];
    const result: AnswerResult = {
      exerciseId: current.id,
      templateId: current.templateId,
      topic: current.topic,
      correct,
      timeMs: Date.now() - exerciseStartRef.current,
      scam: note === "caught" || note === "fooled" ? note : undefined,
    };
    if (session.bossStart !== null && session.index >= session.bossStart) {
      // en la pelea, al que recibe el golpe se le caen las monedas
      playSfx("hit");
      setTimeout(() => playSfx("coin"), 140);
    } else {
      playSfx(correct ? "coin" : "wrong");
    }
    setSession({ ...session, results: [...session.results, result], round: { ...round, feedback: { correct, note } } });
  }

  /** En la pelea, la nota depende de si venías de frenar al jefe. */
  function noteFor(round: Round, correct: boolean): FightNote | undefined {
    return round.accusing ? (correct ? "caught" : "badFix") : undefined;
  }

  /** Elegiste una opción: si es un comando, se corre para ver qué hace. */
  function pickChoice(choice: string) {
    if (!session || session.round.feedback) return;
    const { round } = session;
    const current = session.exercises[session.index];
    if (current.kind === "concept") {
      const correct = choice === current.solution[0];
      return finish({ ...round, picked: choice }, correct, noteFor(round, correct));
    }
    const result = run(round.start, choice);
    const correct = current.goal!({ repo: result.repo, before: round.start, commands: result.commands });
    finish({ ...round, picked: choice, repo: result.repo, lines: logOf(choice, result) }, correct, noteFor(round, correct));
  }

  /** Escribiste un comando: corre sobre el repositorio y se ve si cumplió el pedido. */
  function submitCommand(input: string) {
    if (!session || session.round.feedback) return;
    const { round } = session;
    const current = session.exercises[session.index];
    if (input === "clear") return setSession({ ...session, round: { ...round, lines: [] } });
    const result = run(round.repo, input);
    const next: Round = {
      ...round,
      repo: result.repo,
      lines: [...round.lines, ...logOf(input, result)],
      commands: [...round.commands, ...result.commands],
      steps: round.steps + (result.changed ? 1 : 0),
      errors: round.errors + (result.ok ? 0 : 1),
      typed: round.typed + 1,
    };
    const maxSteps = current.solution.length === 1 ? 1 : current.solution.length + 1;
    if (current.goal!({ repo: next.repo, before: round.start, commands: next.commands })) {
      finish(next, true, noteFor(round, true));
    } else if (next.steps >= maxSteps || next.errors >= MAX_ERRORS || next.typed >= current.solution.length + EXTRA_COMMANDS) {
      finish(next, false, noteFor(round, false));
    } else {
      if (!result.ok) playSfx("wrong");
      setSession({ ...session, round: next });
    }
  }

  /** Pelea final: dejás pasar lo que propone el jefe, o lo frenás y después lo corregís. */
  function judgeClaim(accuse: boolean) {
    if (!session || session.phase !== "playing" || session.round.feedback) return;
    const { round } = session;
    if (round.claim === null || round.accusing) return;
    const current = session.exercises[session.index];
    const fair = round.claim === answerText(current);
    if (accuse) {
      if (fair) return finish(round, false, "falseAlarm");
      const choices = round.choices.filter((choice) => choice !== round.claim);
      return setSession({ ...session, round: { ...round, accusing: true, choices } });
    }
    // lo dejaste pasar: se corre lo que propuso, para ver qué hacía
    if (current.kind === "concept") return finish(round, fair, fair ? "fair" : "fooled");
    const result = run(round.start, round.claim);
    finish({ ...round, repo: result.repo, lines: logOf(round.claim, result) }, fair, fair ? "fair" : "fooled");
  }

  function giveUp() {
    if (session) finish(session.round, false, noteFor(session.round, false));
  }

  function startBossFight() {
    if (!session) return;
    exerciseStartRef.current = Date.now();
    setSession({ ...session, phase: "playing" });
  }

  // Teclado físico: los números eligen la opción (1 = dejar pasar, 2 = frenar
  // al jefe) y Enter sigue de largo después de leer la explicación. La
  // consola y los botones manejan sus propias teclas.
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (!session || (e.target as HTMLElement).closest("input, button, a")) return;
    const confirm = e.key === "Enter" || e.key === " ";
    if (session.phase === "bossIntro") {
      if (confirm) {
        e.preventDefault();
        startBossFight();
      }
      return;
    }
    if (session.phase !== "playing") return;
    const { round } = session;
    if (round.feedback) {
      if (confirm) {
        e.preventDefault();
        advance();
      }
      return;
    }
    const picked = Number(e.key) - 1;
    if (round.claim !== null && !round.accusing) {
      if (picked === 0 || picked === 1) {
        e.preventDefault();
        judgeClaim(picked === 1);
      }
    } else if (answerMode(session.exercises[session.index]) === "choice" && round.choices[picked]) {
      e.preventDefault();
      pickChoice(round.choices[picked]);
    }
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKeyDown(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const current = session?.exercises[session.index];
  if (!session || !current) {
    return (
      <main className="game items-center justify-center">
        <p className="blink" style={{ color: "var(--foreground-muted)" }}>
          READY
        </p>
      </main>
    );
  }

  const fight = fightStatus(session.bossStart, session.results);

  if (session.phase === "summary" && session.record) {
    return (
      <SummaryView
        record={session.record}
        exercises={session.exercises}
        boss={focusedRoom && fight ? { room: focusedRoom, defeated: fight.bossHp <= 0 } : null}
        onReplay={startNewSession}
      />
    );
  }

  if (session.phase === "bossIntro" && focusedRoom) {
    return <BossIntro room={focusedRoom} onStart={startBossFight} />;
  }

  if (session.phase === "lesson" && focusedRoom) {
    return <LessonView room={focusedRoom} onDone={finishLesson} />;
  }

  const room = focusedRoom ?? roomOfTopic(current.topic);
  const { round } = session;
  const { feedback } = round;
  const inBossFight = session.bossStart !== null && session.index >= session.bossStart;
  // En la pelea, primero decidís si lo que propone el jefe está bien; recién si lo frenás, respondés vos.
  const awaitingVerdict = round.claim !== null && !round.accusing;
  const mode = answerMode(current);
  const isCommand = current.kind === "command";
  const showHint = mode === "terminal" && !!current.hint && !feedback;
  // escribiendo en la consola se puede pedir ver el árbol como tiene que quedar
  const target = isCommand && mode === "terminal" && !awaitingVerdict && !feedback ? goalRepo(current, round.start) : null;
  const hint = showHint && (
    <HintBox
      hint={current.hint!}
      open={current.level <= 1 || revealedHintId === current.id}
      onReveal={() => setRevealedHintId(current.id)}
    />
  );

  return (
    <main className="game">
      <div className="flex items-center justify-between px-3 py-2.5 text-[8px] uppercase">
        <Link href="/" style={{ color: "var(--foreground-muted)" }}>
          ✕ salir
        </Link>
        <span style={{ color: "var(--accent)" }}>{inBossFight ? "Jefe final" : focusedRoom ? plain(room.name) : "Repaso rapido"}</span>
        <span className="flex items-center gap-3">
          <SoundToggle />
          {session.index + 1}/{session.exercises.length}
        </span>
      </div>

      {inBossFight && fight && (
        <BossScene room={room} bossHp={fight.bossHp} hearts={fight.hearts} feedback={feedback} round={session.index} />
      )}

      <div className="flex-1 flex flex-col px-3 pt-3 pb-5 gap-3">
        {inBossFight ? (
          <div className="mm-dialog">
            <p className="break-words">{current.prompt}</p>
            {round.claim !== null && (
              <div className="mm-claim">
                {room.owner.name}: {isCommand ? "«Yo haría esto»" : `«Para mí: ${round.claim}»`}
                {isCommand && <CommandText text={round.claim} />}
              </div>
            )}
            {round.accusing && !feedback && <p>¿Y cómo era, entonces?</p>}
            {hint}
          </div>
        ) : (
          <div className="pixel-panel p-3 flex gap-3">
            <div className="portrait">
              <PixelSprite rows={personRows(room.owner.look).slice(0, 16)} palette={personPalette(room.owner.look)} scale={3} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[8px] mb-1" style={{ color: current.review ? "var(--cyan)" : "var(--foreground-muted)" }}>
                {current.review ? "↻ Repaso: este lo erraste" : `${room.owner.name} · ${TOPICS[current.topic].label}`}
              </p>
              <p className="text-[11px] leading-relaxed break-words">{current.prompt}</p>
              {hint}
            </div>
          </div>
        )}

        {isCommand && <RepoView repo={round.repo} />}

        {target &&
          (revealedGoalId === current.id ? (
            <div>
              <p className="text-[8px] uppercase mb-2" style={{ color: "var(--cyan)" }}>
                ◎ Objetivo: asi tiene que quedar
              </p>
              <RepoView repo={target} />
            </div>
          ) : (
            <button onClick={() => setRevealedGoalId(current.id)} className="hint-box cursor-pointer text-left" style={{ marginTop: 0 }}>
              ◎ Ver objetivo
            </button>
          ))}

        {isCommand && mode === "choice" && round.lines.length > 0 && <Terminal lines={round.lines} />}

        {awaitingVerdict && !feedback && (
          <div className="grid grid-cols-1 gap-3">
            <button onClick={() => judgeClaim(false)} className="pixel-btn py-4 text-xs">
              Dale, esta bien
            </button>
            <button onClick={() => judgeClaim(true)} className="pixel-btn pixel-btn-primary py-4 text-xs">
              ¡Para, eso esta mal!
            </button>
          </div>
        )}

        {!awaitingVerdict && mode === "choice" && (
          <div className="grid grid-cols-1 gap-3">
            {round.choices.map((choice, i) => (
              <button
                key={choice}
                onClick={() => pickChoice(choice)}
                disabled={!!feedback}
                className="pixel-btn choice-btn"
                data-result={!feedback ? undefined : choice === answerText(current) ? "right" : choice === round.picked ? "wrong" : undefined}
              >
                <span className="choice-key">{i + 1}</span>
                {isCommand ? <CommandText text={choice} /> : <span>{choice}</span>}
              </button>
            ))}
          </div>
        )}

        {!awaitingVerdict && mode === "terminal" && (
          <>
            <Terminal lines={round.lines} onSubmit={submitCommand} disabled={!!feedback} />
            {!feedback && (
              <button
                onClick={giveUp}
                className="self-end text-[8px] uppercase cursor-pointer"
                style={{ background: "transparent", border: 0, color: "var(--foreground-muted)" }}
              >
                No se, mostrame ▶
              </button>
            )}
          </>
        )}

        {feedback && (
          <div ref={feedbackRef} className="flex flex-col gap-3">
            <div className={inBossFight ? "mm-dialog" : "pixel-panel px-3 py-3"}>
              {inBossFight ? (
                <p>{fightMessage(feedback.note, room)}</p>
              ) : (
                <p className="text-xs" style={{ color: feedback.correct ? "var(--status-good-text)" : "var(--status-critical)" }}>
                  {feedback.correct ? "¡Correcto!" : "Incorrecto..."}
                </p>
              )}
              {!feedback.correct && (
                <div className="mt-2">
                  <p className="text-[8px] uppercase opacity-70">La respuesta era</p>
                  {isCommand ? current.solution.map((step) => <CommandText key={step} text={step} />) : <p>{current.solution[0]}</p>}
                </div>
              )}
              <p className="text-[9px] leading-relaxed mt-2 opacity-90">{current.explain}</p>
            </div>
            <button onClick={advance} className="pixel-btn pixel-btn-primary py-4 text-xs">
              Continuar ▶
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

/** Mini lección del escenario: cada paso corre un comando a la vista sobre un repositorio de ejemplo. */
function LessonView({ room, onDone }: { room: RoomMeta; onDone: () => void }) {
  const lesson = LESSONS[room.id];
  const [index, setIndex] = useState(0);
  // el repositorio y la consola como quedan en el paso actual
  let repo = buildRepo(lesson.setup);
  let lines: TerminalLine[] = [];
  for (const slide of lesson.slides.slice(0, index + 1)) {
    for (const line of slide.before ?? []) repo = run(repo, line).repo;
    lines = [];
    if (slide.cmd) {
      const result = run(repo, slide.cmd);
      repo = result.repo;
      lines = logOf(slide.cmd, result);
    }
  }
  const last = index === lesson.slides.length - 1;
  const next = () => (last ? onDone() : setIndex(index + 1));

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.key !== "Enter" || (e.target as HTMLElement).closest("button, a")) return;
    e.preventDefault();
    next();
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKeyDown(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <main className="game">
      <div className="flex items-center justify-between px-3 py-2.5 text-[8px] uppercase">
        <Link href="/" style={{ color: "var(--foreground-muted)" }}>
          ✕ salir
        </Link>
        <span style={{ color: "var(--accent)" }}>Leccion · {plain(room.name)}</span>
        <span className="flex items-center gap-3">
          <SoundToggle />
          {index + 1}/{lesson.slides.length}
        </span>
      </div>
      <div className="flex-1 flex flex-col px-3 pt-3 pb-5 gap-3">
        <div className="pixel-panel p-3 flex gap-3">
          <div className="portrait">
            <PixelSprite rows={personRows(room.owner.look).slice(0, 16)} palette={personPalette(room.owner.look)} scale={3} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[8px] mb-1" style={{ color: "var(--foreground-muted)" }}>
              {room.owner.name} · {TOPICS[room.topic].label}
            </p>
            <p key={index} className="text-[10px] leading-relaxed break-words graph-row-new">
              {lesson.slides[index].text}
            </p>
          </div>
        </div>
        <RepoView repo={repo} />
        {lines.length > 0 && <Terminal lines={lines} />}
        <button onClick={next} className="pixel-btn pixel-btn-primary py-4 text-xs">
          {last ? "¡A jugar! ▶" : "Siguiente ▶"}
        </button>
        {!last && (
          <button
            onClick={onDone}
            className="self-end text-[8px] uppercase cursor-pointer"
            style={{ background: "transparent", border: 0, color: "var(--foreground-muted)" }}
          >
            Saltar la leccion ▶
          </button>
        )}
      </div>
    </main>
  );
}

/** Un comando en tipografía de consola; los pasos unidos con && van uno por renglón. */
function CommandText({ text }: { text: string }) {
  return (
    <span className="min-w-0">
      {text.split(" && ").map((step, i) => (
        <code key={i} className="cmd">
          {step}
        </code>
      ))}
    </span>
  );
}

/** Pista de cómo se escribe el comando; de Senior hay que pedirla. */
function HintBox({ hint, open, onReveal }: { hint: string; open: boolean; onReveal: () => void }) {
  if (!open) {
    return (
      <button onClick={onReveal} className="hint-box cursor-pointer text-left" style={{ fontFamily: "inherit" }}>
        ? Ver pista
      </button>
    );
  }
  return <p className="hint-box">Pista: {hint}</p>;
}

/** Medidor de energía vertical, en rayitas, como los de Mega Man. */
function EnergyMeter({ value, max, left, color }: { value: number; max: number; left: number; color: string }) {
  return (
    <div className="mm-meter" style={{ left, color }}>
      <div className="mm-meter-fill" style={{ height: `${(Math.max(0, value) / max) * 100}%` }} />
    </div>
  );
}

/** Pelea final en la sala del jefe: vos a la izquierda, el jefe a la derecha y un disparo por cruce. */
function BossScene({
  room,
  bossHp,
  hearts,
  feedback,
  round,
}: {
  room: RoomMeta;
  bossHp: number;
  hearts: number;
  feedback: Round["feedback"];
  round: number;
}) {
  const look = room.owner.look;
  const heroLook = useHeroLook();
  const bossHit = !!feedback && feedback.correct;
  const heroHit = !!feedback && !feedback.correct;
  return (
    <div className="mm-battle">
      <div className="mm-wall" />
      <div className="mm-wall mm-wall-right" />
      <div className="mm-floor" />
      <EnergyMeter value={hearts} max={PLAYER_HEARTS} left={34} color="var(--yellow)" />
      <EnergyMeter value={bossHp} max={BOSS_HP} left={56} color="var(--status-critical)" />
      <p className="mm-tag">
        {room.owner.name}
        <br />
        <span style={{ color: "var(--foreground-muted)" }}>{plain(room.owner.role)}</span>
      </p>

      <div className="mm-fighter" style={{ left: "27%" }}>
        <div key={heroHit ? `hit-${round}` : "hero"} className={heroHit ? "mm-hit" : ""}>
          <PixelSprite rows={personRows(heroLook)} palette={personPalette(heroLook)} scale={3} />
        </div>
      </div>
      <div className="mm-fighter" style={{ right: "14%" }}>
        <div key={bossHit ? `hit-${round}` : "boss"} className={bossHit ? "mm-hit" : "bob"}>
          <PixelSprite rows={personRows(look, true)} palette={personPalette(look)} scale={4} />
        </div>
      </div>

      {/* acertaste: tu disparo cruza hasta el jefe; erraste: el suyo viene hacia vos */}
      {feedback && (
        <span
          key={`shot-${round}`}
          className="mm-shot"
          style={
            {
              left: bossHit ? "42%" : undefined,
              right: bossHit ? undefined : "32%",
              "--reach": bossHit ? "110px" : "-110px",
              background: bossHit ? undefined : "var(--status-critical)",
            } as CSSProperties
          }
        />
      )}
    </div>
  );
}

/** Presentación del jefe: la franja azul, el cielo de estrellas y el nombre letra por letra. */
function BossIntro({ room, onStart }: { room: RoomMeta; onStart: () => void }) {
  const look = room.owner.look;
  return (
    <main className="game">
      <button
        onClick={onStart}
        className="mm-intro flex-1 flex flex-col items-center justify-center gap-6 text-center cursor-pointer"
        style={{ border: 0, color: "var(--foreground)" }}
      >
        <h1 className="boss-title text-[22px]">Jefe final</h1>
        <div className="mm-intro-band">
          <div className="pop-in">
            <PixelSprite rows={personRows(look, true)} palette={personPalette(look)} scale={7} />
          </div>
        </div>
        <p className="mm-intro-name" style={{ "--letters": room.owner.name.length } as CSSProperties}>
          {room.owner.name}
        </p>
        <p className="text-[10px] leading-relaxed px-6">“{room.taunt}”</p>
        <p className="text-[9px] uppercase px-6" style={{ color: "var(--yellow)" }}>
          Te va a decir que haria. Si esta mal, frenalo y mostrale como es.
        </p>
        <p className="blink text-[10px] uppercase mt-2">Toca para pelear</p>
      </button>
    </main>
  );
}

const SUMMARY_MENU = ["Si", "No", "Ver progreso"];

function SummaryView({
  record,
  exercises,
  boss,
  onReplay,
}: {
  record: SessionRecord;
  exercises: Exercise[];
  boss: { room: RoomMeta; defeated: boolean } | null;
  onReplay: () => void;
}) {
  const router = useRouter();
  const correctCount = record.results.filter((r) => r.correct).length;
  const lost = boss !== null && !boss.defeated;
  // ganarle al jefe abre el escenario siguiente
  const nextRoom = boss ? ROOMS[ROOMS.indexOf(boss.room) + 1] : undefined;
  const scamsCaught = record.results.filter((r) => r.scam === "caught").length;
  const scamsFooled = record.results.filter((r) => r.scam === "fooled").length;
  const pendingReview = reviewQueue(getProgress()).length;
  const missed = exercises.filter((exercise) => record.results.some((r) => r.exerciseId === exercise.id && !r.correct));

  function pick(index: number) {
    if (index === 0) onReplay();
    else router.push(index === 1 ? "/" : "/progress");
  }

  return (
    <main className="game items-center px-4 py-8 gap-5">
      <h1 className={`${lost ? "boss-title" : "arcade-title"} text-[30px] text-center`}>
        {lost ? (
          <>
            Game
            <br />
            Over
          </>
        ) : boss ? (
          "¡Ganaste!"
        ) : (
          <>
            Repaso
            <br />
            completo
          </>
        )}
      </h1>

      {boss && (
        <div className="w-full flex flex-col items-center gap-3 text-center">
          <div className={lost ? "bob" : ""} style={{ opacity: lost ? 1 : 0.7 }}>
            <PixelSprite
              rows={personRows(boss.room.owner.look, lost)}
              palette={personPalette(boss.room.owner.look)}
              scale={5}
            />
          </div>
          <p className="text-[10px] uppercase" style={{ color: lost ? "var(--pink)" : "var(--status-good-text)" }}>
            {lost ? `${boss.room.owner.name} te ganó esta vez` : `¡Venciste a ${boss.room.owner.name}!`}
          </p>
          {scamsCaught + scamsFooled > 0 && (
            <p className="text-[9px] uppercase" style={{ color: "var(--foreground-secondary)" }}>
              Malos consejos: frenaste {scamsCaught}, dejaste pasar {scamsFooled}
            </p>
          )}
          {record.levelChange && (
            <p className="text-[9px] uppercase leading-relaxed" style={{ color: "var(--cyan)" }}>
              ▲ Ascendiste a {LEVEL_LABELS[record.levelChange.to]} en {plain(boss.room.name)}:{" "}
              {record.levelChange.to === 1 ? "ahora los comandos se escriben" : "ahora, sin pistas a la vista"}
            </p>
          )}
          {!lost && (
            <div className="mm-got">
              <p className="text-[8px]">Conseguiste</p>
              <p className="text-[11px] mt-1" style={{ color: "var(--yellow)" }}>
                {TOPICS[boss.room.topic].commands}
              </p>
              <p className="text-[8px] mt-2">
                {nextRoom ? `Ya podes entrar a ${plain(nextRoom.name)}` : "¡Recorriste los tres pisos!"}
              </p>
            </div>
          )}
        </div>
      )}

      <section className="pixel-panel w-full p-4 grid grid-cols-2 gap-4 text-center">
        <div>
          <div className="text-xl" style={{ color: "var(--status-good-text)" }}>
            {Math.round(record.overallAccuracy * 100)}%
          </div>
          <div className="text-[8px] mt-1 uppercase" style={{ color: "var(--foreground-muted)" }}>
            precision
          </div>
        </div>
        <div>
          <div className="text-xl" style={{ color: "var(--accent)" }}>
            {correctCount}/{record.results.length}
          </div>
          <div className="text-[8px] mt-1 uppercase" style={{ color: "var(--foreground-muted)" }}>
            desafios
          </div>
        </div>
      </section>

      {missed.length > 0 && (
        <section className="w-full flex flex-col gap-3">
          <h2 className="text-[8px] uppercase" style={{ color: "var(--foreground-muted)" }}>
            Para repasar
          </h2>
          {missed.map((exercise) => (
            <div key={exercise.id} className="pixel-panel px-3 py-3">
              <p className="text-[9px] leading-relaxed" style={{ color: "var(--foreground-secondary)" }}>
                {exercise.prompt}
              </p>
              <div className="mt-2" style={{ color: "var(--status-good-text)" }}>
                {exercise.kind === "command" ? (
                  exercise.solution.map((step) => <CommandText key={step} text={step} />)
                ) : (
                  <p className="text-[9px] leading-relaxed">{exercise.solution[0]}</p>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {pendingReview > 0 && (
        <p className="text-[8px] uppercase text-center" style={{ color: "var(--cyan)" }}>
          ↻ {pendingReview} {pendingReview === 1 ? "desafio vuelve" : "desafios vuelven"} para repasar
        </p>
      )}

      <div className="flex flex-col items-center gap-2 mt-2">
        <p className="text-xs uppercase">¿Jugar de nuevo?</p>
        <ArcadeMenu items={SUMMARY_MENU} onPick={pick} />
      </div>
    </main>
  );
}
