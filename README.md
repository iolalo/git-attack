# Git Attack

Juego 8-bit para aprender Git desde cero trabajando con Power BI, hermano de Number Attack. Sos analista de BI y tu
informe está guardado como proyecto (`.pbip`): en cada escenario hay cinco pedidos y un jefe robot, y cada jefe enseña
un tema. La estética sigue a los Mega Man de NES.

No usa Git de verdad ni backend: todo corre sobre un repositorio simulado en el navegador, y el progreso se guarda en
`localStorage`.

## Cómo se juega

- **Selección de escenario**: siete escenarios (piso 1, Git en tu compu). Cada uno se abre al ganarle al jefe del anterior.
- **Tres niveles por escenario**: de *Pasante* elegís entre opciones, de *Junior* escribís el comando con una pista y de
  *Senior* lo escribís sin ayuda (y aparecen pedidos de varios pasos).
- **El monitor** muestra la carpeta, el staging y el historial después de cada comando. Escribiendo en la consola se
  puede pedir **ver el objetivo**: el árbol como tiene que quedar.
- **Jefe final**: propone qué haría él. Si está bien lo dejás pasar; si está mal lo frenás y mostrás cómo era.
- **Repaso**: lo que errás vuelve en otra sesión hasta que lo resolvés bien.

| Jefe | Escenario | Tema | Comandos |
| --- | --- | --- | --- |
| Init Man | Workspace nuevo | Primeros pasos | `init`, `status` |
| Commit Man | Modelo semántico | Guardar cambios | `add`, `commit` |
| Log Man | Linaje de versiones | Historial | `log`, `diff`, `show` |
| Restore Man | Power Query | Deshacer | `restore`, `commit --amend`, `.gitignore` |
| Branch Man | Ambiente DEV | Ramas | `branch`, `switch`, HEAD desacoplada |
| Merge Man | Integración | Merge y conflictos | `merge`, `rebase` |
| Reset Man | Producción | Viajar en el tiempo | `reset`, `revert`, `stash`, `cherry-pick` |

Los desafíos usan archivos de un proyecto de Power BI (`Medidas.tmdl`, `paginas.json`, `cache.abf`) y ramas como
`fix-iva` o `medida-margen`. El recorrido de temas toma ideas de [Learn Git Branching](https://learngitbranching.js.org/).

**Piso 2 · GitHub** (se abre al ganarle a Reset Man). El simulador tiene un remoto, un compañero que también sube
commits y pull requests (con `gh`):

| Jefe | Escenario | Tema | Comandos |
| --- | --- | --- | --- |
| Clone Man | Repositorio remoto | El remoto | `clone`, `remote` |
| Push Man | Subida a GitHub | Subir cambios | `push`, `push -u`, push rechazado |
| Pull Man | Novedades del equipo | Bajar cambios | `fetch`, `pull`, `pull --rebase` |
| Review Man | Pull request | Trabajo en equipo | `gh pr create`, `gh pr merge`, integración de Git de Fabric |

Además:

- **Mini lección** al entrar por primera vez a cada escenario (`src/lib/lessons.ts`), que corre los comandos a la vista.
- **Misiones de circuito completo** en el nivel Senior de Merge Man y Review Man (rama → commit → subida → pull request
  → fusión → main al día).
- **Machete** (`/machete`): los comandos de cada jefe vencido.
- **Consola libre** (`/sandbox`): un repositorio de prueba para tirar comandos sin puntaje.

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:3000
npm run check    # verifica los desafíos contra el simulador
npm run lint
npm run build
```

## Dónde está cada cosa

- `src/lib/git/sim.ts` — el simulador de Git: repositorio en memoria y comandos.
- `src/lib/git/graph.ts` — acomoda el historial en columnas para dibujarlo.
- `src/lib/challenges.ts` — los desafíos. Cada uno es una situación, un pedido y una meta que se comprueba sobre el
  repositorio simulado, así que vale cualquier comando que deje las cosas como se pidió.
- `src/lib/rooms.ts` — los sectores y sus jefes.
- `src/lib/storage.ts` — progreso, niveles, repaso y armado de sesiones.
- `scripts/check-challenges.ts` — corre la respuesta modelo de cada desafío (tiene que cumplir la meta) y cada opción
  incorrecta (no tiene que cumplirla). Correlo después de tocar un desafío o el simulador.
- `scripts/make-icons.mjs` — genera los íconos de la app.

## Agregar un desafío

Sumá una entrada a `TEMPLATES` en `src/lib/challenges.ts` con su tema, el nivel desde el que aparece (`tier`) y, si es
de comando, el escenario (`setup`), la respuesta modelo, tres opciones incorrectas, la meta y una pista. Después corré
`npm run check`.
