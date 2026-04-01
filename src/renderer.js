'use strict';

const { createCanvas } = require('@napi-rs/canvas');

// ── Layout ──────────────────────────────────────────────────────────────────
const PANEL_W = 380;
const PANEL_H = 430;
const PAD = 22;
const TITLE_H = 58;

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  pageBg:       '#F4EFE4',   // warm cream page
  panelBg:      '#FFFFFF',
  border:       '#1C1C1C',
  charA_shirt:  '#3A78B0',   // blue
  charB_shirt:  '#C44B36',   // red-orange
  skin:         '#FDDBB4',
  hair:         '#4A2E0A',
  shoes:        '#444444',
  bubbleBg:     '#FFFFFF',
  bubbleBorder: '#1C1C1C',
  text:         '#1C1C1C',
  ground:       '#B8A888',
  titleText:    '#1C1C1C',
};

// ── Seeded PRNG (Mulberry32) ──────────────────────────────────────────────────
class RNG {
  constructor(seed = 42) { this.s = seed >>> 0; }
  next() {
    this.s = (Math.imul(this.s ^ (this.s + 0x6D2B79F5), this.s | 1)) >>> 0;
    return this.s / 0x100000000;
  }
  /** jitter: returns random value in [-range, +range] */
  j(range) { return (this.next() - 0.5) * 2 * range; }
}

// ── Drawing helpers ───────────────────────────────────────────────────────────

/** Draw a rough hand-drawn line using two slightly wobbly bezier passes */
function roughLine(ctx, x1, y1, x2, y2, rng, lw = 2, color = C.border) {
  const jit = Math.max(0.8, lw * 0.5);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;

  // Primary stroke
  ctx.lineWidth = lw;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(x1 + rng.j(jit),       y1 + rng.j(jit));
  ctx.quadraticCurveTo(mx + rng.j(jit * 3), my + rng.j(jit * 3),
                        x2 + rng.j(jit),       y2 + rng.j(jit));
  ctx.stroke();

  // Secondary faint pass for hand-drawn texture
  ctx.lineWidth = lw * 0.45;
  ctx.globalAlpha = 0.28;
  ctx.beginPath();
  ctx.moveTo(x1 + rng.j(jit * 2),   y1 + rng.j(jit * 2));
  ctx.quadraticCurveTo(mx + rng.j(jit * 4), my + rng.j(jit * 4),
                        x2 + rng.j(jit * 1.5), y2 + rng.j(jit * 1.5));
  ctx.stroke();
  ctx.restore();
}

/** Draw a rough outlined rectangle, optionally filled */
function roughBox(ctx, x, y, w, h, rng, lw = 2.5, fill = null) {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
  }
  roughLine(ctx, x,   y,   x+w, y,   rng, lw);
  roughLine(ctx, x+w, y,   x+w, y+h, rng, lw);
  roughLine(ctx, x+w, y+h, x,   y+h, rng, lw);
  roughLine(ctx, x,   y+h, x,   y,   rng, lw);
}

/** Rounded rect path (polyfill for ctx.roundRect) */
function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,   x + w, y + r,   r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,   y + h, x,   y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x,   y,   x + r, y,         r);
  ctx.closePath();
}

/** Word-wrap text to fit maxWidth, returns array of lines */
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// ── Speech Bubble ─────────────────────────────────────────────────────────────

/**
 * Draw a speech bubble with a tail pointing to (tailX, tailTipY).
 * cx: preferred horizontal center of bubble.
 * maxW: max bubble content width.
 * Returns the top Y of the bubble.
 */
function drawSpeechBubble(ctx, cx, tailTipY, text, maxW, panelLeft, panelRight) {
  ctx.save();
  ctx.font = 'bold 13px sans-serif';

  const bPad = 10;
  const lh   = 17;
  const lines = wrapText(ctx, text, maxW);
  const contentW = Math.max(...lines.map(l => ctx.measureText(l).width));
  const bW = Math.ceil(contentW) + bPad * 2;
  const bH = lines.length * lh + bPad * 2;
  const tailLen = 20;

  let bX = Math.round(cx - bW / 2);
  const bY = Math.round(tailTipY - bH - tailLen);

  // Clamp horizontally inside panel with 8px margin
  bX = Math.max(panelLeft + 8, Math.min(panelRight - bW - 8, bX));

  const r = 8;

  // Drop-shadow
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  rrect(ctx, bX + 3, bY + 3, bW, bH, r);
  ctx.fill();

  // Bubble fill + border
  ctx.fillStyle = C.bubbleBg;
  rrect(ctx, bX, bY, bW, bH, r);
  ctx.fill();
  ctx.strokeStyle = C.bubbleBorder;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Tail triangle
  const tX = Math.max(bX + 16, Math.min(bX + bW - 16, Math.round(cx)));
  // Fill tail white first
  ctx.fillStyle = C.bubbleBg;
  ctx.beginPath();
  ctx.moveTo(tX - 7, bY + bH);
  ctx.lineTo(tX,     tailTipY);
  ctx.lineTo(tX + 7, bY + bH);
  ctx.closePath();
  ctx.fill();
  // Stroke left + right sides of tail
  ctx.strokeStyle = C.bubbleBorder;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tX - 7, bY + bH + 1);
  ctx.lineTo(tX,     tailTipY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tX + 7, bY + bH + 1);
  ctx.lineTo(tX,     tailTipY);
  ctx.stroke();
  // Erase inner edge of tail (cover with white)
  ctx.strokeStyle = C.bubbleBg;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(tX - 6, bY + bH);
  ctx.lineTo(tX + 6, bY + bH);
  ctx.stroke();

  // Text
  ctx.fillStyle = C.text;
  ctx.textAlign = 'center';
  ctx.font = 'bold 13px sans-serif';
  lines.forEach((l, i) => {
    ctx.fillText(l, bX + bW / 2, bY + bPad + (i + 0.8) * lh);
  });

  ctx.restore();
  return bY;
}

// ── Character Drawing ─────────────────────────────────────────────────────────

/**
 * Draw a simple cartoon character.
 * (cx, cy): body centre. expr: expression string. shirtColor: CSS color.
 */
function drawCharacter(ctx, cx, cy, expr, shirtColor, rng) {
  const HR   = 28;   // head radius
  const hcY  = cy - 72;  // head centre y
  const bHalf = 20;  // body half-width
  const bTop  = hcY + HR + 4;
  const bBot  = bTop + 58;
  const legBot = bBot + 72;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // ── Legs ──
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 3;
  [-10, 10].forEach(dx => {
    ctx.beginPath();
    ctx.moveTo(cx + dx,            bBot - 4);
    ctx.quadraticCurveTo(cx + dx * 1.3 + rng.j(2), bBot + 35, cx + dx * 1.4 + rng.j(2), legBot);
    ctx.stroke();
  });

  // ── Shoes ──
  ctx.fillStyle = C.shoes;
  [-1, 1].forEach(side => {
    ctx.beginPath();
    ctx.ellipse(cx + side * 14 + rng.j(1), legBot + 3, 9, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // ── Body ──
  ctx.fillStyle = shirtColor;
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, bTop + (bBot - bTop) / 2, bHalf, (bBot - bTop) / 2 + 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Shirt collar V
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 7, bTop + 4);
  ctx.lineTo(cx,     bTop + 14);
  ctx.lineTo(cx + 7, bTop + 4);
  ctx.stroke();

  // ── Arms ──
  drawArms(ctx, cx, bTop, bBot, expr, rng);

  // ── Head ──
  ctx.fillStyle = C.skin;
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, hcY, HR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Ears
  ctx.fillStyle = C.skin;
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1.5;
  [-1, 1].forEach(side => {
    ctx.beginPath();
    ctx.ellipse(cx + side * (HR - 2), hcY + 2, 5, 7, side * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  // ── Hair ──
  ctx.fillStyle = C.hair;
  ctx.strokeStyle = C.hair;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, hcY - 5, HR - 3, Math.PI * 1.1, Math.PI * 1.9);
  // Extend down the sides
  ctx.arc(cx, hcY - 5, HR + 1, Math.PI * 1.9, Math.PI * 1.1, true);
  ctx.closePath();
  ctx.fill();

  // ── Eyes ──
  drawEyes(ctx, cx, hcY, expr);

  // ── Nose ──
  ctx.fillStyle = '#D4925A';
  ctx.beginPath();
  ctx.arc(cx, hcY + 4, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // ── Mouth ──
  drawMouth(ctx, cx, hcY, expr);

  ctx.restore();
}

function drawEyes(ctx, cx, cy, expr) {
  const eY  = cy - 8;
  const eL  = cx - 11;
  const eR  = cx + 11;

  ctx.save();
  ctx.strokeStyle = C.border;
  ctx.fillStyle   = C.border;

  switch (expr) {
    case 'happy':
    case 'excited':
      // ^^ closed arc eyes
      ctx.lineWidth = 2.5;
      [eL, eR].forEach(ex => {
        ctx.beginPath();
        ctx.arc(ex, eY + 2, 5.5, Math.PI + 0.35, 2 * Math.PI - 0.35);
        ctx.stroke();
      });
      break;

    case 'sad':
      ctx.lineWidth = 2;
      [eL, eR].forEach(ex => {
        ctx.beginPath();
        ctx.arc(ex, eY - 1, 5, 0.35, Math.PI - 0.35);
        ctx.stroke();
      });
      break;

    case 'surprised':
      ctx.lineWidth = 1.5;
      [eL, eR].forEach(ex => {
        ctx.beginPath();
        ctx.arc(ex, eY, 6.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ex, eY, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
      break;

    case 'angry':
      // Slanted brows
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(eL - 7, eY - 9); ctx.lineTo(eL + 5, eY - 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(eR - 5, eY - 4); ctx.lineTo(eR + 7, eY - 9); ctx.stroke();
      // Squinting
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(eL - 5, eY + 2); ctx.lineTo(eL + 5, eY - 1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(eR - 5, eY - 1); ctx.lineTo(eR + 5, eY + 2); ctx.stroke();
      break;

    case 'thinking':
      // One raised eyebrow
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(eL - 5, eY - 8); ctx.lineTo(eL + 5, eY - 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(eR - 5, eY - 5); ctx.lineTo(eR + 5, eY - 13); ctx.stroke();
      // fall-through to default dot eyes
      /* falls through */
    default:
      ctx.beginPath(); ctx.arc(eL, eY, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(eR, eY, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawMouth(ctx, cx, cy, expr) {
  const mY = cy + 14;
  ctx.save();
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';

  switch (expr) {
    case 'happy':
      ctx.beginPath();
      ctx.arc(cx, mY - 3, 10, 0.2, Math.PI - 0.2);
      ctx.stroke();
      break;
    case 'excited':
      ctx.fillStyle = '#CC5555';
      ctx.beginPath();
      ctx.arc(cx, mY - 3, 12, 0.1, Math.PI - 0.1);
      ctx.fill();
      ctx.stroke();
      break;
    case 'sad':
      ctx.beginPath();
      ctx.arc(cx, mY + 7, 10, Math.PI + 0.2, 2 * Math.PI - 0.2);
      ctx.stroke();
      break;
    case 'surprised':
      ctx.fillStyle = '#CC5555';
      ctx.beginPath();
      ctx.ellipse(cx, mY + 2, 6, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case 'angry':
      ctx.beginPath();
      ctx.arc(cx, mY + 7, 9, Math.PI + 0.3, 2 * Math.PI - 0.3);
      ctx.stroke();
      break;
    case 'thinking':
      ctx.beginPath();
      ctx.moveTo(cx - 6, mY);
      ctx.lineTo(cx + 3, mY - 3);
      ctx.stroke();
      // thought dots
      ctx.fillStyle = C.border;
      [[-5, -6], [1, -11], [7, -16]].forEach(([dx, dy]) => {
        ctx.beginPath();
        ctx.arc(cx + dx, mY + dy, 1.8, 0, Math.PI * 2);
        ctx.fill();
      });
      break;
    default:
      ctx.beginPath();
      ctx.moveTo(cx - 7, mY); ctx.lineTo(cx + 7, mY);
      ctx.stroke();
  }
  ctx.restore();
}

function drawArms(ctx, cx, bTop, bBot, expr, rng) {
  const sY = bTop + 6;  // shoulder Y
  ctx.save();
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';

  switch (expr) {
    case 'excited':
      // Arms raised in cheer
      ctx.beginPath();
      ctx.moveTo(cx - 18, sY);
      ctx.quadraticCurveTo(cx - 35, sY - 10, cx - 30, sY - 38);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 18, sY);
      ctx.quadraticCurveTo(cx + 35, sY - 10, cx + 30, sY - 38);
      ctx.stroke();
      break;
    case 'surprised':
      // Arms out to sides
      ctx.beginPath();
      ctx.moveTo(cx - 18, sY); ctx.lineTo(cx - 48, sY + 8); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 18, sY); ctx.lineTo(cx + 48, sY + 8); ctx.stroke();
      break;
    case 'thinking':
      // Right arm up to chin
      ctx.beginPath();
      ctx.moveTo(cx - 18, sY);
      ctx.quadraticCurveTo(cx - 28 + rng.j(2), sY + 18, cx - 24 + rng.j(2), sY + 36);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 18, sY);
      ctx.quadraticCurveTo(cx + 22, sY - 5, cx + 16, sY - 28);
      ctx.stroke();
      // Hand at chin
      ctx.beginPath();
      ctx.moveTo(cx + 12, sY - 30); ctx.lineTo(cx + 2, sY - 30); ctx.stroke();
      break;
    case 'angry':
      // Arms crossed
      ctx.beginPath();
      ctx.moveTo(cx - 18, sY);
      ctx.quadraticCurveTo(cx - 16, sY + 10, cx + 6, sY + 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 18, sY);
      ctx.quadraticCurveTo(cx + 16, sY + 10, cx - 6, sY + 6);
      ctx.stroke();
      break;
    default:
      // Natural hanging arms
      [-18, 18].forEach(dx => {
        ctx.beginPath();
        ctx.moveTo(cx + dx, sY);
        ctx.quadraticCurveTo(cx + dx * 1.55 + rng.j(3), sY + 18,
                              cx + dx * 1.4  + rng.j(3), sY + 38);
        ctx.stroke();
      });
  }
  ctx.restore();
}

// ── Panel Drawing ─────────────────────────────────────────────────────────────

function drawGroundLine(ctx, panelX, panelY, rng) {
  const y = panelY + PANEL_H - 42;
  roughLine(ctx, panelX + 18, y, panelX + PANEL_W - 18, y, rng, 1.5, C.ground);
}

function drawPanel(ctx, panelX, panelY, panelData, rng, idx) {
  const chars = panelData.characters;

  // Background
  ctx.fillStyle = C.panelBg;
  ctx.fillRect(panelX, panelY, PANEL_W, PANEL_H);

  // Ground line
  drawGroundLine(ctx, panelX, panelY, rng);

  // Rough border
  roughBox(ctx, panelX, panelY, PANEL_W, PANEL_H, rng, 3.2);

  // Character horizontal positions
  const charFeetY = panelY + PANEL_H - 45;  // y at shoes
  let positions;
  if (chars.length === 1) {
    positions = [{ x: panelX + PANEL_W / 2, bubMaxW: 160 }];
  } else {
    positions = [
      { x: panelX + Math.round(PANEL_W * 0.27), bubMaxW: 130 },
      { x: panelX + Math.round(PANEL_W * 0.73), bubMaxW: 130 },
    ];
  }

  // Body centre = feetY minus legs(72) minus body-half
  const charBodyY = charFeetY - 72 - 30;

  // Draw characters
  chars.forEach((char, i) => {
    const shirtColor = char.id === 'B' ? C.charB_shirt : C.charA_shirt;
    drawCharacter(ctx, positions[i].x, charBodyY, char.expression, shirtColor, rng);
  });

  // Draw speech bubbles above each character
  chars.forEach((char, i) => {
    if (!char.dialogue || !char.dialogue.trim()) return;
    const pos  = positions[i];
    const headCY   = charBodyY - 72;
    const headTop  = headCY - 28;          // top of head circle
    const tailTipY = headTop - 4;          // bubble tail ends just above head
    drawSpeechBubble(ctx, pos.x, tailTipY, char.dialogue, pos.bubMaxW,
                     panelX, panelX + PANEL_W);
  });

  // Panel number (subtle, bottom-right)
  ctx.save();
  ctx.font = '11px sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.textAlign = 'right';
  ctx.fillText(`${idx + 1}`, panelX + PANEL_W - 7, panelY + PANEL_H - 5);
  ctx.restore();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Render a full comic strip from panels data.
 * @param {Array} panels  - from generateDialogue()
 * @param {string} [topic] - optional title shown at the top
 * @returns {Buffer} PNG image buffer
 */
function renderComic(panels, topic) {
  const n    = panels.length;
  const cols = n <= 3 ? n : 2;
  const rows = Math.ceil(n / cols);

  const topOffset = topic ? TITLE_H : 0;
  const W = cols * PANEL_W + (cols + 1) * PAD;
  const H = rows * PANEL_H + (rows + 1) * PAD + topOffset;

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');
  const rng    = new RNG(7654321);

  // Page background
  ctx.fillStyle = C.pageBg;
  ctx.fillRect(0, 0, W, H);

  // ── Title ──
  if (topic) {
    const title = topic.toUpperCase();
    ctx.save();
    ctx.font      = 'bold 26px sans-serif';
    ctx.fillStyle = C.titleText;
    ctx.textAlign = 'center';
    ctx.fillText(title, W / 2, 38);
    // Hand-drawn underline
    const tw = ctx.measureText(title).width;
    roughLine(ctx, W / 2 - tw / 2 - 12, 46, W / 2 + tw / 2 + 12, 46, rng, 2.2);
    ctx.restore();
  }

  // ── Panels ──
  panels.forEach((panel, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const px  = PAD + col * (PANEL_W + PAD);
    const py  = topOffset + PAD + row * (PANEL_H + PAD);
    drawPanel(ctx, px, py, panel, rng, i);
  });

  return canvas.toBuffer('image/png');
}

module.exports = { renderComic };
