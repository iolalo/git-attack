import { PersonLook } from "./sprites";
import { TopicKey } from "./types";

export interface RoomOwner {
  name: string;
  role: string;
  look: PersonLook;
}

/** Un escenario: una etapa del trabajo con un informe de Power BI, que practica un tema de Git. */
export interface RoomMeta {
  id: string;
  name: string;
  emoji: string;
  topic: TopicKey;
  /** Color del escenario: marcas de nivel. */
  color: string;
  blurb: string;
  /** El robot que lo custodia: te va pidiendo cosas y es el jefe final. */
  owner: RoomOwner;
  /** Lo que te dice antes de la pelea final. */
  taunt: string;
  /** El "ataque" del jefe cuando lo que propone está mal. */
  attack: string;
}

/** Los primeros escenarios son el piso 1 (Git en tu compu); el resto, el piso 2 (GitHub). */
export const FLOOR_1_ROOMS = 7;

export function floorOf(roomIndex: number): 1 | 2 {
  return roomIndex < FLOOR_1_ROOMS ? 1 : 2;
}

// Piso 1: Git en tu compu. Los escenarios siguen el camino de un informe de
// Power BI guardado como proyecto (.pbip), del workspace vacío a producción,
// y cada jefe lleva el nombre del comando que enseña. Piso 2: el mismo
// informe, ahora compartido con el equipo en GitHub.
export const ROOMS: RoomMeta[] = [
  {
    id: "workspace",
    name: "Workspace nuevo",
    emoji: "📁",
    topic: "inicio",
    color: "#00a8a8",
    blurb: "El informe todavía es una carpeta suelta. Init Man no deja pasar a nadie que no sepa qué es un repositorio.",
    owner: {
      name: "Init Man",
      role: "Guardián del workspace",
      look: { crest: "dome", primary: "#00a8a8", secondary: "#fcfcfc", gem: "#58d854" },
    },
    taunt: "Sin repositorio no hay historial. ¿Sabés crear uno?",
    attack: "CARPETA SIN GIT",
  },
  {
    id: "modelo",
    name: "Modelo semántico",
    emoji: "💾",
    topic: "guardar",
    color: "#fc7400",
    blurb: "Cada medida nueva tiene que quedar guardada. Aprendé a preparar y guardar los cambios del modelo.",
    owner: {
      name: "Commit Man",
      role: "Custodio de las medidas",
      look: { crest: "plain", primary: "#fc7400", secondary: "#fce4a0", gem: "#f83800" },
    },
    taunt: "Yo guardo todo junto en un commit gigante. ¿O no?",
    attack: "COMMIT A CIEGAS",
  },
  {
    id: "historial",
    name: "Linaje de versiones",
    emoji: "🗄️",
    topic: "historial",
    color: "#a844fc",
    blurb: "¿Quién cambió esa medida, y cuándo? Aprendé a leer el historial del informe.",
    owner: {
      name: "Log Man",
      role: "Archivista del historial",
      look: { crest: "visor", primary: "#6844fc", secondary: "#b8b8f8", gem: "#f83800" },
    },
    taunt: "Vi pasar cada versión de tu informe. ¿Vos sabés leerlas?",
    attack: "HISTORIAL BORROSO",
  },
  {
    id: "query",
    name: "Power Query",
    emoji: "🔧",
    topic: "deshacer",
    color: "#f8b800",
    blurb: "Un paso mal aplicado y se rompe la consulta. Aprendé a deshacer errores antes de que lleguen al historial.",
    owner: {
      name: "Restore Man",
      role: "Reparador de pasos rotos",
      look: { crest: "antenna", primary: "#f8b800", secondary: "#fcfcfc", gem: "#00e8d8" },
    },
    taunt: "Ups, te rompí la consulta. ¿Cómo la arreglamos?",
    attack: "PASO ROTO",
  },
  {
    id: "desarrollo",
    name: "Ambiente DEV",
    emoji: "🌿",
    topic: "ramas",
    color: "#00a800",
    blurb: "Cada pedido del negocio va en su rama, sin tocar lo publicado. Aprendé a crear ramas y a moverte entre ellas.",
    owner: {
      name: "Branch Man",
      role: "Jardinero de ramas",
      look: { crest: "horns", primary: "#00a800", secondary: "#b8f818" },
    },
    taunt: "Cada cambio en su rama. ¿O sos de los que se pierden?",
    attack: "RAMA EQUIVOCADA",
  },
  {
    id: "integracion",
    name: "Integración",
    emoji: "🤝",
    topic: "merge",
    color: "#f878f8",
    blurb: "Dos analistas tocaron la misma medida. Aprendé a fusionar ramas y a resolver conflictos.",
    owner: {
      name: "Merge Man",
      role: "Unificador de modelos",
      look: { crest: "ears", primary: "#d800cc", secondary: "#f8b8f8" },
    },
    taunt: "Juntemos todo de una. Total, ¿qué puede salir mal?",
    attack: "MERGE AL REVÉS",
  },
  {
    id: "produccion",
    name: "Producción",
    emoji: "🚨",
    topic: "tiempo",
    color: "#f83800",
    blurb: "El informe publicado se rompió antes de la reunión de gerencia. Aprendé a volver atrás sin pisar el trabajo de los demás.",
    owner: {
      name: "Reset Man",
      role: "Señor del tiempo",
      look: { crest: "spike", primary: "#d82800", secondary: "#fcfcfc", gem: "#fce4a0" },
    },
    taunt: "Un comando mal tirado y gerencia ve números rotos. ¿Estás seguro?",
    attack: "RESET SALVAJE",
  },
  {
    id: "remoto",
    name: "Repositorio remoto",
    emoji: "☁️",
    topic: "remoto",
    color: "#38b8f8",
    blurb: "El informe ya no vive sólo en tu compu: hay una copia en GitHub para todo el equipo. Aprendé a clonarla y a conectarte.",
    owner: {
      name: "Clone Man",
      role: "Copista del remoto",
      look: { crest: "twin", primary: "#38b8f8", secondary: "#fcfcfc", gem: "#0070ec" },
    },
    taunt: "Hay dos copias del informe: la tuya y la de GitHub. ¿Sabés cuál es cuál?",
    attack: "COPIA FANTASMA",
  },
  {
    id: "subida",
    name: "Subida a GitHub",
    emoji: "⬆️",
    topic: "push",
    color: "#0058f8",
    blurb: "Tus commits no existen para el equipo hasta que los subís. Aprendé a hacer push sin pisar a nadie.",
    owner: {
      name: "Push Man",
      role: "Mensajero de commits",
      look: { crest: "wings", primary: "#0058f8", secondary: "#fca044", gem: "#fce4a0" },
    },
    taunt: "Yo subo todo con --force y que se arreglen. ¿Vos no?",
    attack: "PUSH FORZADO",
  },
  {
    id: "novedades",
    name: "Novedades del equipo",
    emoji: "⬇️",
    topic: "pull",
    color: "#00e8d8",
    blurb: "Mientras vos trabajabas, el equipo subió cambios. Aprendé a bajarlos y a integrarlos con lo tuyo.",
    owner: {
      name: "Pull Man",
      role: "Recolector de novedades",
      look: { crest: "antenna", primary: "#005858", secondary: "#00e8d8", gem: "#fcfcfc" },
    },
    taunt: "¿Hace cuánto que no bajás lo del equipo? Tu main ya es historia antigua.",
    attack: "PULL A CIEGAS",
  },
  {
    id: "revision",
    name: "Pull request",
    emoji: "🔍",
    topic: "pr",
    color: "#f8b800",
    blurb: "Nada llega a main sin que alguien lo revise. Aprendé el circuito completo: rama, subida, pull request y fusión.",
    owner: {
      name: "Review Man",
      role: "Revisor implacable",
      look: { crest: "crown", primary: "#787878", secondary: "#f8b800", gem: "#f83800" },
    },
    taunt: "Yo apruebo sin leer, total es una medida nomás. ¿Qué puede pasar?",
    attack: "APROBADO SIN LEER",
  },
];

export function getRoom(id: string): RoomMeta | undefined {
  return ROOMS.find((room) => room.id === id);
}

export function roomOfTopic(topic: TopicKey): RoomMeta {
  return ROOMS.find((room) => room.topic === topic)!;
}
