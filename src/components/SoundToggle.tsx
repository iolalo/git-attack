"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Track, getServerMuted, isMuted, playMusic, setMuted, subscribeMuted, unlockAudio } from "@/lib/audio";

/** Pone la música de la pantalla actual (null = silencio) mientras esté montada. */
export function useMusic(track: Track | null) {
  useEffect(() => {
    playMusic(track);
  }, [track]);

  // El audio recién puede arrancar con el primer toque o tecla del usuario.
  useEffect(() => {
    window.addEventListener("pointerdown", unlockAudio);
    window.addEventListener("keydown", unlockAudio);
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);
}

export default function SoundToggle({ className = "" }: { className?: string }) {
  const muted = useSyncExternalStore(subscribeMuted, isMuted, getServerMuted);
  return (
    <button
      onClick={() => setMuted(!muted)}
      className={`text-[8px] uppercase cursor-pointer ${className}`}
      style={{ background: "transparent", border: 0, color: muted ? "var(--foreground-muted)" : "var(--yellow)" }}
      aria-pressed={!muted}
    >
      ♪ {muted ? "off" : "on"}
    </button>
  );
}
