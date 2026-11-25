import type { jsPDF } from "jspdf";

import { encodeWebp } from "./engine";
import type { Analysis } from "./engine";
import type { Catalog, Project } from "./project";
import { createScene } from "./scene";

type ShareFormat = "png" | "webp" | "pdf";
const rasterLimit = 2400;
const pageMargin = 32;

async function sceneCanvas(scene: SVGSVGElement): Promise<HTMLCanvasElement> {
  const view = scene.viewBox.baseVal;
  const scale = rasterLimit / Math.max(view.width, view.height);
  const width = Math.max(1, Math.round(view.width * scale));
  const height = Math.max(1, Math.round(view.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("A canvas is required to export the layout.");

  scene.setAttribute("width", String(width));
  scene.setAttribute("height", String(height));
  const contents = new XMLSerializer().serializeToString(scene);
  const url = URL.createObjectURL(new Blob([contents], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = (): void => resolve();
      image.onerror = (): void => reject(new Error("The layout drawing could not be rendered."));
      image.src = url;
    });
    context.fillStyle = "#faf6ee";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0);
  } finally {
    URL.revokeObjectURL(url);
  }
  return canvas;
}

async function imageBlob(canvas: HTMLCanvasElement, format: "png" | "webp"): Promise<Blob> {
  const type = `image/${format}`;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
  if (blob?.type === type) return blob;
  if (format === "webp") {
    const pixels = new Uint8Array(rasterPixels(canvas).data);
    const encoded = encodeWebp(pixels, canvas.width, canvas.height);
    if (encoded.length > 0) return new Blob([new Uint8Array(encoded)], { type });
  }
  throw new Error(`The ${format.toUpperCase()} image could not be encoded.`);
}

function rasterPixels(canvas: HTMLCanvasElement): ImageData {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The layout pixels could not be read.");
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function grayscaleImage(canvas: HTMLCanvasElement): string {
  const pixels = rasterPixels(canvas);
  const data = pixels.data;
  for (let offset = 0; offset < data.length; offset += 4) {
    const red = data[offset] ?? 0;
    const green = data[offset + 1] ?? 0;
    const blue = data[offset + 2] ?? 0;
    const shade = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    data[offset] = shade;
    data[offset + 1] = shade;
    data[offset + 2] = shade;
  }
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The layout pixels could not be read.");
  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL("image/png");
}

function diagramPage(
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  project: Project,
  sceneWidth: number,
): void {
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  const title = wrappedText(pdf, project.name || "Untitled layout", width - 2 * pageMargin);
  if (title.length > 2) title.splice(1, title.length, `${title[1]?.slice(0, -3) ?? ""}...`);
  if (title.length === 0) title.push("Untitled layout");
  pdf.text(title, pageMargin, 43);
  const subtitle = 61 + (title.length - 1) * 26;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(45);
  pdf.text("Plan-view tabletop support", pageMargin, subtitle);
  const top = subtitle + 14;
  const bottom = height - 106;
  const scale = Math.min((width - 2 * pageMargin) / canvas.width, (bottom - top) / canvas.height);
  const drawWidth = canvas.width * scale;
  const drawHeight = canvas.height * scale;
  pdf.addImage(
    grayscaleImage(canvas),
    "PNG",
    (width - drawWidth) / 2,
    top + (bottom - top - drawHeight) / 2,
    drawWidth,
    drawHeight,
    undefined,
    "FAST",
  );
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(45);
  const pointsPerStud = drawWidth / sceneWidth;
  const scaleStuds = [32, 16, 8, 4, 2, 1].find(
    (studs) => studs * pointsPerStud <= Math.min(drawWidth, 170) && studs * pointsPerStud >= 6,
  );
  if (scaleStuds) {
    const scaleLength = scaleStuds * pointsPerStud;
    const y = height - 89;
    pdf.setDrawColor(45);
    pdf.setLineWidth(0.65);
    pdf.line(pageMargin, y, pageMargin + scaleLength, y);
    pdf.line(pageMargin, y - 3, pageMargin, y + 3);
    pdf.line(pageMargin + scaleLength, y - 3, pageMargin + scaleLength, y + 3);
    pdf.text(`${scaleStuds} studs`, pageMargin + scaleLength + 8, y + 3);
  }
  pdf.text("32-stud grid / fit to page", pageMargin, height - 72);
  pdf.text(
    "Heavy solid lines mark the front edge. Dashed and dotted guides sit 8 and 24 studs in.",
    pageMargin,
    height - 58,
  );
  pdf.text(
    "Open circles show open track ends. Diamonds mark joins. Warning diamonds mark ambiguity.",
    pageMargin,
    height - 45,
  );
  pdf.text("Dashed hatching marks track outside the tabletops.", pageMargin, height - 32);
  pdf.text(
    "Signed plate values (pl) are heights relative to the layout reference level.",
    pageMargin,
    height - 19,
  );
}

function wrappedText(pdf: jsPDF, text: string, width: number): string[] {
  return pdf.splitTextToSize(text, width) as string[];
}

type PrintSection = { title: string; rows: string[] };

function inventorySections(project: Project, analysis: Analysis): PrintSection[] {
  const visible = new Set(project.layers.filter((layer) => layer.visible).map((layer) => layer.id));
  return [
    {
      title: "Visible track inventory",
      rows: analysis.counts.map(
        ({ count, brand, name, partId }) => `${count} x ${brand} ${name}  [${partId}]`,
      ),
    },
    {
      title: "Visible tabletops",
      rows: project.tables
        .filter((table) => visible.has(table.layerId))
        .map((table) => {
          const actual = `${table.width} x ${table.depth} studs`;
          return `${table.name}  |  Nominal: ${table.nominal ?? "custom"}  |  Measured: ${actual}`;
        }),
    },
    {
      title: "Unresolved imports",
      rows: analysis.unresolved.map(({ name, sourceId }) => `${name}  [${sourceId}]`),
    },
  ];
}

function inventoryPages(pdf: jsPDF, sections: PrintSection[]): void {
  const width = pdf.internal.pageSize.getWidth() - 2 * pageMargin;
  const bottom = pdf.internal.pageSize.getHeight() - 36;
  let y = bottom;

  function openSection(title: string): void {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text(title, pageMargin, y);
    y += 19;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
  }

  for (const { title, rows } of sections) {
    if (y + 38 > bottom) {
      pdf.addPage();
      y = 47;
    }
    openSection(title);
    for (const row of rows.length ? rows : ["None"]) {
      for (const line of wrappedText(pdf, row, width)) {
        if (y > bottom) {
          pdf.addPage();
          y = 47;
          openSection(`${title} (continued)`);
        }
        pdf.text(line, pageMargin, y);
        y += 14;
      }
    }
    y += 15;
  }
}

async function pdfBlob(
  canvas: HTMLCanvasElement,
  project: Project,
  analysis: Analysis,
  sceneWidth: number,
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter", compress: true });
  pdf.setProperties({ title: project.name });
  diagramPage(pdf, canvas, project, sceneWidth);
  inventoryPages(pdf, inventorySections(project, analysis));
  const pages = pdf.getNumberOfPages();
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.text(
      `${page} / ${pages}`,
      pdf.internal.pageSize.getWidth() - pageMargin,
      pdf.internal.pageSize.getHeight() - 19,
      { align: "right" },
    );
  }
  return pdf.output("blob");
}

export async function exportSharing(
  format: ShareFormat,
  project: Project,
  catalog: Catalog,
  analysis: Analysis,
): Promise<Blob> {
  const scene = createScene(project, catalog, analysis, { sharing: true });
  const canvas = await sceneCanvas(scene);
  if (format === "pdf") return pdfBlob(canvas, project, analysis, scene.viewBox.baseVal.width);
  return imageBlob(canvas, format);
}
