import { jsPDF } from "jspdf";

import type { Analysis } from "./engine";
import { diagnosticsFor } from "./editor_panels";
import { areaToSignupDimensions } from "./niltc_starters";
import type { Catalog, Project } from "./project";
import { createScene } from "./scene";
import { showInventory } from "./show_inventory";
import type { RequiredRow } from "./show_inventory";

type PrintBlock = { title: string; rows: string[] };
const pageWidth = 792;
const pageHeight = 612;
const margin = 32;
const bodyWidth = pageWidth - 2 * margin;

function title(pdf: jsPDF, heading: string, subtitle: string): number {
  pdf.setTextColor(45);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  const headingLines = pdf.splitTextToSize(heading, bodyWidth) as string[];
  pdf.text(headingLines, margin, 43);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  const subtitleLines = pdf.splitTextToSize(subtitle, bodyWidth) as string[];
  const subtitleTop = 43 + headingLines.length * 25;
  pdf.text(subtitleLines, margin, subtitleTop);
  return subtitleTop + subtitleLines.length * 13 + 12;
}

function printBlocks(pdf: jsPDF, blocks: PrintBlock[], top: number): void {
  let y = top;
  for (const { title: heading, rows } of blocks) {
    if (y > pageHeight - 55) {
      pdf.addPage();
      y = 42;
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text(heading, margin, y, { maxWidth: bodyWidth });
    y += 17;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    for (const row of rows.length ? rows : ["None"]) {
      const lines = pdf.splitTextToSize(row, bodyWidth) as string[];
      if (y + lines.length * 13 > pageHeight - 35) {
        pdf.addPage();
        y = 42;
      }
      pdf.text(lines, margin, y);
      y += lines.length * 13;
    }
    y += 12;
  }
}

function rowText(row: RequiredRow): string {
  return `${row.required} x ${row.label}`;
}

function areaDescription(project: Project): string {
  const { fronts, niltc, exits } = project.area;
  const signup = areaToSignupDimensions(project.area, fronts);
  const kind =
    niltc === "corner"
      ? "NILTC curve"
      : niltc === "straight"
        ? "NILTC straight"
        : "Track design area";
  const edge = fronts.length
    ? `Public edge${fronts.length === 1 ? "" : "s"}: ${fronts.join(", ")}`
    : "No public edge selected";
  const inches = (studs: number): string => String(Number((studs / 3.2).toFixed(2)));
  const size = fronts.length
    ? `Width along track: ${inches(signup.width)} in (${signup.width} studs)  |  Depth from public edge: ${inches(signup.depth)} in (${signup.depth} studs)`
    : `Area width: ${inches(signup.width)} in (${signup.width} studs)  |  Area depth: ${inches(signup.depth)} in (${signup.depth} studs)`;
  return `${kind}  |  ${size}  |  ${edge}  |  ${exits.length} named mainline connection${exits.length === 1 ? "" : "s"}`;
}

function diagram(pdf: jsPDF, canvas: HTMLCanvasElement, sceneWidth: number, top: number): void {
  const width = bodyWidth;
  const height = 265;
  const scale = Math.min(width / canvas.width, height / canvas.height);
  const drawWidth = canvas.width * scale;
  const drawHeight = canvas.height * scale;
  pdf.addImage(
    canvas.toDataURL("image/png"),
    "PNG",
    margin + (width - drawWidth) / 2,
    top + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
    undefined,
    "FAST",
  );
  const pointsPerStud = drawWidth / sceneWidth;
  const scaleStuds = [32, 16, 8, 4].find(
    (studs) => studs * pointsPerStud >= 12 && studs * pointsPerStud <= 120,
  );
  if (!scaleStuds) return;
  const y = top + height + 12;
  const length = scaleStuds * pointsPerStud;
  pdf.setDrawColor(45);
  pdf.line(margin, y, margin + length, y);
  pdf.line(margin, y - 3, margin, y + 3);
  pdf.line(margin + length, y - 3, margin + length, y + 3);
  pdf.setFontSize(9);
  pdf.text(`${scaleStuds} studs`, margin + length + 7, y + 3);
}

export async function sharePdf(
  project: Project,
  catalog: Catalog,
  analysis: Analysis,
  rasterize: (scene: SVGSVGElement) => Promise<HTMLCanvasElement>,
): Promise<Blob> {
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter", compress: true });
  const name = project.name.trim() || "Untitled layout";
  pdf.setProperties({ title: name });
  const scene = createScene(project, catalog, analysis, { sharing: true });
  const top = title(pdf, name, areaDescription(project));
  diagram(pdf, await rasterize(scene), scene.viewBox.baseVal.width, top);
  const inventory = showInventory(project, catalog);
  const exits = project.area.exits.map(
    ({ name: exitName, edge, outer, inner }) =>
      `${exitName} (${edge} edge) - outside: ${outer.pieceId}/${outer.portId}; inside: ${inner.pieceId}/${inner.portId}`,
  );
  const checks = diagnosticsFor(analysis).map(({ message }) => message);
  printBlocks(
    pdf,
    [
      { title: "Mainline connections", rows: exits },
      ...(checks.length ? [{ title: "Layout checks to resolve", rows: checks }] : []),
      { title: "Track required", rows: inventory.track.map(rowText) },
      ...(inventory.ballast.length
        ? [{ title: "Published PennLUG materials", rows: inventory.ballast.map(rowText) }]
        : []),
      ...inventory.groups.map(({ name: groupName, note, rows }) => ({
        title: groupName,
        rows: [...(note ? [note] : []), ...rows.map(rowText)],
      })),
      ...(inventory.buildReferences.length
        ? [
            {
              title: "L-Gauge build references",
              rows: inventory.buildReferences.flatMap(
                ({ title: referenceTitle, source, description }) => [
                  `${referenceTitle}: ${description}`,
                  source,
                ],
              ),
            },
          ]
        : []),
      ...(inventory.unknown.length
        ? [{ title: "Needs attention", rows: inventory.unknown.map(rowText) }]
        : []),
      {
        title: "Build notes",
        rows: [
          "Track shown is positioned in this design area. Keep the named mainline connections clear for the neighboring layout.",
        ],
      },
    ],
    top + 290,
  );
  const pages = pdf.getNumberOfPages();
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.text(`${page} / ${pages}`, pageWidth - margin, pageHeight - 19, { align: "right" });
  }
  return pdf.output("blob");
}
