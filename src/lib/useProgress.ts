"use client";

import { useSyncExternalStore } from "react";
import { getProgress, getServerProgressSnapshot, subscribeProgress } from "./storage";
import { PersonLook, heroLook } from "./sprites";
import type { ProgressData } from "./types";

/** Lee el progreso guardado y se re-renderiza cuando cambia (nueva sesión, reset). */
export function useProgress(): ProgressData {
  return useSyncExternalStore(subscribeProgress, getProgress, getServerProgressSnapshot);
}

/** El personaje que elegiste (o el de siempre, si todavía no elegiste). */
export function useHeroLook(): PersonLook {
  return heroLook(useProgress().heroId);
}

const noopSubscribe = () => () => {};

/**
 * false durante el SSR y la hidratación, true después: para lo que depende
 * de lo guardado en el navegador y no puede salir en el HTML del servidor.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
