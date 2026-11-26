import { encodeWebp } from "./engine";
import type { Analysis } from "./engine";
import type { Catalog, Project } from "./project";
import { createScene, drawingFont, setSceneDetail } from "./scene";
import { svg } from "./scene_drawing";

type ShareFormat = "png" | "webp" | "pdf";
const maxPixels = 12_000_000;

async function embedDrawingFont(scene: SVGSVGElement): Promise<void> {
  if (!scene.querySelector("text")) return;
  const response = await fetch(
    new URL("./fonts/atkinson-hyperlegible-next.woff2", import.meta.url),
  ).catch(() => undefined);
  if (!response?.ok) return;
  const blob = await response.blob();
  const font = await new Promise<string | ArrayBuffer | null>((resolve) => {
    const reader = new FileReader();
    reader.addEventListener("loadend", () => resolve(reader.result), { once: true });
    reader.readAsDataURL(blob);
  });
  // SVG images cannot fetch stylesheets or fonts while being rasterized.
  if (typeof font === "string")
    scene.prepend(
      svg(
        "style",
        {},
        `@font-face { font-family: "${drawingFont}"; src: url("${font}") format("woff2"); font-weight: 200 800; }`,
      ),
    );
}

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
  await embedDrawingFont(scene);
  const contents = new XMLSerializer().serializeToString(scene);
  const url = URL.createObjectURL(new Blob([contents], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => {
      throw new Error("The layout drawing could not be rendered.");
    });
    context.fillStyle = scene.style.backgroundColor;
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
  rasterResolution: "standard" | "high" = "standard",
): Promise<Blob> {
  if (format === "pdf") {
    const { sharePdf } = await import("./share_pdf");
    return sharePdf(project, catalog, analysis, sceneCanvas);
  }
  const scene = createScene(project, catalog, analysis, { sharing: true });
  const canvas = await sceneCanvas(scene, rasterResolution === "high" ? 4096 : 2400);
  return imageBlob(canvas, format);
}
