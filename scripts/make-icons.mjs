// Dibuja el ícono de la app (un grafo de commits en pixel art) y lo guarda
// en todos los tamaños que hacen falta. Sin dependencias: arma el PNG a mano.
// Uso: node scripts/make-icons.mjs

import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const PALETTE = {
  ".": [0, 0, 0],
  B: [0, 112, 236],
  C: [56, 184, 248],
  W: [252, 252, 252],
  Y: [252, 228, 160],
  P: [248, 88, 152],
};

// Grafo de commits: main baja por la izquierda con dos commits (nodos blancos)
// y una rama rosa se abre hacia un tercer commit, arriba a la derecha.
const GRID = 16;
const cells = Array.from({ length: GRID }, (_, y) =>
  Array.from({ length: GRID }, (_, x) => (x === 0 || y === 0 || x === GRID - 1 || y === GRID - 1 ? "B" : "."))
);
const put = (y, x, c) => {
  cells[y][x] = c;
};
const node = (y, x, ring, center) => {
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) put(y + dy, x + dx, ring);
  put(y + 1, x + 1, center);
};
for (let y = 5; y <= 10; y++) put(y, 4, "C"); // main
node(2, 3, "W", "C"); // commit de arriba
node(11, 3, "W", "C"); // commit de abajo
for (const [y, x] of [[10, 5], [9, 6], [8, 7], [7, 8], [6, 9], [5, 10]]) put(y, x, "P"); // rama
node(2, 10, "Y", "P"); // commit de la rama
const ART = cells.map((row) => row.join(""));

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const check = Buffer.alloc(4);
  check.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, check]);
}

function png(size) {
  const grid = ART.length;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    for (let x = 0; x < size; x++) {
      const [r, g, b] = PALETTE[ART[Math.floor((y * grid) / size)][Math.floor((x * grid) / size)]];
      raw.set([r, g, b, 255], row + 1 + x * 4);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const FILES = { "src/app/icon.png": 32, "src/app/apple-icon.png": 180, "public/icon-192.png": 192, "public/icon-512.png": 512 };
for (const [path, size] of Object.entries(FILES)) writeFileSync(path, png(size));
console.log(`Íconos generados: ${Object.keys(FILES).join(", ")}`);
