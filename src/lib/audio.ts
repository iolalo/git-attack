// Música y efectos 8-bit generados con Web Audio (ondas cuadradas y
// triangulares + ruido para la batería), sin archivos de sonido: funciona
// offline y no pesa nada.

export type Track = "street" | "shop" | "boss";
export type Sfx = "coin" | "wrong" | "hit" | "enter" | "bossIntro" | "win" | "lose";

const MUTED_KEY = "git-attack:muted";
const MUSIC_VOLUME = 0.045;
const SFX_VOLUME = 0.11;
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.12;
// La onda triangular suena bastante más baja que la cuadrada al mismo volumen.
const WAVE_GAIN: Partial<Record<OscillatorType, number>> = { triangle: 2.4 };

interface Song {
  bpm: number;
  /** Parte del pulso que dura la primera corchea de cada par: 0.5 = parejo, ~0.65 = swing. */
  swing: number;
  leadWave: OscillatorType;
  bassWave: OscillatorType;
  /** Una nota por corchea; "." es silencio y "-" sostiene la nota anterior. */
  melody: string[];
  /** Segunda voz, más suave, que acompaña a la melodía. */
  harmony: string[];
  bass: string[];
  /** Batería por corchea: k bombo, s redoblante, h platillo, "." nada. */
  drums: string[];
}

const steps = (pattern: string): string[] => pattern.trim().split(/\s+/);

const SONGS: Record<Track, Song> = {
  // Selección de escenario: marcha tensa en mi menor, con el bajo saltando
  // de octava y una segunda voz que contesta a contratiempo. Composición
  // propia: Em | Em | C | D | Em | Em | C D | B.
  street: {
    bpm: 150,
    swing: 0.5,
    leadWave: "square",
    bassWave: "triangle",
    melody: steps(`
      E5 . B4 E5 G5 . E5 .     F#5 . E5 . B4 - . .
      E5 . C5 E5 G5 . E5 .     F#5 . A5 . F#5 D5 . .
      E5 . B4 E5 G5 . B5 .     A5 . G5 . F#5 . E5 .
      C5 E5 G5 . D5 F#5 A5 .   B5 - . F#5 B4 - . .
    `),
    harmony: steps(`
      . . G4 . B4 . G4 .       . . A4 . G4 . . .
      . . E4 . C5 . G4 .       . . D5 . D5 A4 . .
      . . G4 . B4 . G5 .       . . E5 . D5 . B4 .
      E4 . C5 . F#4 . D5 .     D#5 - . . F#4 - . .
    `),
    bass: steps(`
      E2 . E3 E2 . E2 E3 .     E2 . E3 E2 . B2 E3 .
      C2 . C3 C2 . C2 C3 .     D2 . D3 D2 . D2 D3 .
      E2 . E3 E2 . E2 E3 .     E2 . E3 E2 . B2 E3 .
      C2 . C3 . D2 . D3 .      B2 . B2 . B2 F#2 B2 .
    `),
    drums: steps("k . h . s . h h"),
  },
  // Adentro de un escenario: tema de acción en re menor, con el bajo en
  // corcheas parejas y la melodía trepando en arpegios.
  // Dm | Bb | C | Dm | Dm | Bb | Gm | A.
  shop: {
    bpm: 168,
    swing: 0.5,
    leadWave: "square",
    bassWave: "square",
    melody: steps(`
      D5 D5 . F5 . A5 . D6     C6 . Bb5 . A5 . F5 .
      E5 E5 . G5 . C6 . E6     D6 - . A5 F5 . D5 .
      D5 D5 . F5 . A5 . D6     F6 . E6 . D6 . Bb5 .
      G5 Bb5 D6 . G6 . F6 .    E6 . C#6 . A5 - . .
    `),
    harmony: steps(`
      . . . D5 . F5 . A5       A5 . F5 . F5 . D5 .
      . . . E5 . G5 . C6       A5 - . F5 D5 . A4 .
      . . . D5 . F5 . A5       D6 . Bb5 . Bb5 . F5 .
      D5 G5 Bb5 . D6 . D6 .    C#6 . A5 . E5 - . .
    `),
    bass: steps(`
      D3 D3 A3 D3 D3 A3 D3 A3  Bb2 Bb2 F3 Bb2 Bb2 F3 Bb2 F3
      C3 C3 G3 C3 C3 G3 C3 G3  D3 D3 A3 D3 D3 A3 D3 A3
      D3 D3 A3 D3 D3 A3 D3 A3  Bb2 Bb2 F3 Bb2 Bb2 F3 Bb2 F3
      G2 G2 D3 G2 G2 D3 G2 D3  A2 A2 E3 A2 A2 E3 A2 C#3
    `),
    drums: steps("k h s h k k s h"),
  },
  // Jefe final: riff cromático y apurado en mi menor, que termina subiendo
  // por la escala hasta el grito agudo antes de volver a empezar.
  boss: {
    bpm: 186,
    swing: 0.5,
    leadWave: "square",
    bassWave: "sawtooth",
    melody: steps(`
      E5 . E5 G5 . E5 Bb5 A5   G5 . E5 . D5 E5 . .
      E5 . E5 G5 . E5 B5 Bb5   A5 G5 E5 G5 A5 - . .
      C6 . C6 B5 . G5 E5 G5    B5 . A5 . F#5 D5 . .
      E5 F#5 G5 A5 B5 C6 D6 D#6  E6 - - - . . B5 .
    `),
    harmony: steps("."),
    bass: steps(`
      E2 E2 E3 E2 E2 E3 E2 E2  E2 E2 E3 E2 D2 D3 D2 D2
      E2 E2 E3 E2 E2 E3 E2 E2  A2 A2 A3 A2 A2 A3 B2 B2
      C3 C3 C3 C3 C3 C3 C3 C3  D3 D3 D3 D3 D3 D3 D3 D3
      E2 E2 F#2 F#2 G2 G2 A2 A2  B2 B2 B2 B2 B2 B2 B2 B2
    `),
    drums: steps("k h s k k h s h"),
  },
};

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function frequency(note: string): number {
  const match = /^([A-G])([#b]?)(\d)$/.exec(note);
  if (!match) return 0;
  const accidental = match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0;
  const midi = 12 * (Number(match[3]) + 1) + SEMITONES[match[1]] + accidental;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

let ctx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let muted = false;
let mutedLoaded = false;
let wantedTrack: Track | null = null;
let playingTrack: Track | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let step = 0;
let nextStepTime = 0;
const listeners = new Set<() => void>();

function loadMuted() {
  if (mutedLoaded || typeof window === "undefined") return;
  mutedLoaded = true;
  try {
    muted = window.localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    // sin acceso a localStorage: arranca con sonido
  }
}

function tone(
  type: OscillatorType,
  freq: number,
  start: number,
  duration: number,
  volume: number,
  slideTo?: number
) {
  if (!ctx || freq <= 0) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
  gain.gain.setValueAtTime(volume * (WAVE_GAIN[type] ?? 1), start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Golpe de ruido blanco; con `highpass` queda sólo el "tss" agudo de un platillo. */
function noise(start: number, duration: number, volume: number, highpass = false) {
  if (!ctx) return;
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate / 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = noiseBuffer;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  if (highpass) {
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 6000;
    source.connect(filter).connect(gain).connect(ctx.destination);
  } else {
    source.connect(gain).connect(ctx.destination);
  }
  source.start(start);
  source.stop(start + duration + 0.02);
}

function drum(kind: string, start: number) {
  if (kind === "k") tone("sine", 130, start, 0.1, MUSIC_VOLUME * 5, 45);
  else if (kind === "s") noise(start, 0.09, MUSIC_VOLUME * 1.6);
  else if (kind === "h") noise(start, 0.03, MUSIC_VOLUME * 0.9, true);
}

/** Duración (en segundos) de cada corchea desde `from`, respetando el swing. */
function stepDuration(song: Song, index: number): number {
  const pulse = 60 / song.bpm;
  return pulse * (index % 2 === 0 ? song.swing : 1 - song.swing);
}

/** Toca la nota de la voz en `index`, sostenida mientras le sigan "-". */
function voice(song: Song, line: string[], wave: OscillatorType, index: number, start: number, volume: number) {
  const note = line[index % line.length];
  if (note === "." || note === "-") return;
  let duration = stepDuration(song, index);
  for (let i = index + 1; line[i % line.length] === "-" && i < index + line.length; i++) {
    duration += stepDuration(song, i);
  }
  tone(wave, frequency(note), start, duration * 0.92, volume);
}

function scheduleSteps() {
  if (!ctx || !playingTrack) return;
  const current = SONGS[playingTrack];
  while (nextStepTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
    voice(current, current.melody, current.leadWave, step, nextStepTime, MUSIC_VOLUME);
    voice(current, current.harmony, current.leadWave, step, nextStepTime, MUSIC_VOLUME * 0.5);
    voice(current, current.bass, current.bassWave, step, nextStepTime, MUSIC_VOLUME * 0.9);
    drum(current.drums[step % current.drums.length], nextStepTime);
    nextStepTime += stepDuration(current, step);
    step++;
  }
}

function stopMusic() {
  if (timer) clearInterval(timer);
  timer = null;
  playingTrack = null;
}

/** Hace que suene lo que se pidió (o que se calle), si el navegador ya lo permite. */
function sync() {
  const target = muted ? null : wantedTrack;
  if (!ctx || ctx.state !== "running") return;
  if (target === playingTrack) return;
  stopMusic();
  if (!target) return;
  playingTrack = target;
  step = 0;
  nextStepTime = ctx.currentTime + 0.05;
  timer = setInterval(scheduleSteps, LOOKAHEAD_MS);
}

/**
 * Los navegadores no dejan sonar nada hasta el primer toque o tecla.
 * Se llama desde ese primer gesto (ver SoundToggle).
 */
export function unlockAudio() {
  if (typeof window === "undefined") return;
  loadMuted();
  if (!ctx) {
    const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    ctx = new AudioCtor();
  }
  if (ctx.state === "suspended") void ctx.resume().then(sync);
  else sync();
}

export function playMusic(track: Track | null) {
  wantedTrack = track;
  sync();
}

export function playSfx(name: Sfx) {
  if (!ctx || ctx.state !== "running" || muted) return;
  const t = ctx.currentTime;
  const v = SFX_VOLUME;
  switch (name) {
    case "coin":
      tone("square", frequency("B5"), t, 0.07, v);
      tone("square", frequency("E6"), t + 0.07, 0.28, v);
      break;
    case "wrong":
      tone("sawtooth", 220, t, 0.3, v, 70);
      break;
    case "hit":
      noise(t, 0.14, v * 1.6);
      tone("square", 160, t, 0.14, v, 50);
      break;
    case "enter":
      ["C5", "E5", "G5", "C6"].forEach((n, i) => tone("square", frequency(n), t + i * 0.07, 0.1, v));
      break;
    case "bossIntro":
      ["A2", "A2", "C3", "E3", "A3"].forEach((n, i) => tone("sawtooth", frequency(n), t + i * 0.16, 0.2, v));
      break;
    case "win":
      ["C5", "E5", "G5", "C6", "G5", "C6", "E6"].forEach((n, i) =>
        tone("square", frequency(n), t + i * 0.11, i === 6 ? 0.5 : 0.12, v)
      );
      break;
    case "lose":
      ["A4", "F4", "D4", "A3"].forEach((n, i) => tone("square", frequency(n), t + i * 0.2, i === 3 ? 0.6 : 0.22, v));
      break;
  }
}

export function isMuted(): boolean {
  loadMuted();
  return muted;
}

export function getServerMuted(): boolean {
  return false;
}

export function setMuted(value: boolean) {
  muted = value;
  try {
    window.localStorage.setItem(MUTED_KEY, value ? "1" : "0");
  } catch {
    // no es crítico si no se puede guardar la preferencia
  }
  sync();
  for (const listener of listeners) listener();
}

export function subscribeMuted(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
