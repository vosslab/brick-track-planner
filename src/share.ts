import { encodeWebp } from "./engine";
import type { Analysis } from "./engine";
import type { Catalog, Project } from "./project";
import { createScene, setSceneDetail } from "./scene";

type ShareFormat = "png" | "webp" | "pdf";
type SharingOptions = {
  rasterResolution?: "standard" | "high";
  pdfMode?: "color" | "grayscale";
};
const maxPixels = 12_000_000;

async function sceneCanvas(scene: SVGSVGElement, longSide = 2400): Promise<HTMLCanvasElement> {
  const view = scene.viewBox.baseVal;
  const aspect = Math.max(view.width, view.height) / Math.min(view.width, view.height);
  const long = Math.min(longSide, Math.floor(Math.sqrt(maxPixels * aspect)));
  const short = Math.max(1, Math.floor(long / aspect));
  const [width, height] = view.width >= view.height ? [long, short] : [short, long];
  setSceneDetail(scene, Math.min(width / view.width, height / view.height));
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

export async function exportSharing(
  format: ShareFormat,
  project: Project,
  catalog: Catalog,
  analysis: Analysis,
  options: SharingOptions = {},
): Promise<Blob> {
  if (format === "pdf") {
    const { sharePdf } = await import("./share_pdf");
    return sharePdf(project, catalog, analysis, options.pdfMode ?? "grayscale", sceneCanvas);
  }
  const scene = createScene(project, catalog, analysis, { sharing: true });
  const canvas = await sceneCanvas(scene, options.rasterResolution === "high" ? 4096 : 2400);
  return imageBlob(canvas, format);
}
