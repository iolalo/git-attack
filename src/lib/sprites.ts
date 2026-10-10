// Robots en pixel art 2D (16×22), al estilo de los jefes de Mega Man. Se
// definen como mapas de caracteres: cada letra es un color de la paleta y
// "." es transparente.
//   K contorno · H casco · L detalle claro · G gema · S cara · W blanco del ojo
//   E pupila · M boca · T torso · A brazos y botas

/** Lo que lleva el casco: es lo que distingue a un robot de otro a simple vista. */
export type Crest = "plain" | "antenna" | "horns" | "spike" | "dome" | "ears" | "visor" | "twin" | "crown" | "wings";

export interface PersonLook {
  crest: Crest;
  /** Color principal: casco y torso. */
  primary: string;
  /** Color de los detalles: franja del casco, brazos y botas. */
  secondary: string;
  gem?: string;
}

const BASE = [
  "................",
  "....KKKKKKKK....",
  "...KHHHHHHHHK...",
  "..KHHHLLLLHHHK..",
  "..KHHHHGGHHHHK..",
  "..KHHSSSSSSHHK..",
  "..KHSWESSWESHK..",
  "..KHSWESSWESHK..",
  "..KHSSSSSSSSHK..",
  "...KSSSMMSSSK...",
  "....KKKKKKKK....",
  "...KAATTTTAAK...",
  "..KAAKTTTTKAAK..",
  ".KAAAKTLLTKAAAK.",
  ".KAAAKTTTTKAAAK.",
  ".KKKKKTTTTKKKKK.",
  "....KAATTAAK....",
  "...KTTTKKTTTK...",
  "..KAAAK..KAAAK..",
  "..KAAAK..KAAAK..",
  ".KAAAAK..KAAAAK.",
  ".KKKKKK..KKKKKK.",
];

// Filas que reemplazan a las de BASE según el casco.
const CREST_ROWS: Record<Crest, Record<number, string>> = {
  plain: {},
  // una antena con la punta encendida
  antenna: {
    0: ".......KGK......",
    1: "....KKKKLKKK....",
  },
  // dos cuernos, como ramas que se abren
  horns: {
    0: "..KK........KK..",
    1: "..KLKKKKKKKKLK..",
    2: "..KLLHHHHHHLLK..",
  },
  // cresta en punta
  spike: {
    0: "......KLLK......",
    1: "....KKKLLKKK....",
    2: "...KHHHLLHHHK...",
  },
  // cúpula de vidrio
  dome: {
    0: "....KKKKKKKK....",
    1: "...KLLLLLLLLK...",
    2: "..KLLLLLLLLLLK..",
    3: "..KHHHHHHHHHHK..",
  },
  // auriculares redondos a los costados
  ears: {
    5: ".KKKHSSSSSSHKKK.",
    6: ".KLKSWESSWESKLK.",
    7: ".KLKSWESSWESKLK.",
    8: ".KKKSSSSSSSSKKK.",
  },
  // visor de una sola pieza en lugar de ojos
  visor: {
    5: "..KHHHHHHHHHHK..",
    6: "..KKGGGGGGGGKK..",
    7: "..KKGGWGGGWGKK..",
  },
  // dos antenas cortas
  twin: {
    0: "...KK......KK...",
    1: "...KLKKKKKKLK...",
  },
  // corona de tres puntas
  crown: {
    0: "..KK..KKKK..KK..",
    1: "..KLKKKLLKKKLK..",
  },
  // alas a los costados del casco
  wings: {
    2: "KKKKHHHHHHHHKKKK",
    3: "KLLKHHLLLLHHKLLK",
    4: ".KKKHHHGGHHHKKK.",
  },
};

const ANGRY_ROWS: Record<number, string> = { 5: "..KHHKKSSKKHHK.." };
// el visor no tiene cejas: se le enciende
const ANGRY_VISOR_ROWS: Record<number, string> = { 7: "..KKWWGGGGWWKK.." };

export function personRows(look: PersonLook, angry = false): string[] {
  const rows = [...BASE];
  Object.assign(rows, CREST_ROWS[look.crest]);
  if (angry) Object.assign(rows, look.crest === "visor" ? ANGRY_VISOR_ROWS : ANGRY_ROWS);
  return rows;
}

export function personPalette(look: PersonLook): Record<string, string> {
  return {
    K: "#000000",
    H: look.primary,
    L: look.secondary,
    G: look.gem ?? "#fcfcfc",
    S: "#fcd8a8",
    W: "#fcfcfc",
    E: "#000000",
    M: "#a80020",
    T: look.primary,
    A: look.secondary,
  };
}

export interface Hero {
  id: string;
  name: string;
  look: PersonLook;
}

// Robots para elegir, con nombres del mundo de Power BI. El primero es el
// que sale si todavía no elegiste.
export const HEROES: Hero[] = [
  { id: "dax", name: "DAX", look: { crest: "plain", primary: "#0070ec", secondary: "#38b8f8" } },
  { id: "query", name: "Query", look: { crest: "antenna", primary: "#00a844", secondary: "#b8f818", gem: "#fce4a0" } },
  { id: "pixel", name: "Pixel", look: { crest: "twin", primary: "#d82800", secondary: "#fca044" } },
  { id: "kpi", name: "KPI", look: { crest: "ears", primary: "#6844fc", secondary: "#f878f8" } },
];

export function heroLook(heroId?: string): PersonLook {
  return (HEROES.find((hero) => hero.id === heroId) ?? HEROES[0]).look;
}
