import init, {
  catalog_json,
  encode_webp,
  evaluate_json,
} from "../generated/wasm/track_geometry.js";
import type { Catalog, Point, Project } from "./project";

export type EndpointStatus = {
  status: "joined" | "misaligned" | "height" | "missing" | "hidden";
  gap?: number;
  angle?: number;
  height?: number;
  ambiguous?: boolean;
};

export type Analysis = {
  project: Project;
  ports: {
    pieceId: string;
    portId: string;
    x: number;
    y: number;
    angle: number;
    type: string;
    heightPlates: number;
    joined: boolean;
    ambiguous?: boolean;
  }[];
  seams: { id: string; outer: EndpointStatus; inner: EndpointStatus }[];
  overhangs: { pieceId: string; rings: Point[][] }[];
  noTable: boolean;
  counts: { partId: string; brand: string; name: string; count: number }[];
  unresolved: { id: string; name: string; sourceId: string }[];
};

export async function initEngine(): Promise<Catalog> {
  await init({ module_or_path: new URL("./wasm/track_geometry_bg.wasm", import.meta.url) });
  return JSON.parse(catalog_json()) as Catalog;
}

export function evaluate(
  project: Project,
  draft?: { pieceIds: string[]; radius: number },
): Analysis {
  const draftJson = draft ? JSON.stringify(draft) : "";
  return JSON.parse(evaluate_json(JSON.stringify(project), draftJson)) as Analysis;
}

export function encodeWebp(rgba: Uint8Array, width: number, height: number): Uint8Array {
  return encode_webp(rgba, width, height);
}
