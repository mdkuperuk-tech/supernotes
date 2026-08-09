/* covers.js — notebook covers as inline SVG. Vector, so they're crisp on the shelf
   and equally crisp as a full-bleed cover page in an exported PDF. */

const W = 620, H = 877;

const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

function esc(s = '') {
  return String(s).replace(/[<>&"]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));
}

function title(t, sub, opt = {}) {
  const col = opt.color || '#fff';
  const fam = opt.serif ? "ui-serif, Georgia, 'Times New Roman', serif" : "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
  const y = opt.y != null ? opt.y : H - 150;
  const align = opt.align || 'middle';
  const x = align === 'start' ? 62 : W / 2;
  const lines = wrap(t || '', opt.maxChars || 15);
  const size = opt.size || (lines.length > 1 ? 52 : 60);
  let out = '';
  lines.forEach((ln, i) => {
    out += `<text x="${x}" y="${y + i * (size * 1.12)}" text-anchor="${align}" fill="${col}" font-family="${fam}" font-size="${size}" font-weight="${opt.weight || 700}" letter-spacing="${opt.ls || 0}">${esc(ln)}</text>`;
  });
  if (sub) {
    out += `<text x="${x}" y="${y + lines.length * (size * 1.12) + 26}" text-anchor="${align}" fill="${col}" fill-opacity="0.72" font-family="ui-sans-serif, system-ui, sans-serif" font-size="21" font-weight="600" letter-spacing="3.2">${esc(sub.toUpperCase())}</text>`;
  }
  return out;
}

function wrap(t, max) {
  const words = String(t).split(/\s+/).filter(Boolean);
  const lines = []; let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= max) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

const grain = (o = 0.055) => `
<filter id="gr"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>
<rect width="${W}" height="${H}" filter="url(#gr)" opacity="${o}"/>`;

const sheen = `<linearGradient id="sh" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#fff" stop-opacity="0.16"/><stop offset="0.42" stop-color="#fff" stop-opacity="0.02"/>
<stop offset="1" stop-color="#000" stop-opacity="0.14"/></linearGradient><rect width="${W}" height="${H}" fill="url(#sh)"/>`;

/* ---------------- designs ---------------- */

export const COVERS = {

  linen: (h, t, s) => `
    <rect width="${W}" height="${H}" fill="${hsl(h, 26, 46)}"/>
    <g opacity="0.14">${Array.from({length: 90}, (_, i) => `<rect x="0" y="${i*10}" width="${W}" height="4" fill="#fff"/>`).join('')}</g>
    <g opacity="0.10">${Array.from({length: 64}, (_, i) => `<rect x="${i*10}" y="0" width="4" height="${H}" fill="#000"/>`).join('')}</g>
    <rect x="42" y="42" width="${W-84}" height="${H-84}" fill="none" stroke="#fff" stroke-opacity="0.34" stroke-width="2"/>
    <rect x="52" y="52" width="${W-104}" height="${H-104}" fill="none" stroke="#000" stroke-opacity="0.16" stroke-width="1"/>
    ${title(t, s, { y: H/2 - 20, serif: true })}${grain(0.07)}`,

  leather: (h, t, s) => `
    <defs><radialGradient id="lg" cx="0.5" cy="0.35" r="0.85">
      <stop offset="0" stop-color="${hsl(h, 30, 26)}"/><stop offset="1" stop-color="${hsl(h, 34, 12)}"/></radialGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#lg)"/>
    <rect x="0" y="0" width="72" height="${H}" fill="#000" opacity="0.22"/>
    <rect x="70" y="0" width="3" height="${H}" fill="#fff" opacity="0.08"/>
    <rect x="112" y="56" width="${W-168}" height="${H-112}" fill="none" stroke="hsl(42,64%,64%)" stroke-opacity="0.85" stroke-width="2.5"/>
    <rect x="122" y="66" width="${W-188}" height="${H-132}" fill="none" stroke="hsl(42,64%,64%)" stroke-opacity="0.4" stroke-width="1"/>
    ${title(t, s, { y: H/2, serif: true, color: 'hsl(42,58%,80%)' })}${grain(0.1)}`,

  aurora: (h, t, s) => `
    <defs>
      <linearGradient id="a1" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${hsl(h, 76, 58)}"/><stop offset="1" stop-color="${hsl(h + 58, 72, 42)}"/></linearGradient>
      <radialGradient id="a2" cx="0.2" cy="0.15" r="0.7"><stop offset="0" stop-color="${hsl(h - 34, 92, 68)}" stop-opacity="0.95"/><stop offset="1" stop-color="${hsl(h, 90, 60)}" stop-opacity="0"/></radialGradient>
      <radialGradient id="a3" cx="0.85" cy="0.78" r="0.7"><stop offset="0" stop-color="${hsl(h + 96, 88, 62)}" stop-opacity="0.9"/><stop offset="1" stop-color="${hsl(h + 96, 88, 62)}" stop-opacity="0"/></radialGradient>
      <filter id="bl"><feGaussianBlur stdDeviation="46"/></filter>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#a1)"/>
    <rect width="${W}" height="${H}" fill="url(#a2)" filter="url(#bl)"/>
    <rect width="${W}" height="${H}" fill="url(#a3)" filter="url(#bl)"/>
    ${title(t, s, { y: H - 200 })}${grain(0.05)}`,

  marble: (h, t, s) => {
    let veins = '';
    for (let i = 0; i < 16; i++) {
      const y = 40 + i * 54, o = 0.05 + (i % 3) * 0.05;
      veins += `<path d="M -20 ${y} C ${W*0.25} ${y - 70 + i*7}, ${W*0.55} ${y + 80 - i*5}, ${W+20} ${y - 20}" fill="none" stroke="${hsl(h, 30, 30)}" stroke-opacity="${o}" stroke-width="${1 + (i % 4)}"/>`;
    }
    return `<rect width="${W}" height="${H}" fill="${hsl(h, 22, 94)}"/>${veins}
      <rect x="46" y="46" width="${W-92}" height="${H-92}" fill="none" stroke="${hsl(h, 24, 42)}" stroke-opacity="0.35" stroke-width="1.5"/>
      ${title(t, s, { y: H/2, serif: true, color: hsl(h, 30, 24) })}${grain(0.045)}`;
  },

  arcs: (h, t, s) => {
    let a = '';
    for (let i = 7; i >= 0; i--) a += `<circle cx="${W*0.5}" cy="${H*0.34}" r="${80 + i*54}" fill="none" stroke="#fff" stroke-opacity="${0.08 + i*0.025}" stroke-width="${3 + i*0.6}"/>`;
    return `<rect width="${W}" height="${H}" fill="${hsl(h, 62, 40)}"/>${a}
      <circle cx="${W*0.5}" cy="${H*0.34}" r="62" fill="${hsl(h + 40, 88, 62)}"/>
      ${title(t, s, { y: H - 190 })}${grain()}`;
  },

  minimal: (h, t, s) => `
    <rect width="${W}" height="${H}" fill="${hsl(h, 16, 95)}"/>
    <rect x="0" y="0" width="${W}" height="${H*0.34}" fill="${hsl(h, 48, 46)}"/>
    <rect x="62" y="${H*0.34 + 54}" width="86" height="6" fill="${hsl(h, 48, 46)}"/>
    ${title(t, s, { y: H*0.34 + 140, align: 'start', color: hsl(h, 30, 18), size: 50, maxChars: 16 })}${grain(0.03)}`,

  blueprint: (h, t, s) => {
    let g = '';
    for (let x = 0; x <= W; x += 31) g += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#fff" stroke-opacity="${x % 155 === 0 ? 0.3 : 0.12}" stroke-width="1"/>`;
    for (let y = 0; y <= H; y += 31) g += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#fff" stroke-opacity="${y % 155 === 0 ? 0.3 : 0.12}" stroke-width="1"/>`;
    return `<rect width="${W}" height="${H}" fill="${hsl(h, 58, 26)}"/>${g}
      <rect x="46" y="46" width="${W-92}" height="${H-92}" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="2"/>
      <rect x="46" y="${H-190}" width="${W-92}" height="144" fill="${hsl(h, 62, 20)}" fill-opacity="0.85" stroke="#fff" stroke-opacity="0.5"/>
      ${title(t, s, { y: H - 122, size: 44, ls: 0.5 })}${grain(0.05)}`;
  },

  waves: (h, t, s) => {
    let w = '';
    for (let i = 0; i < 7; i++) {
      const y = H * 0.42 + i * 74;
      w += `<path d="M0 ${y} C ${W*0.3} ${y-56}, ${W*0.7} ${y+56}, ${W} ${y} L ${W} ${H} L 0 ${H} Z" fill="${hsl(h + i*9, 66, 30 + i*7)}" fill-opacity="0.9"/>`;
    }
    return `<rect width="${W}" height="${H}" fill="${hsl(h - 12, 70, 22)}"/>${w}
      ${title(t, s, { y: 190 })}${grain()}`;
  },

  terrazzo: (h, t, s) => {
    let sp = '';
    let seed = 7;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 150; i++) {
      const x = rnd() * W, y = rnd() * H, r = 3 + rnd() * 11, hh = h + [0, 42, 96, 190, 300][Math.floor(rnd() * 5)];
      sp += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${r.toFixed(1)}" ry="${(r * (0.5 + rnd())).toFixed(1)}" transform="rotate(${(rnd()*180).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${hsl(hh, 58, 58)}" fill-opacity="0.75"/>`;
    }
    return `<rect width="${W}" height="${H}" fill="${hsl(h, 24, 93)}"/>${sp}
      <rect x="52" y="${H/2 - 130}" width="${W-104}" height="260" rx="8" fill="${hsl(h, 20, 97)}" fill-opacity="0.93"/>
      ${title(t, s, { y: H/2, color: hsl(h, 40, 22), serif: true })}${grain(0.04)}`;
  },

  dune: (h, t, s) => `
    <defs><linearGradient id="dg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${hsl(h + 18, 72, 64)}"/><stop offset="1" stop-color="${hsl(h - 6, 62, 40)}"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#dg)"/>
    <circle cx="${W*0.66}" cy="${H*0.26}" r="86" fill="#fff" fill-opacity="0.86"/>
    <path d="M0 ${H*0.60} C ${W*0.32} ${H*0.50}, ${W*0.55} ${H*0.70}, ${W} ${H*0.58} L ${W} ${H} L 0 ${H} Z" fill="${hsl(h - 10, 54, 32)}"/>
    <path d="M0 ${H*0.72} C ${W*0.28} ${H*0.64}, ${W*0.62} ${H*0.84}, ${W} ${H*0.72} L ${W} ${H} L 0 ${H} Z" fill="${hsl(h - 14, 50, 24)}"/>
    ${title(t, s, { y: H - 130 })}${grain()}`,

  noir: (h, t, s) => `
    <rect width="${W}" height="${H}" fill="hsl(${h},14%,9%)"/>
    <rect x="0" y="0" width="10" height="${H}" fill="${hsl(h, 70, 52)}"/>
    <line x1="62" y1="${H*0.5 - 92}" x2="${W-62}" y2="${H*0.5 - 92}" stroke="#fff" stroke-opacity="0.35"/>
    <line x1="62" y1="${H*0.5 + 62}" x2="${W-62}" y2="${H*0.5 + 62}" stroke="#fff" stroke-opacity="0.35"/>
    ${title(t, s, { y: H*0.5, ls: 1, size: 50 })}${grain(0.08)}`,

  folio: (h, t, s) => `
    <rect width="${W}" height="${H}" fill="${hsl(h, 34, 32)}"/>
    <rect x="38" y="38" width="${W-76}" height="${H-76}" fill="none" stroke="hsl(42,54%,70%)" stroke-opacity="0.8" stroke-width="3"/>
    <rect x="54" y="54" width="${W-108}" height="${H-108}" fill="none" stroke="hsl(42,54%,70%)" stroke-opacity="0.35"/>
    <g stroke="hsl(42,54%,70%)" stroke-opacity="0.7" fill="none" stroke-width="2">
      <path d="M ${W/2-60} ${H*0.3} h 120"/><path d="M ${W/2-32} ${H*0.3 - 12} h 64"/>
      <path d="M ${W/2-60} ${H*0.66} h 120"/><path d="M ${W/2-32} ${H*0.66 + 12} h 64"/></g>
    ${title(t, s, { y: H*0.48, serif: true, color: 'hsl(42,50%,86%)' })}${grain(0.07)}`,

  ridge: (h, t, s) => {
    let r = '';
    for (let i = -14; i < 34; i++) r += `<rect x="${i*44}" y="-200" width="22" height="${H+400}" transform="rotate(22 ${W/2} ${H/2})" fill="#fff" fill-opacity="${i % 2 ? 0.07 : 0.14}"/>`;
    return `<rect width="${W}" height="${H}" fill="${hsl(h, 64, 44)}"/>${r}
      <rect x="0" y="${H*0.58}" width="${W}" height="${H*0.42}" fill="hsl(${h},40%,14%)" fill-opacity="0.85"/>
      ${title(t, s, { y: H*0.78, align: 'start', maxChars: 16 })}${grain()}`;
  },

  bloom: (h, t, s) => {
    let b = '';
    const pts = [[0.2,0.2,150],[0.82,0.3,120],[0.32,0.72,170],[0.86,0.8,110],[0.56,0.46,130]];
    pts.forEach((p, i) => { b += `<circle cx="${W*p[0]}" cy="${H*p[1]}" r="${p[2]}" fill="${hsl(h + i*36, 76, 62)}" fill-opacity="0.55"/>`; });
    return `<defs><filter id="bb"><feGaussianBlur stdDeviation="30"/></filter></defs>
      <rect width="${W}" height="${H}" fill="${hsl(h, 40, 96)}"/><g filter="url(#bb)">${b}</g>
      <rect x="0" y="${H-260}" width="${W}" height="260" fill="#fff" fill-opacity="0.68"/>
      ${title(t, s, { y: H - 150, color: hsl(h, 44, 22), serif: true })}${grain(0.04)}`;
  },

  spine: (h, t, s) => `
    <rect width="${W}" height="${H}" fill="${hsl(h, 20, 96)}"/>
    <rect x="0" y="0" width="150" height="${H}" fill="${hsl(h, 60, 40)}"/>
    <rect x="150" y="0" width="6" height="${H}" fill="${hsl(h, 60, 28)}"/>
    <g>${Array.from({length: 5}, (_, i) => `<rect x="196" y="${120 + i*26}" width="${180 - i*22}" height="7" rx="3.5" fill="${hsl(h, 44, 62)}" fill-opacity="${0.9 - i*0.14}"/>`).join('')}</g>
    ${title(t, s, { y: H*0.52, align: 'start', color: hsl(h, 50, 20), size: 48, maxChars: 13 })}
    <text x="196" y="${H-90}" fill="${hsl(h,40,45)}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="18" font-weight="700" letter-spacing="4">SUPERNOTES</text>${grain(0.03)}`,

  sunset: (h, t, s) => {
    let bands = '';
    for (let i = 0; i < 9; i++) bands += `<rect x="0" y="${H*0.34 + i*34}" width="${W}" height="${26 - i*1.6}" fill="${hsl(h + i*7, 88, 62 - i*3)}" fill-opacity="${0.95 - i*0.07}"/>`;
    return `<defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${hsl(h - 26, 74, 26)}"/><stop offset="0.55" stop-color="${hsl(h + 6, 84, 52)}"/><stop offset="1" stop-color="${hsl(h + 30, 88, 70)}"/></linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#sg)"/><circle cx="${W/2}" cy="${H*0.42}" r="120" fill="${hsl(h + 22, 96, 74)}"/>${bands}
      ${title(t, s, { y: 170 })}${grain()}`;
  }
};

export const COVER_IDS = Object.keys(COVERS);

export function coverSVG(cover = {}, opts = {}) {
  const id = COVERS[cover.design] ? cover.design : 'aurora';
  const h = ((cover.hue == null ? 214 : cover.hue) % 360 + 360) % 360;
  const body = COVERS[id](h, cover.title || opts.title || '', cover.subtitle || '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice">${sheen ? '' : ''}${body}<defs></defs></svg>`;
}

export function coverDataURI(cover, opts) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(coverSVG(cover, opts));
}

export const HUES = [214, 258, 292, 338, 6, 26, 44, 92, 152, 184, 200, 0];
