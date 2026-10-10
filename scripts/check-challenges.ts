// Control de contenido: corre cada desafío contra el simulador y avisa si
// la respuesta modelo no cumple la meta o si alguna opción "incorrecta" sí
// la cumple. Uso: npm run check

import { allExercises } from "../src/lib/challenges";
import { buildRepo, run } from "../src/lib/git/sim";
import { LESSONS, MACHETE } from "../src/lib/lessons";
import { ROOMS } from "../src/lib/rooms";
import { TOPIC_ORDER } from "../src/lib/types";

const problems: string[] = [];
const exercises = allExercises();

for (const exercise of exercises) {
  const fail = (message: string) => problems.push(`${exercise.templateId}: ${message}`);
  if (exercise.wrong.length < 3) fail("necesita al menos 3 opciones incorrectas");
  if (new Set([exercise.solution.join(" && "), ...exercise.wrong]).size !== exercise.wrong.length + 1) {
    fail("tiene opciones repetidas");
  }
  if (exercise.kind === "concept") continue;

  let before;
  try {
    before = buildRepo(exercise.setup);
  } catch (error) {
    fail(String(error));
    continue;
  }

  // la respuesta modelo, paso a paso: la meta se cumple recién al final
  let repo = before;
  const commands = [];
  let solved = false;
  for (const [i, step] of exercise.solution.entries()) {
    const result = run(repo, step);
    if (!result.ok) fail(`el paso "${step}" falla: ${result.output.join(" / ")}`);
    repo = result.repo;
    commands.push(...result.commands);
    solved = exercise.goal!({ repo, before, commands });
    if (solved && i < exercise.solution.length - 1) fail(`la meta se cumple antes del último paso ("${step}")`);
  }
  if (!solved) fail("la respuesta modelo no cumple la meta");

  // y también escrita en una sola línea, como se muestra en las opciones
  const joined = run(before, exercise.solution.join(" && "));
  if (!exercise.goal!({ repo: joined.repo, before, commands: joined.commands })) {
    fail("la respuesta modelo en una línea no cumple la meta");
  }

  for (const wrong of exercise.wrong) {
    const result = run(before, wrong);
    if (exercise.goal!({ repo: result.repo, before, commands: result.commands })) {
      fail(`la opción incorrecta "${wrong}" cumple la meta`);
    }
  }
}

for (const topic of TOPIC_ORDER) {
  const tiers = [0, 1, 2].map((tier) => exercises.filter((e) => e.topic === topic && e.tier === tier).length);
  console.log(`${topic.padEnd(10)} Pasante ${tiers[0]} · Junior ${tiers[1]} · Senior ${tiers[2]}`);
  if (tiers[0] < 8) problems.push(`${topic}: hacen falta 8 desafíos de Pasante para llenar una ronda`);
}

// cada escenario necesita su lección (con comandos que funcionen) y su machete
for (const room of ROOMS) {
  const lesson = LESSONS[room.id];
  if (!lesson) problems.push(`${room.id}: falta la lección`);
  if (!MACHETE[room.id]?.length) problems.push(`${room.id}: falta el machete`);
  if (!lesson) continue;
  try {
    let repo = buildRepo(lesson.setup);
    for (const slide of lesson.slides) {
      for (const line of [...(slide.before ?? []), ...(slide.cmd ? [slide.cmd] : [])]) {
        const result = run(repo, line);
        if (!result.ok) problems.push(`${room.id}: la lección falla en "${line}": ${result.output.join(" / ")}`);
        repo = result.repo;
      }
    }
  } catch (error) {
    problems.push(`${room.id}: ${String(error)}`);
  }
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problema(s):`);
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}
console.log(`\n✓ ${exercises.length} desafíos y ${ROOMS.length} lecciones verificados`);
