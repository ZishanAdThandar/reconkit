/**
 * ReconKit — icon generator (pure Node, no deps).
 * Draws the brand reticle (concentric rings + compass ticks + core dot) on a
 * rounded dark tile and writes RGBA PNGs to icons/.
 *
 * Run: npm run icons
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'icons');
const SIZES = [16, 32, 48, 96, 128];

// Palette (matches app badge / theme tokens)
const BG = [27, 24, 20, 255];       // #1b1814
const ACCENT = [217, 160, 91];      // #d9a05b

/* ------------------------------------------------------------------ *
 * PNG encoding
 * ------------------------------------------------------------------ */
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  const src = Buffer.from(rgba.buffer || rgba, rgba.byteOffset || 0, rgba.byteLength);
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter: none
    src.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/* ------------------------------------------------------------------ *
 * Rasterizer (supersampled SDF-ish)
 * ------------------------------------------------------------------ */
function dist(x1, y1, x2, y2) { return Math.hypot(x1 - x2, y1 - y2); }

/** distance from point (px,py) to segment (ax,ay)-(bx,by) */
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return dist(px, py, ax, ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist(px, py, ax + t * dx, ay + t * dy);
}

function ring(x, y, cx, cy, r, w) { return Math.abs(dist(x, y, cx, cy) - r) <= w / 2; }
function disc(x, y, cx, cy, r) { return dist(x, y, cx, cy) <= r; }

function insideRoundedRect(x, y, half, radius) {
  const dx = Math.abs(x - half) - (half - radius);
  const dy = Math.abs(y - half) - (half - radius);
  if (dx <= 0 || dy <= 0) return true;
  return dx * dx + dy * dy <= radius * radius;
}

function coverage(x, y, s, hit) {
  // 3x3 supersample of the boolean predicate
  const step = 1 / 3;
  let n = 0;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (hit(x + (i - 1) * step, y + (j - 1) * step, s)) n++;
    }
  }
  return n / 9;
}

function sampleColor(sx, sy, s) {
  const c = s / 2;
  const half = s / 2;
  const pad = Math.max(1, s * 0.045);
  const rr = half - pad; // rounded-rect half-size
  const corner = Math.max(1.2, s * 0.22);
  const R1 = s * 0.30;         // outer ring radius
  const R2 = s * 0.155;        // inner ring radius
  const w1 = Math.max(1.2, s * 0.085);
  const w2 = Math.max(1, s * 0.075);
  const tickFrom = s * 0.335;
  const tickTo = s * 0.43;
  const wt = Math.max(1, s * 0.06);
  const dot = Math.max(1.0, s * 0.06);

  const par = (x, y) => {
    if (!insideRoundedRect(x, y, rr, corner)) return false;
    if (ring(x, y, c, c, R1, w1)) return true;
    if (ring(x, y, c, c, R2, w2)) return true;
    if (disc(x, y, c, c, dot)) return true;
    for (const a of [0, 90, 180, 270]) {
      const rad = (a * Math.PI) / 180;
      const ax = c + Math.cos(rad) * tickFrom, ay = c + Math.sin(rad) * tickFrom;
      const bx = c + Math.cos(rad) * tickTo, by = c + Math.sin(rad) * tickTo;
      if (segDist(x, y, ax, ay, bx, by) <= wt / 2) return true;
    }
    return false;
  };

  const cov = coverage(sx, sy, s, par);
  if (cov <= 0) return null; // transparent
  // outside the tile we're transparent; inside we blend accent over bg
  let r, g, b, a;
  const aBg = cov;
  // composite accent over bg using coverage as accent alpha
  const t = cov;
  r = Math.round(ACCENT[0] * t + BG[0] * (1 - t));
  g = Math.round(ACCENT[1] * t + BG[1] * (1 - t));
  b = Math.round(ACCENT[2] * t + BG[2] * (1 - t));
  a = 255;
  // feather the rounded-rect edge slightly using the tile predicate in coverage
  const tileCov = coverage(sx, sy, s, (x, y) => insideRoundedRect(x, y, rr, corner));
  if (tileCov < 1) { r = BG[0]; g = BG[1]; b = BG[2]; a = Math.round(255 * tileCov); }
  return [r, g, b, a];
}

function buildIcon(s) {
  const px = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const col = sampleColor(x + 0.5, y + 0.5, s);
      const o = (y * s + x) * 4;
      if (!col) { px[o + 3] = 0; continue; }
      px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = col[3];
    }
  }
  return px;
}

mkdirSync(OUT, { recursive: true });
for (const s of SIZES) {
  const png = encodePNG(s, s, buildIcon(s));
  const file = join(OUT, `icon-${s}.png`);
  writeFileSync(file, png);
  console.log(`wrote ${file} (${png.length} bytes)`);
}