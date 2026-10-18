// Rasterize desktop/icon.svg into the platform icon files.
//   icon.png / icon.icns  — macOS: the squircle sits on an 824 px tile inside the 1024 canvas (HIG margins)
//   icon.ico              — Windows: full-bleed squircle, PNG-compressed entries 16…256 px
// Run: node desktop/scripts/create-icon.mjs   (needs playwright + chromium; iconutil on macOS)
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const desktop = path.resolve(import.meta.dirname, ".."),
  svg = fs.readFileSync(path.join(desktop, "icon.svg"), "utf8");
const macSvg = svg
  .replace('<g clip-path="url(#squircle)">', '<g transform="translate(100 100) scale(0.8047)"><g clip-path="url(#squircle)" filter="url(#tile)">')
  .replace("</defs>", '<filter id="tile" x="-15%" y="-15%" width="130%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#000" flood-opacity="0.32"/></filter></defs>')
  .replace("</svg>", "</g></svg>");
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined, headless: true });
async function render(markup, size) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>` + markup);
  const png = await page.screenshot({ omitBackground: true });
  await page.close();
  return png;
}
try {
  fs.writeFileSync(path.join(desktop, "icon.png"), await render(macSvg, 1024));
  // ICO: header + one directory entry per size, each a PNG stream.
  const sizes = [16, 24, 32, 48, 64, 128, 256], entries = [];
  for (const s of sizes) entries.push({ s, png: await render(svg, s) });
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(entries.length, 4);
  let offset = 6 + 16 * entries.length;
  const dir = [], data = [];
  for (const { s, png } of entries) {
    const e = Buffer.alloc(16);
    e.writeUInt8(s === 256 ? 0 : s, 0); e.writeUInt8(s === 256 ? 0 : s, 1); e.writeUInt8(0, 2); e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(png.length, 8); e.writeUInt32LE(offset, 12);
    dir.push(e); data.push(png); offset += png.length;
  }
  fs.writeFileSync(path.join(desktop, "icon.ico"), Buffer.concat([header, ...dir, ...data]));
  if (process.platform === "darwin") {
    const iconset = path.join(desktop, ".cache", "triage.iconset");
    fs.rmSync(iconset, { recursive: true, force: true });
    fs.mkdirSync(iconset, { recursive: true });
    for (const size of [16, 32, 128, 256, 512])
      for (const density of [1, 2])
        fs.writeFileSync(path.join(iconset, `icon_${size}x${size}${density === 2 ? "@2x" : ""}.png`), await render(macSvg, size * density));
    execFileSync("iconutil", ["-c", "icns", iconset, "-o", path.join(desktop, "icon.icns")]);
  }
} finally {
  await browser.close();
}
console.log("icon.png, icon.ico" + (process.platform === "darwin" ? ", icon.icns" : "") + " written to desktop/");
