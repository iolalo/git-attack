"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

export interface TerminalLine {
  kind: "cmd" | "out" | "err";
  text: string;
}

interface TerminalProps {
  lines: TerminalLine[];
  /** Sin esto la consola sólo muestra lo que pasó (modo de opciones). */
  onSubmit?: (command: string) => void;
  disabled?: boolean;
}

// Lo que más cuesta encontrar en el teclado del celular.
const QUICK_KEYS = ["git ", "-", '"', ".", "~"];

/** Consola de mentira: muestra los comandos corridos y deja escribir el próximo. */
export default function Terminal({ lines, onSubmit, disabled }: TerminalProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines.length]);

  // En escritorio se puede escribir de una; en el celu no se abre el teclado solo.
  useEffect(() => {
    if (onSubmit && !disabled && window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
  }, [onSubmit, disabled]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const command = value.trim();
    if (!command || !onSubmit || disabled) return;
    onSubmit(command);
    setValue("");
  }

  function typeKey(key: string) {
    setValue(value + key);
    inputRef.current?.focus();
  }

  return (
    <form className="terminal" onSubmit={submit}>
      {lines.length > 0 && (
        <div ref={logRef} className="terminal-log">
          {lines.map((line, i) => (
            <div key={i} className={`line-${line.kind}`}>
              {line.kind === "cmd" ? `$ ${line.text}` : line.text || " "}
            </div>
          ))}
        </div>
      )}
      {onSubmit && (
        <>
          <label className="terminal-input">
            <span aria-hidden>$</span>
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={disabled}
              placeholder="escribí el comando"
              aria-label="Comando"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="go"
            />
          </label>
          <div className="terminal-keys">
            {QUICK_KEYS.map((key) => (
              <button key={key} type="button" onClick={() => typeKey(key)} disabled={disabled}>
                {key.trim()}
              </button>
            ))}
            <button type="submit" className="terminal-run" disabled={disabled || !value.trim()}>
              ▶ Enter
            </button>
          </div>
        </>
      )}
    </form>
  );
}
