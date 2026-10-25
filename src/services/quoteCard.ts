/** Renders a quote as a shareable PNG with <canvas>; handles Arabic (RTL) text and manual word wrap. */
import { isArabic } from "../i18n";

export type CardTheme = "ink" | "paper" | "dusk" | "ocean" | "forest";
export const THEMES: CardTheme[] = ["ink", "paper", "dusk", "ocean", "forest"];

const STYLE: Record<CardTheme, { bg: [string, string]; fg: string; muted: string; accent: string }> = {
  ink: { bg: ["#16161d", "#0c0c10"], fg: "#f4efe6", muted: "#a8a29e", accent: "#e8b04b" },
  paper: { bg: ["#f7f1e3", "#efe6d2"], fg: "#2b2620", muted: "#6b6256", accent: "#a4442b" },
  dusk: { bg: ["#3b1e54", "#d9534f"], fg: "#fff7f0", muted: "#ffd9cc", accent: "#ffd166" },
  ocean: { bg: ["#0f4c5c", "#1b98a0"], fg: "#f1fbfb", muted: "#bfe9ea", accent: "#ffe8a3" },
  forest: { bg: ["#1f3b2d", "#46664d"], fg: "#f3f6ee", muted: "#c8d6c0", accent: "#e9c46a" },
};

export const CARD_W = 1080;
export const CARD_H = 1350;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\n+/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
      else line = test;
    }
    if (line) lines.push(line);
  }
  return lines;
}

export function drawQuoteCard(canvas: HTMLCanvasElement, quote: string, attribution: string, theme: CardTheme): void {
  const s = STYLE[theme];
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const rtl = isArabic(quote);
  const g = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  g.addColorStop(0, s.bg[0]);
  g.addColorStop(1, s.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const pad = 120, maxW = CARD_W - pad * 2;
  const family = rtl ? '"Amiri", "Noto Naskh Arabic", "Geeza Pro", "Tahoma", serif' : '"Georgia", "Times New Roman", serif';
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.textAlign = rtl ? "right" : "left";
  const x = rtl ? CARD_W - pad : pad;

  // big quotation mark
  ctx.fillStyle = s.accent;
  ctx.font = "bold 220px " + family;
  ctx.fillText(rtl ? "”" : "“", x, 300);

  // fit the quote: shrink the font until it fits the text box
  let size = 64, lines: string[] = [];
  const boxH = CARD_H - 520;
  for (; size >= 28; size -= 2) {
    ctx.font = size + "px " + family;
    lines = wrap(ctx, quote, maxW);
    if (lines.length * size * 1.45 <= boxH) break;
  }
  ctx.fillStyle = s.fg;
  const lh = size * 1.45;
  let y = 330 + (boxH - lines.length * lh) / 2 + size;
  for (const l of lines) { ctx.fillText(l, x, y); y += lh; }

  // attribution
  ctx.fillStyle = s.accent;
  ctx.fillRect(rtl ? CARD_W - pad - 80 : pad, CARD_H - 210, 80, 4);
  ctx.fillStyle = s.muted;
  ctx.font = "34px " + (isArabic(attribution) ? family : '"Helvetica Neue", Arial, sans-serif');
  ctx.direction = isArabic(attribution) ? "rtl" : "ltr";
  ctx.fillText(attribution, x, CARD_H - 150);
}

export const canvasToPng = (canvas: HTMLCanvasElement): Promise<Blob | null> => new Promise(res => canvas.toBlob(b => res(b), "image/png"));
