"use client";

import { useState } from "react";
import Link from "next/link";
import RepoView from "@/components/RepoView";
import Terminal, { TerminalLine } from "@/components/Terminal";
import { Repo, buildRepo, run } from "@/lib/git/sim";

// De dónde arranca la consola libre: un informe con historia, una rama a
// medio hacer y el remoto ya conectado, para poder probar cualquier comando.
const START = [
  "git init",
  'write Medidas.tmdl "version 1"',
  "git add .",
  'git commit -m "Primer commit"',
  'write Ventas.tmdl "borrador"',
  "git add .",
  'git commit -m "Agrega Ventas.tmdl"',
  "publish",
  "git switch -c fix-iva",
  'write Medidas.tmdl "version 2"',
  'git commit -am "Corrige el IVA"',
  "git switch main",
  'teammate main Calendario.tmdl "nuevo" "Agrega Calendario.tmdl"',
  'write tema.json "colores nuevos"',
];

const IDEAS = ["git status", "git log --oneline --graph --all", "git pull", "git merge fix-iva", "git push"];

interface Sandbox {
  repo: Repo;
  lines: TerminalLine[];
}

const fresh = (): Sandbox => ({ repo: buildRepo(START), lines: [] });

/** Consola libre: sin preguntas ni puntaje, para probar comandos y ver qué le hacen al árbol. */
export default function SandboxPage() {
  const [sandbox, setSandbox] = useState<Sandbox>(fresh);

  function submit(input: string) {
    if (input === "clear") return setSandbox({ ...sandbox, lines: [] });
    const result = run(sandbox.repo, input);
    const kind = result.ok ? "out" : "err";
    setSandbox({
      repo: result.repo,
      lines: [...sandbox.lines, { kind: "cmd", text: input }, ...result.output.map((text): TerminalLine => ({ kind, text }))],
    });
  }

  return (
    <main className="game px-3 py-5 gap-4">
      <div className="flex items-center justify-between px-1">
        <Link href="/" className="text-[8px] uppercase" style={{ color: "var(--foreground-muted)" }}>
          ← volver
        </Link>
        <h1 className="text-xs uppercase" style={{ color: "var(--accent)" }}>
          Consola libre
        </h1>
        <button
          onClick={() => setSandbox(fresh())}
          className="text-[8px] uppercase cursor-pointer"
          style={{ background: "transparent", border: 0, color: "var(--yellow)" }}
        >
          reiniciar
        </button>
      </div>

      <p className="text-[8px] leading-relaxed px-1" style={{ color: "var(--foreground-secondary)" }}>
        Acá no hay preguntas ni puntaje. Probá lo que quieras: tenés una rama sin fusionar, un cambio sin guardar y un
        compañero que ya subió algo a GitHub.
      </p>

      <RepoView repo={sandbox.repo} />
      <Terminal lines={sandbox.lines} onSubmit={submit} />

      <div className="px-1">
        <p className="text-[8px] uppercase mb-2" style={{ color: "var(--foreground-muted)" }}>
          Para empezar
        </p>
        <div className="flex flex-col gap-2">
          {IDEAS.map((idea) => (
            <button key={idea} onClick={() => submit(idea)} className="pixel-btn choice-btn">
              <code className="cmd">{idea}</code>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
