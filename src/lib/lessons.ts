// Lo que se muestra fuera de los desafíos: la mini lección de cada escenario
// (se ve la primera vez que entrás) y el machete de comandos que te llevás al
// ganarle al jefe.

export interface LessonSlide {
  text: string;
  /** Preparativos que no se muestran (por ejemplo, editar un archivo). */
  before?: string[];
  /** El comando que se corre a la vista, para ver qué le hace al repositorio. */
  cmd?: string;
}

export interface Lesson {
  /** Cómo arranca el repositorio de la lección. */
  setup: string[];
  slides: LessonSlide[];
}

const w = (file: string, text: string) => `write ${file} "${text}"`;

const BASE = ["git init", w("Medidas.tmdl", "version 1"), "git add .", 'git commit -m "Primer commit"'];
const TWO = [...BASE, w("Ventas.tmdl", "borrador"), "git add .", 'git commit -m "Agrega Ventas.tmdl"'];
const THREE = [...TWO, w("Medidas.tmdl", "version 2"), 'git commit -am "Actualiza Medidas.tmdl"'];
const URL = "https://github.com/gpi/ventas.git";

/** Una lección por escenario (por id de ROOMS). */
export const LESSONS: Record<string, Lesson> = {
  workspace: {
    setup: [w("Ventas.pbip", "informe de ventas")],
    slides: [
      { text: "Tu informe es una carpeta común. Git todavía no existe acá: nadie anota qué cambia ni quién lo cambió." },
      { cmd: "git init", text: "git init convierte la carpeta en un repositorio. Desde ahora Git puede guardar su historial." },
      {
        cmd: "git status",
        text: "git status cuenta cómo está todo. El monitor muestra lo mismo en tres zonas: la CARPETA (lo que editás), el STAGING (lo que preparaste) y el HISTORIAL (lo ya guardado).",
      },
    ],
  },
  modelo: {
    setup: ["git init", w("Medidas.tmdl", "version 1")],
    slides: [
      { text: "Creaste Medidas.tmdl. Aparece en la carpeta con un «?»: Git lo ve, pero todavía no lo guarda." },
      { cmd: "git add Medidas.tmdl", text: "git add lo pasa al staging: la lista de lo que va a entrar en el próximo commit." },
      {
        cmd: 'git commit -m "Agrega las medidas"',
        text: "git commit saca la foto. El cambio queda en el historial, con un mensaje que explica qué hiciste.",
      },
    ],
  },
  historial: {
    setup: THREE,
    slides: [
      { cmd: "git log --oneline", text: "Cada commit tiene un código (hash) y un mensaje. git log los lista, del más nuevo al más viejo." },
      {
        before: [w("Medidas.tmdl", "version 3")],
        cmd: "git diff",
        text: "git diff muestra línea por línea lo que cambiaste y todavía no guardaste: «-» lo que salió, «+» lo que entró.",
      },
      { cmd: "git show", text: "git show abre un commit: su mensaje y exactamente qué cambió. Sin nada más, muestra el último." },
    ],
  },
  query: {
    setup: [...TWO, w("Medidas.tmdl", "paso mal aplicado")],
    slides: [
      { text: "Rompiste Medidas.tmdl: figura como modificado (M) en la carpeta. Todavía no lo guardaste." },
      { cmd: "git restore Medidas.tmdl", text: "git restore lo devuelve a la última versión guardada. Ojo: lo que descartás así no se recupera." },
      {
        before: [w("Medidas.tmdl", "version 2"), "git add Medidas.tmdl"],
        cmd: "git restore --staged Medidas.tmdl",
        text: "Con --staged, restore sólo saca el archivo del staging. Tus cambios siguen en la carpeta.",
      },
    ],
  },
  desarrollo: {
    setup: TWO,
    slides: [
      {
        cmd: "git switch -c fix-iva",
        text: "Una rama es una línea de trabajo aparte. switch -c la crea y te para en ella: mirá la etiqueta HEAD.",
      },
      {
        before: [w("Medidas.tmdl", "version 2")],
        cmd: 'git commit -am "Corrige el IVA"',
        text: "Los commits avanzan sólo la rama donde estás parado. main quedó atrás, intacta.",
      },
      { cmd: "git switch main", text: "Al volver a main, tus archivos vuelven a como estaban ahí. La rama te espera con su trabajo." },
    ],
  },
  integracion: {
    setup: [
      ...TWO,
      "git switch -c fix-iva",
      w("Medidas.tmdl", "version 2"),
      'git commit -am "Corrige el IVA"',
      "git switch main",
      w("Calendario.tmdl", "nuevo"),
      "git add .",
      'git commit -m "Agrega Calendario.tmdl"',
    ],
    slides: [
      { text: "main y fix-iva avanzaron cada una por su lado: el árbol se bifurcó." },
      {
        cmd: "git merge fix-iva",
        text: "Parado en main, git merge trae la otra rama. Como las dos tenían commits propios, nace un commit que las une.",
      },
      {
        text: "Si las dos ramas tocaron la misma línea, Git frena y pregunta: eso es un conflicto. Elegís cómo queda el archivo, git add y git commit.",
      },
    ],
  },
  produccion: {
    setup: THREE,
    slides: [
      {
        cmd: "git revert HEAD",
        text: "git revert deshace un commit agregando otro que hace lo contrario. No borra nada: es lo seguro para lo que ya compartiste.",
      },
      {
        cmd: "git reset --hard HEAD~2",
        text: "git reset mueve la rama hacia atrás y esos commits desaparecen. Con --hard también pisa tus archivos: sólo para lo que nadie más tiene.",
      },
      {
        before: [w("Medidas.tmdl", "a medias")],
        cmd: "git stash",
        text: "git stash guarda los cambios a medias en un cajón y deja la carpeta limpia. Vuelven con git stash pop.",
      },
    ],
  },
  remoto: {
    setup: [...TWO, "publish", "unclone"],
    slides: [
      { text: "En GitHub hay una copia del repositorio que comparte todo el equipo: el remoto. En tu compu, todavía nada." },
      { cmd: `git clone ${URL}`, text: "git clone baja todo, con su historial. La etiqueta origin/main marca dónde está main en GitHub." },
      { cmd: "git remote -v", text: "«origin» es el apodo del remoto. Lo que commitees de ahora en más queda en tu compu hasta que lo subas." },
    ],
  },
  subida: {
    setup: [...TWO, "publish", w("Medidas.tmdl", "version 2"), 'git commit -am "Actualiza Medidas.tmdl"'],
    slides: [
      { cmd: "git status", text: "Tenés un commit que GitHub no tiene: tu main está adelantada a origin/main." },
      { cmd: "git push", text: "git push sube tus commits. origin/main alcanza a tu main: el equipo ya puede verlos." },
      { text: "Si alguien subió antes que vos, el push se rechaza. No se fuerza: primero se baja lo del otro con git pull." },
    ],
  },
  novedades: {
    setup: [...TWO, "publish", 'teammate main Calendario.tmdl "nuevo" "Agrega Calendario.tmdl"'],
    slides: [
      { text: "Un compañero subió un commit a GitHub. En tu compu no cambió nada: Git no consulta al remoto por su cuenta." },
      { cmd: "git fetch", text: "git fetch baja las novedades sin tocar tu rama: origin/main se adelanta, tu main no." },
      { cmd: "git pull", text: "git pull hace las dos cosas: baja e integra. Ahora tu main tiene lo último del equipo." },
    ],
  },
  revision: {
    setup: [...TWO, "publish", "git switch -c fix-iva", w("Medidas.tmdl", "version 2"), 'git commit -am "Corrige el IVA"'],
    slides: [
      { cmd: "git push -u origin fix-iva", text: "Para pedir revisión, tu rama tiene que estar en GitHub. -u la sube y la deja enlazada." },
      {
        cmd: "gh pr create",
        text: "El pull request pide que revisen tu rama antes de fusionarla en main. En la web es el botón «Compare & pull request».",
      },
      { cmd: "gh pr merge", text: "Aprobado y fusionado... en GitHub. Tu main local todavía no se enteró." },
      { before: ["git switch main"], cmd: "git pull", text: "Volvés a main y bajás la fusión. Ese es el circuito completo de trabajo en equipo." },
    ],
  },
};

export interface MacheteEntry {
  cmd: string;
  what: string;
}

/** Los comandos que te llevás de cada escenario (por id de ROOMS). */
export const MACHETE: Record<string, MacheteEntry[]> = {
  workspace: [
    { cmd: "git init", what: "Convierte la carpeta en un repositorio" },
    { cmd: "git status", what: "Muestra en qué rama estás y qué cambió" },
    { cmd: "git status -s", what: "Lo mismo, en una línea por archivo" },
  ],
  modelo: [
    { cmd: "git add <archivo>", what: "Prepara un archivo para el próximo commit" },
    { cmd: "git add .", what: "Prepara todos los cambios" },
    { cmd: 'git commit -m "mensaje"', what: "Guarda lo preparado en el historial" },
    { cmd: 'git commit -am "mensaje"', what: "Prepara y guarda lo ya seguido, en un paso" },
  ],
  historial: [
    { cmd: "git log --oneline", what: "Historial resumido, un commit por línea" },
    { cmd: "git log --oneline --graph --all", what: "Todas las ramas, con el dibujo" },
    { cmd: "git diff", what: "Qué cambiaste y todavía no preparaste" },
    { cmd: "git diff --staged", what: "Qué va a entrar en el commit" },
    { cmd: "git show <commit>", what: "Un commit completo (HEAD~1 = el anterior)" },
  ],
  query: [
    { cmd: "git restore <archivo>", what: "Descarta los cambios de un archivo" },
    { cmd: "git restore --staged <archivo>", what: "Lo saca del staging, sin perder cambios" },
    { cmd: 'git commit --amend -m "mensaje"', what: "Corrige el último commit" },
    { cmd: "git rm --cached <archivo>", what: "Deja de seguir un archivo, sin borrarlo" },
    { cmd: 'echo "*.abf" > .gitignore', what: "Hace que Git ignore esos archivos" },
  ],
  desarrollo: [
    { cmd: "git branch", what: "Lista las ramas" },
    { cmd: "git switch -c <rama>", what: "Crea una rama y te pasa a ella" },
    { cmd: "git switch <rama>", what: "Cambia de rama" },
    { cmd: "git branch -d <rama>", what: "Borra una rama ya fusionada" },
    { cmd: "git checkout <commit>", what: "Mira un commit viejo (HEAD desacoplada)" },
  ],
  integracion: [
    { cmd: "git merge <rama>", what: "Trae esa rama a la rama donde estás" },
    { cmd: "git merge --abort", what: "Cancela un merge con conflictos" },
    { cmd: "git checkout --theirs <archivo>", what: "En un conflicto, elige la versión que entra" },
    { cmd: "git rebase <rama>", what: "Apoya tus commits arriba de esa rama" },
  ],
  produccion: [
    { cmd: "git revert <commit>", what: "Deshace un commit con otro commit" },
    { cmd: "git reset --soft HEAD~1", what: "Deshace el commit, deja los cambios preparados" },
    { cmd: "git reset --hard HEAD~1", what: "Borra el commit y sus cambios" },
    { cmd: "git stash / git stash pop", what: "Guarda cambios a medias y los recupera" },
    { cmd: "git cherry-pick <commit>", what: "Copia un commit puntual a tu rama" },
  ],
  remoto: [
    { cmd: "git clone <url>", what: "Baja un repositorio completo" },
    { cmd: "git remote -v", what: "Muestra a qué remoto estás conectado" },
    { cmd: "git remote add origin <url>", what: "Conecta un repositorio local con el remoto" },
    { cmd: "git branch -r", what: "Lista las ramas del remoto" },
  ],
  subida: [
    { cmd: "git push", what: "Sube tus commits" },
    { cmd: "git push -u origin <rama>", what: "Sube una rama nueva y la deja enlazada" },
    { cmd: "git push origin --delete <rama>", what: "Borra una rama del remoto" },
  ],
  novedades: [
    { cmd: "git fetch", what: "Baja las novedades sin tocar tu rama" },
    { cmd: "git pull", what: "Baja las novedades y las integra" },
    { cmd: "git pull --rebase", what: "Lo mismo, dejando el historial recto" },
    { cmd: "git pull origin main", what: "Trae main del remoto a tu rama" },
  ],
  revision: [
    { cmd: "gh pr create", what: "Abre un pull request de tu rama" },
    { cmd: "gh pr list", what: "Lista los pull requests" },
    { cmd: "gh pr merge", what: "Fusiona el pull request en main" },
    { cmd: "Fabric: Confirmar / Actualizar todo", what: "Lleva cambios del workspace a Git y al revés" },
  ],
};
