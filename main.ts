// news-image-20261124 entry 1 — "The world in one image".
// A dense one-page newspaper digest of Tuesday 24 November 2026, drawn in
// code from news data embedded below. Pure Node 22 stdlib: it reads the font
// atlas shipped beside this file, rasterises text and shapes into an RGB
// buffer, and writes a deterministic 1024x1024 PNG to /output/entry.png.
// No network, no randomness, no clock reads: two runs write identical bytes.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const W = 1024;
const H = 1024;
const MARGIN = 28;
const CW = W - MARGIN * 2;
type RGB = [number, number, number];
const PAPER: RGB = [251, 247, 238];
const INK: RGB = [20, 20, 20];
const MUTED: RGB = [96, 90, 80];
const RULE: RGB = [200, 192, 178];
const RED: RGB = [178, 34, 34];
const NAVY: RGB = [20, 33, 61];
const GOLD: RGB = [176, 132, 24];
const TEAL: RGB = [14, 110, 110];
const WHITE: RGB = [255, 255, 255];
const BAND_BG: RGB = [238, 232, 218];
const MAP_BG: RGB = [232, 238, 242];
const LAND_C: RGB = [120, 130, 145];
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE.push(c >>> 0);
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 0);
  return Buffer.concat([head, data, crc]);
}
function encodePng(rgb: Buffer, width: number, height: number): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let row = 0; row < height; row += 1) {
    raw[row * (width * 3 + 1)] = 0;
    rgb.copy(raw, row * (width * 3 + 1) + 1, row * width * 3, (row + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
// ---- Atlas PNG decode (colour type 6, 8-bit, filters 0-4) ----
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}
function decodeAtlas(path: string): { w: number; h: number; px: Buffer } {
  const buf = readFileSync(path);
  let off = 8;
  let w = 0;
  let h = 0;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    if (type === "IHDR") {
      w = buf.readUInt32BE(off + 8);
      h = buf.readUInt32BE(off + 12);
    }
    if (type === "IDAT") idat.push(buf.subarray(off + 8, off + 8 + len));
    if (type === "IEND") break;
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const px = Buffer.alloc(w * h * 4);
  for (let row = 0; row < h; row += 1) {
    const filter = raw[row * (stride + 1)];
    const line = raw.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1));
    const prev = row === 0 ? Buffer.alloc(stride) : px.subarray((row - 1) * stride, row * stride);
    const out = px.subarray(row * stride, (row + 1) * stride);
    for (let i = 0; i < stride; i += 1) {
      const left = i >= 4 ? out[i - 4] : 0;
      const up = prev[i];
      const upLeft = i >= 4 ? prev[i - 4] : 0;
      let v = line[i];
      if (filter === 1) v = (v + left) & 0xff;
      if (filter === 2) v = (v + up) & 0xff;
      if (filter === 3) v = (v + ((left + up) >> 1)) & 0xff;
      if (filter === 4) v = (v + paeth(left, up, upLeft)) & 0xff;
      out[i] = v;
    }
  }
  return { w, h, px };
}
type Glyph = [number, number, number, number, number, number, number];
const HERE = dirname(fileURLToPath(import.meta.url));
const ATLAS_GLYPHS = JSON.parse(readFileSync(join(HERE, "atlas.json"), "utf8")).glyphs as Record<string, Glyph>;
const ATLAS_RAW = decodeAtlas(join(HERE, "atlas.png"));
// ---- Canvas ----
const canvas = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H; i += 1) {
  canvas[i * 3] = PAPER[0];
  canvas[i * 3 + 1] = PAPER[1];
  canvas[i * 3 + 2] = PAPER[2];
}
function setPixel(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const o = (y * W + x) * 3;
  canvas[o] = c[0];
  canvas[o + 1] = c[1];
  canvas[o + 2] = c[2];
}
function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy += 1) {
    for (let xx = x0; xx < x1; xx += 1) setPixel(xx, yy, c);
  }
}
function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy += 1) {
    for (let xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx += 1) {
      const dx = xx - cx;
      const dy = yy - cy;
      if (dx * dx + dy * dy <= r * r) setPixel(xx, yy, c);
    }
  }
}
function textWidth(font: string, text: string): number {
  let total = 0;
  for (const ch of text) {
    const g = ATLAS_GLYPHS[`${font}|${ch}`];
    total += g ? g[6] : 6;
  }
  return total;
}
function drawText(x: number, y: number, font: string, text: string, c: RGB): number {
  let pen = x;
  for (const ch of text) {
    const g = ATLAS_GLYPHS[`${font}|${ch}`];
    if (g === undefined) pen += 6;
    if (g !== undefined) {
      const [gx, gy, gw, gh, ox, oy, adv] = g;
      for (let yy = 0; yy < gh; yy += 1) {
        for (let xx = 0; xx < gw; xx += 1) {
          const a = ATLAS_RAW.px[((gy + yy) * ATLAS_RAW.w + gx + xx) * 4 + 3] / 255;
          if (a !== 0) {
            const px = Math.round(pen + ox + xx);
            const py = Math.round(y + oy + yy);
            if (px >= 0 && py >= 0 && px < W && py < H) {
              const o = (py * W + px) * 3;
              canvas[o] = Math.round(c[0] * a + canvas[o] * (1 - a));
              canvas[o + 1] = Math.round(c[1] * a + canvas[o + 1] * (1 - a));
              canvas[o + 2] = Math.round(c[2] * a + canvas[o + 2] * (1 - a));
            }
          }
        }
      }
      pen += adv;
    }
  }
  return pen;
}
function wrapLines(font: string, text: string, maxW: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const trial = current === "" ? word : `${current} ${word}`;
    const fits = textWidth(font, trial) <= maxW;
    const prior = current;
    if (fits || prior === "") current = trial;
    if (!fits && prior !== "") {
      lines.push(prior);
      current = word;
    }
  }
  if (current !== "") lines.push(current);
  return lines;
}
function drawWrapped(x: number, y: number, font: string, text: string, maxW: number, lh: number, c: RGB, maxLines: number): number {
  const lines = wrapLines(font, text, maxW).slice(0, maxLines);
  let pen = y;
  for (const line of lines) {
    drawText(x, pen, font, line, c);
    pen += lh;
  }
  return pen;
}
function drawBarRow(x: number, y: number, w: number, label: string, value: number, max: number, c: RGB): void {
  drawText(x, y, "sans13", label, INK);
  fillRect(x + 108, y + 3, w - 138, 7, RULE);
  fillRect(x + 108, y + 3, Math.max(4, Math.round(((w - 138) * value) / max)), 7, c);
  const vLabel = String(value);
  drawText(x + w - textWidth("sans13", vLabel), y, "sans13", vLabel, INK);
}
// ---- World map (72 x 36 stylised land grid, '.' ocean, '#' land) ----
const LAND: string[] = [
  "........................................................................",
  "........................................................................",
  "................................................############............",
  "........#######......###.....................##############.............",
  ".....############...###....................#################............",
  ".....#############.......................####################...........",
  "......############.......................###################............",
  ".......##########........................##################.............",
  "........########..........................###############...............",
  ".........#######.......###.................##############...............",
  "..........######.......##..................###########..................",
  "...........###........................###########.......................",
  "............##........................############......................",
  ".............#........................############......................",
  ".....................................###########........................",
  ".....................................##########.........................",
  "......................................#########.........................",
  ".................######.................#######.........................",
  "................#######.................#######.........................",
  "................#######..................######.........................",
  ".................######..................######.........................",
  ".................#####....................####..........................",
  ".................####.....................####..........................",
  ".................###......................##............................",
  ".........................##.....................#######.................",
  ".........................##....................#########................",
  ".........................#.....................########.................",
  ".........................#......................######..................",
  ".........................#.......................####...................",
  ".........................#..............................................",
  ".........................#..............................................",
  "........................................................................",
  "........................................................................",
  "........................................................................",
  "........................................................................",
  "........................................................................",
];
const PINS: [number, number, string][] = [
  [10, 8, "1"], [39, 12, "2"], [40, 9, "3"], [55, 11, "4"],
  [47, 4, "6"], [41, 11, "7"], [48, 10, "8"], [35, 8, "9"],
];
function drawMap(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, MAP_BG);
  const cw = w / 72;
  const ch = h / 36;
  for (let row = 0; row < 36; row += 1) {
    for (let col = 0; col < 72; col += 1) {
      if (LAND[row][col] === "#") {
        fillCircle(x + (col + 0.5) * cw, y + (row + 0.5) * ch, 1.6, LAND_C);
      }
    }
  }
  for (const [col, row, n] of PINS) {
    const px = x + (col + 0.5) * cw;
    const py = y + (row + 0.5) * ch;
    fillCircle(px, py, 9, WHITE);
    fillCircle(px, py, 7, RED);
    drawText(px - 3, py - 6, "bold16", n, WHITE);
  }
}
// ---- News data: 12 cards + 24 briefs = 36 stories ----
interface Card { tag: string; color: RGB; head: string; deck: string }
const CARDS: Card[] = [
  { tag: "TECH · UNITED STATES", color: NAVY, head: "Huang is back at Nvidia", deck: "Board reinstates CEO after Trump push; shares jump 35%." },
  { tag: "WAR · LIBYA", color: RED, head: "Ukraine hits Russian ships off Libya", deck: "Corvette sunk at Benghazi; war reaches the Med." },
  { tag: "CLIMATE · TÜRKIYE", color: TEAL, head: "COP31 ends with no fossil-fuel deal", deck: "Divided summit closes in Antalya; critics call it a failure." },
  { tag: "ASIA · INDONESIA", color: GOLD, head: "Factory fire kills 24 in Banten", deck: "Rescuers search for ~30 missing after candy-plant blaze." },
  { tag: "MARKETS · GLOBAL", color: NAVY, head: "Wall Street and Nikkei roar back", deck: "Nvidia bounce lifts US stocks; Nikkei jumps 2,000+ points." },
  { tag: "SECURITY · SPACE", color: RED, head: "Kremlin ‘plans nukes in space’", deck: "Reports say Moscow readies orbital arms; UN talks stall." },
  { tag: "MIDDLE EAST · GAZA", color: TEAL, head: "Gaza’s soil and water poisoned", deck: "Oxfam report: explosives left toxic contamination everywhere." },
  { tag: "ENERGY · HORMUZ", color: GOLD, head: "Three tankers explode in Hormuz", deck: "Oil-spill disaster feared; effects ‘visible for 40 years’." },
  { tag: "EUROPE · SPAIN", color: NAVY, head: "Puigdemont amnesty closes procés", deck: "Spain’s top court ends Catalan case; election debate rages." },
  { tag: "SPORT · TURIN", color: TEAL, head: "Alcaraz takes first ATP Finals", deck: "Beats Zverev; Verstappen wins in Vegas; chess crown begins." },
  { tag: "SCIENCE · GLOBAL", color: GOLD, head: "Riemann proof claim stirs maths", deck: "A claimed proof of the great conjecture." },
  { tag: "POLITICS · KOREA", color: RED, head: "Kim snubs Trump’s outreach", deck: "WSJ: outreach ‘ignored’ as build-up grows." },
];
const BRIEFS: string[] = [
  "Kyiv region hit by Russian drones; several killed, more missing",
  "Russian cargo ship Sparta II ablaze after drone strike off Finland",
  "US seizes $1.1B in crypto from North Korean hackers",
  "UN talks on killer robots end with no pact",
  "Modi opens India–Nepal rail link and an AI centre at IIT Patna",
  "India and China hold border talks in Arunachal Pradesh",
  "Pant’s 128 sets record as India–NZ Test ends in a draw",
  "Lisbon streets fill in protest at the cost of living",
  "Myanmar slams ASEAN decision as ‘unfair’",
  "Dhaka vows to arrest Hasina if she returns from India",
  "China sets 2030 targets for elderly care and childcare",
  "Seoul reshuffle: new foreign minister and spy chief named",
  "Armenia proposes a new constitution for peace with Azerbaijan",
  "Kate speaks openly on cancer in an emotional documentary",
  "London Tube strikes disrupt the week’s commute",
  "Masked attacker injures three at a Greens office in Germany",
  "SPD delegates back moves to ban the AfD",
  "Sensex sheds 1,484 points as Indian markets slide",
  "SpiceJet crisis deepens; pilots seek ministry help",
  "UN chief wants an AI risk framework within a year",
  "Taliban erase women’s names from papers in Balkh",
  "Russian war dead pass 700,000, Mediazona counts",
  "Zelenskyy sets a date for Gripen jets to reach Ukraine",
  "Ferrari unveils two new 296 models in Spain",
];
const NUMBERS: [string, string][] = [
  ["+35%", "Nvidia shares on Huang’s return"],
  ["700,000+", "Russian war dead confirmed"],
  ["24", "killed in Banten factory fire"],
  ["$1.1B", "crypto seized, N. Korea"],
  ["2,000+", "points gained by the Nikkei"],
];
const REGIONS: [string, number][] = [
  ["Europe", 15], ["Asia", 11], ["Global", 4], ["N. America", 2],
  ["Middle East", 2], ["Africa", 1], ["Oceania", 1],
];
const FIELD_LINE = "BY SUBJECT  ·  Politics 10  ·  War & Security 7  ·  Society 7  ·  Economy 5  ·  Tech 3  ·  Sport 2  ·  Climate 1  ·  Science 1";
function drawCard(x: number, y: number, w: number, h: number, card: Card, num: number): void {
  fillRect(x, y, w, h, WHITE);
  fillRect(x, y, w, 3, card.color);
  fillRect(x, y, 3, h, card.color);
  drawText(x + 10, y + 8, "bold16", `${num} · ${card.tag}`, card.color);
  drawWrapped(x + 10, y + 26, "bold20", card.head, w - 20, 20, INK, 2);
  drawWrapped(x + 10, y + 68, "sans13", card.deck, w - 20, 13, MUTED, 2);
}
function main(): void {
  let pen = 14;
  fillRect(MARGIN, pen, CW, 3, RED);
  pen += 9;
  drawText(MARGIN, pen, "bold40", "THE WORLD IN ONE IMAGE", INK);
  const dateW = textWidth("bold20", "TUESDAY 24 NOVEMBER 2026");
  drawText(MARGIN + CW - dateW, pen + 12, "bold20", "TUESDAY 24 NOVEMBER 2026", RED);
  pen += 44;
  fillRect(MARGIN, pen, CW, 2, INK);
  pen += 7;
  drawText(MARGIN, pen, "sans13", "36 STORIES FROM 20 COUNTRIES  ·  ALL TIME ZONES  ·  DRAWN IN CODE, NO NETWORK", MUTED);
  pen += 20;
  // Lead story
  const leadY = pen;
  fillRect(MARGIN, leadY, CW, 96, NAVY);
  drawText(MARGIN + 14, leadY + 8, "bold16", "THE COMEBACK OF THE DAY — TECHNOLOGY · UNITED STATES", GOLD);
  drawWrapped(MARGIN + 14, leadY + 26, "bold26", "Trump pressed Nvidia to bring back Jensen Huang — 11 days after his ousting, the board caved", CW - 28, 27, WHITE, 2);
  drawText(MARGIN + 14, leadY + 78, "sans13", "Shares jumped 35% as the CEO returned to cheers; a Senate hearing is set for 3 December.", [210, 218, 232]);
  pen = leadY + 96 + 10;
  // Map + region tally
  const mapY = pen;
  drawText(MARGIN, mapY, "bold20", "WHERE IT HAPPENED", INK);
  drawMap(MARGIN, mapY + 22, 610, 112);
  const tallyX = MARGIN + 626;
  drawText(tallyX, mapY, "bold20", "THE DAY IN NUMBERS", INK);
  const regionColors: RGB[] = [NAVY, TEAL, GOLD, RED, [90, 90, 110], [120, 90, 60], MUTED];
  REGIONS.forEach(([label, value], idx) => {
    drawBarRow(tallyX, mapY + 24 + idx * 17, 342, label, value, 15, regionColors[idx]);
  });
  pen = mapY + 22 + 112 + 10;
  // Cards
  drawText(MARGIN, pen, "bold20", "TWELVE STORIES THAT DEFINED THE DAY", INK);
  pen += 24;
  const cardW = 236;
  const cardH = 96;
  const gap = 8;
  for (let idx = 0; idx < CARDS.length; idx += 1) {
    const col = idx % 4;
    const row = Math.floor(idx / 4);
    drawCard(MARGIN + col * (cardW + gap), pen + row * (cardH + gap), cardW, cardH, CARDS[idx], idx + 1);
  }
  pen += 3 * cardH + 2 * gap + 10;
  // Numbers strip
  fillRect(MARGIN, pen, CW, 58, BAND_BG);
  const statW = CW / 5;
  NUMBERS.forEach(([big, small], idx) => {
    const sx = MARGIN + idx * statW + 12;
    drawText(sx, pen + 6, "bold26", big, RED);
    drawWrapped(sx, pen + 32, "sans13", small, statW - 24, 13, INK, 2);
  });
  pen += 58 + 10;
  // Fields line
  drawText(MARGIN, pen, "sans13", FIELD_LINE, INK);
  pen += 20;
  // Briefs
  drawText(MARGIN, pen, "bold20", "THE REST OF THE DAY — 24 MORE", INK);
  pen += 24;
  const colW = Math.floor((CW - 24) / 2);
  for (let idx = 0; idx < BRIEFS.length; idx += 1) {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const bx = MARGIN + col * (colW + 24);
    const by = pen + row * 16;
    drawText(bx, by, "bold16", String(idx + 1).padStart(2, "0"), RED);
    drawText(bx + 26, by, "sans13", BRIEFS[idx], INK);
  }
  pen += 12 * 16 + 6;
  fillRect(MARGIN, pen, CW, 2, INK);
  pen += 7;
  drawText(MARGIN, pen, "sans13", "Sources: front pages of 20 countries via The Hear, 24 Nov 2026 00:30 UTC, plus wire reports. 36 stories: 12 cards + 24 briefs.", MUTED);
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "entry.png"), encodePng(canvas, W, H));
}
main();
