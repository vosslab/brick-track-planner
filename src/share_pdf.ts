import { jsPDF } from "jspdf";

import type { Analysis, EndpointStatus } from "./engine";
import type { Catalog, Project, Section, Table } from "./project";
import { createScene } from "./scene";
import { seamS8Suppliers } from "./seam_supply";
import { showInventory } from "./show_inventory";
import type { MemberInventory, RequiredRow } from "./show_inventory";

type PdfMode = "color" | "grayscale";
type PrintBlock = { title: string; rows: string[] };
const pageWidth = 792;
const pageHeight = 612;
const margin = 32;
const footer = pageHeight - 36;
const bodyWidth = pageWidth - 2 * margin;
const nativeText =
  /^[\x20-\x7e\xa0-\xff\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013-\u2014\u2018-\u201a\u201c-\u201e\u2020-\u2022\u2026\u2030\u2039-\u203a\u20ac\u2122]*$/u;
const glyphScale = 3;
let glyphCanvas: HTMLCanvasElement | undefined;

function canvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("A canvas is required to draw the PDF.");
  return context;
}

function glyphContext(pdf: jsPDF, canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvasContext(canvas);
  const weight = pdf.getFont().fontStyle === "bold" ? "bold" : "normal";
  context.font = `${weight} ${pdf.getFontSize() * glyphScale}px Arial, sans-serif`;
  return context;
}

function printText(pdf: jsPDF, text: string, x: number, y: number): void {
  if (nativeText.test(text)) {
    pdf.text(text, x, y);
    return;
  }

  glyphCanvas ??= document.createElement("canvas");
  const canvas = glyphCanvas;
  const metrics = glyphContext(pdf, canvas).measureText(text);
  const left = Math.ceil(Math.max(0, metrics.actualBoundingBoxLeft)) + 2;
  const right = Math.ceil(metrics.actualBoundingBoxRight) + 2;
  const ascent = Math.ceil(metrics.actualBoundingBoxAscent) + 2;
  const descent = Math.ceil(metrics.actualBoundingBoxDescent) + 2;
  canvas.width = Math.max(1, left + right);
  canvas.height = Math.max(1, ascent + descent);
  const context = glyphContext(pdf, canvas);
  context.fillStyle = "#2d2d2d";
  context.fillText(text, left, ascent);
  pdf.addImage(
    canvas,
    "PNG",
    x - left / glyphScale,
    y - ascent / glyphScale,
    canvas.width / glyphScale,
    canvas.height / glyphScale,
    undefined,
    "FAST",
  );

  // A marked, invisible text run gives PDF readers the original Unicode characters.
  let unicode = "FEFF";
  for (let index = 0; index < text.length; index++) {
    unicode += text.charCodeAt(index).toString(16).padStart(4, "0");
  }
  const internal = pdf.internal as typeof pdf.internal & { write: (instruction: string) => void };
  internal.write(`/Span << /ActualText <${unicode}> >> BDC`);
  const safe = Array.from(text, (character) => (nativeText.test(character) ? character : "?"));
  pdf.text(safe.join(""), x, y, { renderingMode: "invisible" });
  internal.write("EMC");
}

function wrappedText(pdf: jsPDF, text: string, width: number): string[] {
  const value = text.replace(/\s+/gu, " ").trim();
  if (nativeText.test(value)) return pdf.splitTextToSize(value, width) as string[];

  glyphCanvas ??= document.createElement("canvas");
  const context = glyphContext(pdf, glyphCanvas);
  const limit = width * glyphScale;
  const lines: string[] = [];
  let line = "";
  for (const word of value.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width <= limit) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    for (const character of word) {
      if (line && context.measureText(line + character).width > limit) {
        lines.push(line);
        line = "";
      }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function pageTitle(pdf: jsPDF, heading: string, subtitle: string): number {
  pdf.setTextColor(45);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  const lines = wrappedText(pdf, heading, bodyWidth);
  if (lines.length > 2) {
    lines.splice(
      1,
      lines.length,
      `${Array.from(lines[1] ?? "")
        .slice(0, -3)
        .join("")}...`,
    );
  }
  lines.forEach((line, index) => printText(pdf, line, margin, 43 + index * 26));
  let y = 61 + (lines.length - 1) * 26;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  for (const line of wrappedText(pdf, subtitle, bodyWidth).slice(0, 2)) {
    printText(pdf, line, margin, y);
    y += 14;
  }
  return y;
}

function grayscaleImage(canvas: HTMLCanvasElement): string {
  const context = canvasContext(canvas);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = pixels;
  for (let offset = 0; offset < data.length; offset += 4) {
    const shade =
      0.2126 * (data[offset] ?? 0) +
      0.7152 * (data[offset + 1] ?? 0) +
      0.0722 * (data[offset + 2] ?? 0);
    data[offset] = shade;
    data[offset + 1] = shade;
    data[offset + 2] = shade;
  }
  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL("image/png");
}

function diagram(
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  sceneWidth: number,
  mode: PdfMode,
  top: number,
  width: number,
  height: number,
): void {
  const scale = Math.min(width / canvas.width, height / canvas.height);
  const drawWidth = canvas.width * scale;
  const drawHeight = canvas.height * scale;
  pdf.addImage(
    mode === "color" ? canvas.toDataURL("image/png") : grayscaleImage(canvas),
    "PNG",
    margin + (width - drawWidth) / 2,
    top + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
    undefined,
    "FAST",
  );

  const pointsPerStud = drawWidth / sceneWidth;
  const scaleStuds = [32, 16, 8, 4, 2, 1].find(
    (studs) => studs * pointsPerStud <= Math.min(drawWidth, 170) && studs * pointsPerStud >= 6,
  );
  if (scaleStuds) {
    const scaleLength = scaleStuds * pointsPerStud;
    const y = top + height + 17;
    pdf.setDrawColor(45);
    pdf.setLineWidth(0.65);
    pdf.line(margin, y, margin + scaleLength, y);
    pdf.line(margin, y - 3, margin, y + 3);
    pdf.line(margin + scaleLength, y - 3, margin + scaleLength, y + 3);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(`${scaleStuds} studs`, margin + scaleLength + 8, y + 3);
  }
}

function overview(
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  sceneWidth: number,
  mode: PdfMode,
  name: string,
  subtitle: string,
): void {
  const top = pageTitle(pdf, name, subtitle);
  diagram(pdf, canvas, sceneWidth, mode, top, bodyWidth, pageHeight - 106 - top);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  const legend = [
    "32-stud grid / fit to page",
    "Heavy solid lines mark the front edge. Dashed and dotted guides sit 8 and 24 studs in.",
    "Open circles show open track ends. Diamonds mark joins. Warning diamonds mark ambiguity.",
    "Dashed hatching marks track outside the tabletops.",
    "Signed plate values (pl) are heights relative to the layout reference level.",
  ];
  legend.forEach((line, index) => pdf.text(line, margin, pageHeight - 72 + index * 13));
}

function printBlocks(
  pdf: jsPDF,
  blocks: PrintBlock[],
  top: number,
  heading = "",
  left = margin,
): void {
  let y = top;
  let width = pageWidth - margin - left;

  function continuePage(): void {
    pdf.addPage();
    y = heading ? pageTitle(pdf, heading, "Continued") + 12 : 47;
    left = margin;
    width = bodyWidth;
  }

  function openBlock(title: string): void {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    for (const line of wrappedText(pdf, title, width)) {
      printText(pdf, line, left, y);
      y += 16;
    }
    y += 3;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
  }

  for (const { title, rows } of blocks) {
    if (y + 38 > footer) continuePage();
    openBlock(title);
    for (const row of rows.length ? rows : ["None"]) {
      for (const line of wrappedText(pdf, row, width)) {
        if (y > footer) {
          continuePage();
          openBlock(`${title} (continued)`);
        }
        printText(pdf, line, left, y);
        y += 14;
      }
    }
    y += 15;
  }
}

function visibleTables(project: Project): Table[] {
  const visible = new Set(project.layers.filter((layer) => layer.visible).map((layer) => layer.id));
  return project.tables.filter((table) => visible.has(table.layerId));
}

function measurement(value: number): number {
  return Number(value.toFixed(3));
}

function tablePlacement(table: Table): string[] {
  return [
    `${table.name}  |  Nominal: ${table.nominal ?? "custom"}`,
    `Measured: ${table.width} x ${table.depth} studs  |  Position: (${measurement(table.x)}, ${measurement(table.y)}) studs`,
    `Angle: ${measurement(table.angle % 360)} deg  |  Fronts: ${table.fronts.join(", ") || "none"} (table-local)`,
  ];
}

function legacyInventory(project: Project, catalog: Catalog): PrintBlock[] {
  const { track, ballast, unknown } = showInventory(project, catalog);
  const recipeGaps = unknown.filter(({ key }) => key.startsWith("recipe:"));
  return [
    {
      title: "Visible track inventory",
      rows: track.map((row) => `${requiredText(row)}  [${row.key}]`),
    },
    {
      title: "Visible tabletops",
      rows: visibleTables(project).map((table) => tablePlacement(table).join("  |  ")),
    },
    ...(ballast.length
      ? [{ title: "Verified ballast materials", rows: ballast.map(requiredText) }]
      : []),
    ...(recipeGaps.length
      ? [{ title: "Recipe unavailable", rows: recipeGaps.map(requiredText) }]
      : []),
    {
      title: "Unresolved imports",
      rows: unknown.filter(({ key }) => !key.startsWith("recipe:")).map(requiredText),
    },
  ];
}

function seamStatus(endpoint: EndpointStatus): string {
  const status = endpoint.status === "height" ? "height mismatch" : endpoint.status;
  const details = [];
  if (endpoint.ambiguous) details.push("ambiguous connector");
  if (endpoint.gap && endpoint.gap > 0.0001) details.push(`${measurement(endpoint.gap)} studs`);
  if (endpoint.angle && Math.abs(endpoint.angle) > 0.0001)
    details.push(`${measurement(endpoint.angle)} deg`);
  if (endpoint.height) details.push(`${endpoint.height} plates`);
  return details.length ? `${status} (${details.join(", ")})` : status;
}

function sectionBlocks(
  project: Project,
  catalog: Catalog,
  analysis: Analysis,
  section: Section,
): PrintBlock[] {
  const tables = visibleTables(project).filter(({ sectionId }) => sectionId === section.id);
  const tableIds = new Set(tables.map(({ id }) => id));
  const layers = new Set(project.layers.filter(({ visible }) => visible).map(({ id }) => id));
  const tableNames = new Map(project.tables.map(({ id, name }) => [id, name]));
  const radii = new Map(catalog.parts.map(({ id, radius }) => [id, radius]));
  const sectionRadii = new Set<number>();
  for (const item of project.items) {
    if (
      item.kind !== "track" ||
      !item.tableId ||
      !tableIds.has(item.tableId) ||
      !layers.has(item.layerId)
    )
      continue;
    const radius = radii.get(item.partId);
    if (radius !== undefined) sectionRadii.add(radius);
  }

  const seams = new Map(analysis.seams.map((seam) => [seam.id, seam]));
  const seamRows: string[] = [];
  for (const seam of project.seams) {
    if (!tableIds.has(seam.tableA) && !tableIds.has(seam.tableB)) continue;
    const result = seams.get(seam.id);
    if (!result || (result.outer.status === "hidden" && result.inner.status === "hidden")) continue;
    const suppliers = seamS8Suppliers(project, analysis, seam);
    const sides = [
      `${tableNames.get(seam.tableA) ?? seam.tableA} (${seam.edgeA})`,
      `${tableNames.get(seam.tableB) ?? seam.tableB} (${seam.edgeB})`,
    ];
    seamRows.push(
      sides.join(" / "),
      `Outer: ${seamStatus(result.outer)}  |  Inner: ${seamStatus(result.inner)}`,
    );
    if (suppliers.length) seamRows.push(`S8 supplied by ${suppliers.join(", ")}`);
  }

  return [
    { title: "Table placement", rows: tables.flatMap(tablePlacement) },
    {
      title: "Named exits",
      rows: section.exits
        .filter(({ tableId }) => tableIds.has(tableId))
        .map(({ name, tableId, edge }) => `${name}  |  ${tableNames.get(tableId)} (${edge})`),
    },
    { title: "Seams", rows: seamRows },
    {
      title: "Curve radii",
      rows: sectionRadii.size
        ? [
            [...sectionRadii]
              .sort((a, b) => a - b)
              .map((radius) => `R${radius}`)
              .join(", "),
          ]
        : [],
    },
  ];
}

function requiredText(row: RequiredRow): string {
  return `${row.required} x ${row.label}`;
}

function commitmentText(row: MemberInventory["rows"][number]): string {
  const required = requiredText(row);
  if (row.committed === null) return `${required}  |  Unconfirmed`;
  const shortfall = row.delta !== null && row.delta < 0 ? `  |  Shortfall ${-row.delta}` : "";
  return `${required}  |  Committed ${row.committed}${shortfall}`;
}

function bringBlocks<Row extends RequiredRow>(
  rows: Row[],
  unknown: RequiredRow[],
  rowText: (row: Row) => string,
): PrintBlock[] {
  return [
    {
      title: "Track required",
      rows: rows.filter(({ key }) => !key.startsWith("ballast:")).map(rowText),
    },
    {
      title: "Verified ballast materials",
      rows: rows.filter(({ key }) => key.startsWith("ballast:")).map(rowText),
    },
    {
      title: "Recipe unavailable",
      rows: unknown.filter(({ key }) => key.startsWith("recipe:")).map(requiredText),
    },
    {
      title: "Unresolved imports and unknown track",
      rows: unknown.filter(({ key }) => !key.startsWith("recipe:")).map(requiredText),
    },
  ];
}

async function showPages(
  pdf: jsPDF,
  project: Project,
  catalog: Catalog,
  analysis: Analysis,
  mode: PdfMode,
  rasterize: (scene: SVGSVGElement) => Promise<HTMLCanvasElement>,
): Promise<void> {
  for (const section of project.sections) {
    pdf.addPage();
    const scene = createScene(project, catalog, analysis, { sharing: true, sectionId: section.id });
    const name = section.name.trim() || "Untitled section";
    const owner = project.members.find(({ id }) => id === section.memberId)?.name;
    const top = pageTitle(pdf, name, `Section detail  |  ${owner || "Unassigned"}`);
    const diagramWidth = 460;
    diagram(
      pdf,
      await rasterize(scene),
      scene.viewBox.baseVal.width,
      mode,
      top + 8,
      diagramWidth,
      footer - top - 38,
    );
    printBlocks(
      pdf,
      sectionBlocks(project, catalog, analysis, section),
      top + 16,
      name,
      margin + diagramWidth + 18,
    );
  }
  const inventory = showInventory(project, catalog);
  for (const member of inventory.members) {
    pdf.addPage();
    const name = member.name.trim() || "Unnamed member";
    const sections = project.sections.filter(({ memberId }) => memberId === member.id);
    const top = pageTitle(pdf, name, "Member bring list");
    const blocks = [
      { title: "Assigned sections", rows: sections.map(({ name: sectionName }) => sectionName) },
      ...bringBlocks(member.rows, member.unknown, commitmentText),
    ];
    printBlocks(pdf, blocks, top + 12, name);
  }
  const unassignedTables = visibleTables(project).filter(({ sectionId }) => !sectionId);
  if (inventory.unassigned.length || unassignedTables.length) {
    pdf.addPage();
    const top = pageTitle(pdf, "Unassigned", "Bring list and table placement");
    const blocks: PrintBlock[] = [];
    if (unassignedTables.length) {
      blocks.push({ title: "Unassigned tables", rows: unassignedTables.flatMap(tablePlacement) });
    }
    for (const { label, rows, unknown } of inventory.unassigned) {
      for (const block of bringBlocks(rows, unknown, requiredText)) {
        if (block.rows.length)
          blocks.push({ title: `${label} / ${block.title}`, rows: block.rows });
      }
    }
    printBlocks(pdf, blocks, top + 12, "Unassigned");
  }
}

export async function sharePdf(
  project: Project,
  catalog: Catalog,
  analysis: Analysis,
  mode: PdfMode,
  rasterize: (scene: SVGSVGElement) => Promise<HTMLCanvasElement>,
): Promise<Blob> {
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter", compress: true });
  const name = project.name.trim() || "Untitled layout";
  pdf.setProperties({ title: name });
  const scene = createScene(project, catalog, analysis, { sharing: true });
  // An upgraded v1 layout has only the implicit local section until show data is added.
  const hasShowDetails = Boolean(
    project.venue ||
    project.members.length ||
    project.sections.some(({ id, exits }) => id !== "local" || exits.length),
  );
  let subtitle = "Plan-view tabletop support";
  if (hasShowDetails) {
    subtitle = project.venue
      ? `Show overview  |  Venue: ${project.venue.width} x ${project.venue.depth} studs`
      : "Show overview";
  }
  overview(pdf, await rasterize(scene), scene.viewBox.baseVal.width, mode, name, subtitle);
  if (hasShowDetails) await showPages(pdf, project, catalog, analysis, mode, rasterize);
  else printBlocks(pdf, legacyInventory(project, catalog), footer);
  const pages = pdf.getNumberOfPages();
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.text(`${page} / ${pages}`, pageWidth - margin, pageHeight - 19, { align: "right" });
  }
  return pdf.output("blob");
}
