<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Git Attack: contexto del proyecto

- Juego 8-bit para aprender Git y GitHub con Power BI, hermano de Number Attack. Online en https://git-attack.vercel.app.
- Estética: arcade de NES, siguiendo a Mega Man (jefes "X Man", sprites en `src/lib/sprites.ts`). Todo lo visual va en 8-bit.
- Sin backend: Git es un simulador en memoria (`src/lib/git/sim.ts`); el progreso vive en `localStorage`.
- Idioma de la interfaz y los textos: español rioplatense (voseo).
- Después de tocar un desafío o el simulador: `npm run check`. Antes de integrar: `npm run lint` y `npm run build`.
- Deploy manual con la CLI de Vercel (`vercel --prod`); no hay integración automática con GitHub.
- Ramas: se trabaja en `dev` y se integra a `master` recién cuando está terminado.
