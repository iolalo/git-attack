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

// main baja por la izquierda; una rama se abre hacia la derecha.
const ART = [
  "BBBBBBBBBBBBBBBB",
  "B..............B",
  "B...WW.........B",
  "B...WW.........B",
  "B...CC.....YY..B",
  "B...CC.....YY..B",
  "B...CC.....PP..B",
  "B...WW.....PP..B",
  "B...WW....PP...B",
  "B...CC...PP....B",
  "B...CC..PP.....B",
  "B...CCPPP......B",
  "B...WW.........B",
  "B...WW.........B",
  "B..............B",
  "BBBBBBBBBBBBBBBB",
];

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
