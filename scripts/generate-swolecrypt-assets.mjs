import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const content = fs.readFileSync(path.join(root, 'src', 'dungeonContent.ts'), 'utf8');
const out = path.join(root, 'public', 'dungeon');

const palettes = {
  pink: ['#ff2aa3', '#00f5ff', '#f0e6ff', '#1a0614'],
  cyan: ['#00f5ff', '#b44dff', '#f0e6ff', '#04151a'],
  violet: ['#b44dff', '#ff2aa3', '#00f5ff', '#10061a'],
  green: ['#05ffa1', '#00f5ff', '#fede5d', '#04170e'],
  orange: ['#ff8b39', '#ff2aa3', '#fede5d', '#1b0d05'],
  yellow: ['#fede5d', '#ff8b39', '#ff2aa3', '#1a1504'],
  red: ['#fe4450', '#ff2aa3', '#fede5d', '#1a0508'],
  blue: ['#5db7ff', '#00f5ff', '#f0e6ff', '#04101a'],
};
const roomPalette = {
  fight: 'red', loot: 'yellow', shrine: 'violet', trap: 'orange', merchant: 'green', rest: 'cyan', glitch: 'pink', boss: 'red',
};
const relicPalette = { weapon: 'red', armor: 'cyan', charm: 'violet', curse: 'pink', snack: 'green', glitch: 'yellow' };

const hash = s => [...s].reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 2166136261) >>> 0;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const clean = s => s.replace(/`/g, '');
function block(name) {
  const start = content.indexOf(`export const ${name}`);
  const end = content.indexOf('].map', start);
  return content.slice(start, end);
}
function parseEnemies(name) {
  return [...block(name).matchAll(/\['([^']+)'\s*,\s*([^,]+),\s*\d+,\s*\d+,\s*\d+,\s*\d+,\s*\d+,\s*'([^']+)'\s*,\s*'([^']+)'/g)]
    .map(m => ({ id: m[1], name: clean(m[2]).replace(/^'/, '').replace(/'$/, '').replace('.toUpperCase()', '').toUpperCase(), sprite: m[3], palette: m[4] }));
}
function parseRelics() {
  return [...block('RELICS').matchAll(/\['([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'[\s\S]*?'([^']+)'\]/g)]
    .map(m => ({ id: m[1], name: m[2], kind: m[3], sprite: m[4], palette: relicPalette[m[3]] ?? 'cyan' }));
}
function parseRooms() {
  return [...block('ROOM_EVENTS').matchAll(/\['([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\]/g)]
    .map(m => ({ id: m[1], type: m[2], title: m[3], text: m[4], sprite: m[5], palette: roomPalette[m[2]] ?? 'cyan' }));
}
function px(x, y, w, h, fill, opacity = 1) { return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${opacity < 1 ? ` opacity="${opacity}"` : ''}/>`; }
function writeSvg(group, id, svg) {
  const dir = path.join(out, group);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.svg`), svg);
}
function wrap({ id, title, bg = '#05050c', body, view = 128 }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view} ${view}" shape-rendering="crispEdges" role="img" aria-label="${esc(title)}"><defs><filter id="g"><feGaussianBlur stdDeviation="2"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter><pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="2" fill="#fff" opacity=".045"/></pattern></defs><rect width="${view}" height="${view}" fill="${bg}"/><rect width="${view}" height="${view}" fill="url(#scan)"/>${body}<metadata>swolecrypt-generated:${esc(id)}</metadata></svg>`;
}
function monsterSvg(e, boss = false) {
  const [a, b, c, bg] = palettes[e.palette] ?? palettes.cyan;
  const h = hash(e.id);
  const horn = h % 3;
  const eye = (h >> 4) % 4;
  const mouth = (h >> 8) % 3;
  const bodyW = boss ? 72 : 56;
  const bodyH = boss ? 70 : 58;
  const x = 64 - bodyW / 2;
  const y = boss ? 34 : 42;
  let body = '';
  body += px(8, 112, 112, 8, a, .16);
  body += px(16, 16, 96, 96, b, .06);
  body += px(x, y, bodyW, bodyH, bg);
  body += px(x + 4, y + 4, bodyW - 8, bodyH - 8, a, .82);
  body += px(x + 12, y + 14, bodyW - 24, boss ? 24 : 18, b, .38);
  body += px(x - 12, y + 28, 12, 28, a);
  body += px(x + bodyW, y + 28, 12, 28, a);
  body += px(x - 18, y + 50, 14, 10, c);
  body += px(x + bodyW + 4, y + 50, 14, 10, c);
  body += px(x + 10, y + bodyH, 14, 16, b);
  body += px(x + bodyW - 24, y + bodyH, 14, 16, b);
  if (horn === 0 || boss) { body += px(x + 8, y - 12, 12, 12, c); body += px(x + bodyW - 20, y - 12, 12, 12, c); }
  if (horn === 1) { body += px(58, y - 16, 12, 16, c); }
  const eyeColor = eye === 0 ? '#fff7f0' : eye === 1 ? b : eye === 2 ? c : '#05050c';
  body += px(x + 16, y + 26, 10, 10, eyeColor);
  body += px(x + bodyW - 26, y + 26, 10, 10, eyeColor);
  body += px(x + 19, y + 29, 4, 4, '#05050c');
  body += px(x + bodyW - 23, y + 29, 4, 4, '#05050c');
  body += mouth === 0 ? px(x + 24, y + 48, bodyW - 48, 6, '#05050c') : mouth === 1 ? px(x + 24, y + 48, 8, 8, '#05050c') + px(x + bodyW - 32, y + 48, 8, 8, '#05050c') : px(x + 22, y + 50, bodyW - 44, 12, '#05050c');
  body += px(20, 20, 12, 12, a, .55) + px(96, 22, 8, 8, b, .55) + px(104, 90, 10, 10, c, .45);
  if (boss) body += px(30, 22, 68, 8, c) + px(38, 14, 12, 8, c) + px(78, 14, 12, 8, c) + px(58, 10, 12, 12, c);
  return wrap({ id: e.id, title: e.name, bg: '#030208', body: `<g filter="url(#g)">${body}</g>` });
}
function relicSvg(r) {
  const [a, b, c, bg] = palettes[r.palette] ?? palettes.cyan;
  const h = hash(r.id);
  let body = px(18, 18, 92, 92, a, .18) + px(26, 26, 76, 76, bg) + px(30, 30, 68, 68, a, .2);
  const kind = r.kind;
  if (kind === 'weapon') body += px(58, 24, 12, 76, c) + px(38, 42, 52, 10, b) + px(48, 92, 32, 10, a);
  else if (kind === 'armor') body += px(42, 28, 44, 64, b) + px(34, 42, 16, 34, a) + px(78, 42, 16, 34, a) + px(54, 36, 20, 34, bg);
  else if (kind === 'snack') body += px(44, 32, 40, 56, b) + px(40, 24, 48, 12, c) + px(50, 46, 28, 22, a) + px(54, 72, 20, 6, '#fff7f0');
  else if (kind === 'curse') body += px(44, 34, 40, 44, a) + px(52, 24, 24, 16, c) + px(50, 52, 8, 8, bg) + px(70, 52, 8, 8, bg) + px(56, 72, 16, 6, bg);
  else if (kind === 'glitch') for (let i=0;i<10;i++) body += px(24 + ((h >> i) % 72), 24 + ((h >> (i+4)) % 72), 8 + (i%3)*4, 6, [a,b,c][i%3], .75);
  else body += px(38, 38, 52, 52, a) + px(48, 28, 32, 72, b, .7) + px(28, 48, 72, 32, c, .7);
  body += px(16, 16, 8, 8, c) + px(104, 16, 8, 8, b) + px(16, 104, 8, 8, b) + px(104, 104, 8, 8, c);
  return wrap({ id: r.id, title: r.name, bg: '#04030a', body: `<g filter="url(#g)">${body}</g>` });
}
function roomSvg(r) {
  const [a, b, c, bg] = palettes[r.palette] ?? palettes.cyan;
  let body = '';
  body += px(0, 0, 128, 128, bg);
  for (let y=14; y<128; y+=18) body += px(0, y, 128, 2, a, .22);
  for (let x=8; x<128; x+=20) body += px(x, 0, 2, 128, b, .13);
  body += px(18, 26, 92, 58, '#05050c', .9) + px(22, 30, 84, 50, a, .18);
  if (r.type === 'fight' || r.type === 'boss') body += px(34, 36, 60, 36, a) + px(42, 44, 44, 20, bg) + px(54, 48, 8, 8, c) + px(70, 48, 8, 8, c);
  else if (r.type === 'loot' || r.type === 'merchant') body += px(38, 50, 52, 30, c) + px(32, 42, 64, 12, b) + px(58, 42, 12, 38, a);
  else if (r.type === 'rest') body += px(28, 62, 72, 14, b) + px(34, 50, 60, 12, a) + px(42, 42, 16, 8, c);
  else if (r.type === 'trap') body += px(32, 72, 64, 8, a) + px(42, 48, 8, 24, c) + px(60, 40, 8, 32, c) + px(78, 48, 8, 24, c);
  else if (r.type === 'shrine') body += px(54, 36, 20, 42, c) + px(42, 74, 44, 10, a) + px(50, 26, 28, 10, b);
  else body += px(28, 34, 72, 8, a) + px(36, 50, 56, 8, b) + px(24, 66, 80, 8, c) + px(44, 82, 40, 8, a);
  body += `<text x="64" y="114" text-anchor="middle" font-family="monospace" font-size="8" fill="${c}">${esc(r.type.toUpperCase())}</text>`;
  return wrap({ id: r.id, title: r.title, bg: '#020207', body: `<g filter="url(#g)">${body}</g>` });
}
function fxSvg(id, i) {
  const keys = Object.keys(palettes); const [a,b,c,bg] = palettes[keys[i % keys.length]];
  let body = px(0,0,128,128,bg,.2);
  for (let n=0;n<14;n++) {
    const ang = (Math.PI * 2 * n) / 14;
    const len = 20 + ((i+n) % 5) * 6;
    const x = 64 + Math.round(Math.cos(ang) * (10 + n%3*4));
    const y = 64 + Math.round(Math.sin(ang) * (10 + n%3*4));
    body += px(x, y, Math.max(4, Math.round(Math.cos(ang) * len)), 4, [a,b,c][n%3], .8).replace('width="-', 'width="').replace(`x="${x}"`, `x="${Math.min(x, x + Math.round(Math.cos(ang) * len))}"`);
  }
  body += px(52,52,24,24,c,.85) + px(58,58,12,12,'#fff7f0',.9);
  return wrap({ id, title: `Swolecrypt ${id}`, bg: '#000000', body: `<g filter="url(#g)">${body}</g>` });
}

const monsters = parseEnemies('MONSTERS');
const bosses = parseEnemies('BOSSES');
const relics = parseRelics();
const rooms = parseRooms();
const fx = ['hit-burst','crit-star','coin-pop','curse-smoke','heal-rune','boss-roar','level-spark','loot-glow','block-flash','trap-bite','portal-open','shop-chime','rest-mist','glitch-rip','death-static','preworkout-zap','chalk-cloud','plate-rain','mirror-crack','doms-aura','barbell-slash','neon-drip','rat-spark','moon-pulse'];

fs.rmSync(out, { recursive: true, force: true });
monsters.forEach(e => writeSvg('monsters', e.id, monsterSvg(e, false)));
bosses.forEach(e => writeSvg('bosses', e.id, monsterSvg(e, true)));
relics.forEach(r => writeSvg('relics', r.id, relicSvg(r)));
rooms.forEach(r => writeSvg('rooms', r.id, roomSvg(r)));
fx.forEach((id, i) => writeSvg('fx', id, fxSvg(id, i)));
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ generatedBy: 'swolecrypt-procedural-v1', monsters: monsters.length, bosses: bosses.length, relics: relics.length, rooms: rooms.length, fx: fx.length }, null, 2));
console.log(`Generated Swolecrypt assets: ${monsters.length} monsters, ${bosses.length} bosses, ${relics.length} relics, ${rooms.length} rooms, ${fx.length} fx`);

