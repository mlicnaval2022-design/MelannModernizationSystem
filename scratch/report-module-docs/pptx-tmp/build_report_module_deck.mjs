import fs from "node:fs/promises";
import path from "node:path";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const ROOT = path.resolve("../../..");
const OUT = path.join(ROOT, "outputs", "report-module-docs");
const ASSETS = path.join(OUT, "assets");
const FINAL = path.join(OUT, "Melann_Report_Module_Presentation.pptx");
const PREVIEW = path.join(OUT, "pptx-preview");
await fs.mkdir(PREVIEW, { recursive: true });

const W = 1280;
const H = 720;
const colors = {
  navy: "#0F172A",
  blue: "#1E3A8A",
  sky: "#EFF6FF",
  slate: "#475569",
  light: "#F8FAFC",
  border: "#CBD5E1",
  green: "#16A34A",
  red: "#DC2626",
  gold: "#B7791F",
  white: "#FFFFFF",
};

async function imageBlob(file) {
  const bytes = await fs.readFile(file);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function addText(slide, text, x, y, w, h, opts = {}) {
  const box = slide.shapes.add({
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  box.text = text;
  box.text.style = {
    fontSize: opts.size ?? 22,
    bold: opts.bold ?? false,
    color: opts.color ?? colors.navy,
    alignment: opts.align ?? "left",
  };
  return box;
}

function addRect(slide, x, y, w, h, fill, line = colors.border) {
  return slide.shapes.add({
    geometry: "roundRect",
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { style: "solid", fill: line, width: 1 },
    borderRadius: "rounded-lg",
  });
}

function addHeader(slide, title, eyebrow = "REPORT MODULE DOCUMENTATION") {
  addText(slide, eyebrow, 72, 42, 420, 28, { size: 13, bold: true, color: colors.slate });
  addText(slide, title, 72, 76, 980, 86, { size: 36, bold: true, color: colors.navy });
  slide.shapes.add({
    geometry: "rect",
    position: { left: 72, top: 168, width: 1136, height: 2 },
    fill: colors.border,
    line: { style: "solid", fill: colors.border, width: 0 },
  });
}

function bulletSlide(slide, title, bullets, accent = colors.blue) {
  addHeader(slide, title);
  bullets.forEach((item, idx) => {
    const y = 205 + idx * 76;
    slide.shapes.add({
      geometry: "ellipse",
      position: { left: 92, top: y + 8, width: 20, height: 20 },
      fill: accent,
      line: { style: "solid", fill: accent, width: 0 },
    });
    addText(slide, item, 130, y, 980, 48, { size: 24, color: colors.navy });
  });
}

const deck = Presentation.create({ slideSize: { width: W, height: H } });

// Slide 1
{
  const slide = deck.slides.add();
  slide.background.fill = colors.light;
  slide.shapes.add({
    geometry: "rect",
    position: { left: 0, top: 0, width: W, height: H },
    fill: colors.light,
    line: { style: "solid", fill: colors.light, width: 0 },
  });
  addText(slide, "Melann Lending System V2", 72, 70, 780, 42, { size: 28, bold: true, color: colors.blue });
  addText(slide, "Report Module and Report Types", 72, 135, 760, 128, { size: 56, bold: true, color: colors.navy });
  addText(slide, "Documentation deck covering purpose, descriptions, advantages, problems, limitations, and recommended next steps.", 76, 300, 690, 92, { size: 24, color: colors.slate });
  const titleCards = [
    ["Collection", colors.green],
    ["Releases", colors.blue],
    ["Maturity", colors.gold],
    ["DCR", colors.gold],
    ["Reversed", colors.red],
    ["Monitoring", colors.red],
  ];
  titleCards.forEach(([label, color], idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const x = 810 + col * 190;
    const y = 126 + row * 132;
    addRect(slide, x, y, 160, 86, colors.white, colors.border);
    slide.shapes.add({ geometry: "rect", position: { left: x, top: y, width: 160, height: 10 }, fill: color, line: { style: "solid", fill: color, width: 0 } });
    addText(slide, label, x + 18, y + 31, 124, 28, { size: 20, bold: true, color: colors.navy });
  });
  addText(slide, "with DCR as separate finance report", 812, 538, 350, 32, { size: 20, bold: true, color: colors.blue });
  addText(slide, "Prepared July 14, 2026", 76, 620, 360, 32, { size: 18, color: colors.slate });
}

// Slide 2
{
  const slide = deck.slides.add();
  slide.background.fill = colors.white;
  addHeader(slide, "The module turns daily transactions into operational decisions");
  slide.images.add({
    blob: await imageBlob(path.join(ASSETS, "report-flow.png")),
    contentType: "image/png",
    fit: "contain",
    position: { left: 92, top: 188, width: 1096, height: 430 },
    geometry: "roundRect",
    borderRadius: "rounded-lg",
  });
}

// Slide 3
{
  const slide = deck.slides.add();
  slide.background.fill = colors.white;
  addHeader(slide, "Current inventory has UI, finance, and backend-only layers");
  const items = [
    ["Visible Reports UI", "Collection, Releases, Maturity, Reversed Payments, Full Paid, Collection Sheet, Disclosure, Monitoring."],
    ["Separate Finance Report", "Daily Cash Report lives outside the Reports sidebar because it has close, cash, bank, and compliance handoff workflows."],
    ["Backend / README Candidates", "Loan Type Summary and Payments Encoded still appear in backend or documentation but are not current sidebar items."],
  ];
  items.forEach(([label, body], idx) => {
    const x = 86 + idx * 385;
    addRect(slide, x, 220, 335, 265, idx === 1 ? colors.sky : colors.light, idx === 1 ? colors.blue : colors.border);
    addText(slide, label, x + 24, 248, 285, 58, { size: 25, bold: true, color: idx === 1 ? colors.blue : colors.navy });
    addText(slide, body, x + 24, 324, 285, 118, { size: 19, color: colors.slate });
  });
  addText(slide, "Main documentation risk: users may expect reports that are documented but not currently visible, or miss DCR because it is under Finance.", 100, 560, 1080, 50, { size: 22, bold: true, color: colors.red });
}

// Slide 4
{
  const slide = deck.slides.add();
  slide.background.fill = colors.white;
  addHeader(slide, "Collections and releases are the daily operating heartbeat");
  const cards = [
    ["Collection Report", "Shows daily/monthly payments by date range, grouped by collector.", "Advantage: fast cash collection review and collector accountability.", "Limit: depends on active payment status, correct collector links, and consistent branch filters."],
    ["Releases Report", "Shows loans released by date or cycle with principal totals and loan type split.", "Advantage: monitors cash-out and production by collector.", "Limit: release totals may use principal while DCR cash-out should prefer net proceeds."],
  ];
  cards.forEach((card, idx) => {
    const x = idx === 0 ? 92 : 674;
    addRect(slide, x, 205, 514, 355, colors.light);
    addText(slide, card[0], x + 28, 236, 450, 44, { size: 30, bold: true, color: idx === 0 ? colors.green : colors.blue });
    addText(slide, card[1], x + 28, 304, 448, 60, { size: 22, color: colors.navy });
    addText(slide, card[2], x + 28, 395, 448, 50, { size: 20, color: colors.slate });
    addText(slide, card[3], x + 28, 478, 448, 60, { size: 19, color: colors.red });
  });
}

// Slide 5
{
  const slide = deck.slides.add();
  slide.background.fill = colors.white;
  addHeader(slide, "Exception and lifecycle reports support control work");
  const rows = [
    ["Maturity Checker / Past Due", "Prioritizes accounts by maturity range and remaining balance.", colors.gold],
    ["Payments Reversed", "Audits reversed payments with user, reason, customer, and amount.", colors.red],
    ["Full Paid Loans", "Lists completed accounts for re-loan targeting and completion metrics.", colors.green],
  ];
  rows.forEach(([name, body, color], idx) => {
    const y = 205 + idx * 132;
    addRect(slide, 108, y, 1030, 92, colors.light, color);
    addText(slide, name, 138, y + 20, 350, 40, { size: 25, bold: true, color });
    addText(slide, body, 520, y + 20, 560, 42, { size: 22, color: colors.navy });
  });
  addText(slide, "Common limitation: these reports are only as strong as status mapping and date quality from loan/payment records.", 112, 622, 980, 38, { size: 22, bold: true, color: colors.slate });
}

// Slide 6
{
  const slide = deck.slides.add();
  slide.background.fill = colors.white;
  addHeader(slide, "Field, client-facing, and monitoring reports cover different audiences");
  const cols = [
    ["Collection Sheet", "Per-collector active loan list for field collection and printed accountability.", colors.blue],
    ["Disclosure Statement", "Client loan disclosure generated from selected borrower and loan details.", colors.navy],
    ["Monitoring Summary", "Alerts, escalations, promise-to-pay data, follow-up logs, and resolutions.", colors.red],
  ];
  cols.forEach(([title, body, color], idx) => {
    const x = 80 + idx * 395;
    addRect(slide, x, 210, 345, 330, colors.light, color);
    slide.shapes.add({ geometry: "rect", position: { left: x, top: 210, width: 345, height: 12 }, fill: color, line: { style: "solid", fill: color, width: 0 } });
    addText(slide, title, x + 24, 254, 296, 72, { size: 28, bold: true, color });
    addText(slide, body, x + 24, 355, 296, 116, { size: 21, color: colors.navy });
  });
}

// Slide 7
{
  const slide = deck.slides.add();
  slide.background.fill = colors.white;
  addHeader(slide, "DCR is the accounting-critical report");
  slide.images.add({
    blob: await imageBlob(path.join(ASSETS, "dcr-formula.png")),
    contentType: "image/png",
    fit: "contain",
    position: { left: 82, top: 178, width: 1116, height: 450 },
    geometry: "roundRect",
    borderRadius: "rounded-lg",
  });
}

// Slide 8
{
  const slide = deck.slides.add();
  slide.background.fill = colors.white;
  bulletSlide(slide, "Advantages and limitations should be managed as one control surface", [
    "Advantages: centralized access, collector grouping, print-friendly output, DCR reconciliation, and monitoring visibility.",
    "Limitations: report inventory mismatch across README, backend routes, and visible UI.",
    "DCR gaps: branch filtering, bank formulas, server-side close totals, DCR numbering, and exact legacy parity.",
    "Export risk: browser print works, but critical reports may need controlled server-generated PDF/export paths.",
    "Data risk: statuses, dates, branch, collector, and reversal reasons must be encoded consistently.",
  ], colors.blue);
}

// Slide 9
{
  const slide = deck.slides.add();
  slide.background.fill = colors.light;
  addHeader(slide, "Recommended next steps before production hardening");
  const steps = [
    ["1", "Normalize inventory and labels", "Align README, Reports UI, backend routes, and DCR placement."],
    ["2", "Make backend totals authoritative", "Use formula services for DCR and cash-impacting reports."],
    ["3", "Add branch-aware tests", "Protect reports used for cash and collector accountability."],
    ["4", "Decide backend-only reports", "Bring Loan Type and Payments Encoded into UI or remove from docs."],
  ];
  steps.forEach(([n, title, body], idx) => {
    const y = 195 + idx * 105;
    slide.shapes.add({ geometry: "ellipse", position: { left: 100, top: y, width: 54, height: 54 }, fill: colors.blue, line: { style: "solid", fill: colors.blue, width: 0 } });
    addText(slide, n, 100, y + 10, 54, 30, { size: 24, bold: true, color: colors.white, align: "center" });
    addText(slide, title, 180, y - 2, 520, 34, { size: 26, bold: true, color: colors.navy });
    addText(slide, body, 180, y + 36, 870, 34, { size: 21, color: colors.slate });
  });
  addText(slide, "Target outcome: screen, print, export, and persisted audit totals all tell the same story.", 96, 635, 1000, 34, { size: 23, bold: true, color: colors.blue });
}

for (const [index, slide] of deck.slides.items.entries()) {
  const stem = `slide-${String(index + 1).padStart(2, "0")}`;
  const png = await deck.export({ slide, format: "png", scale: 1 });
  await fs.writeFile(path.join(PREVIEW, `${stem}.png`), new Uint8Array(await png.arrayBuffer()));
  const layout = await slide.export({ format: "layout" });
  await fs.writeFile(path.join(PREVIEW, `${stem}.layout.json`), await layout.text());
}

const montage = await deck.export({ format: "webp", montage: true, scale: 1 });
await fs.writeFile(path.join(PREVIEW, "deck-montage.webp"), new Uint8Array(await montage.arrayBuffer()));

const pptx = await PresentationFile.exportPptx(deck);
await pptx.save(FINAL);
console.log(FINAL);
