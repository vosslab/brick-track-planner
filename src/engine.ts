import init, {
  catalog_json,
  encode_webp,
  evaluate_json,
} from "../generated/wasm/track_geometry.js";
import type { Catalog, Point, Project } from "./project";
import { releaseAsset } from "./release_assets";

export type Analysis = {
  project: Project;
  ports: {
    pieceId: string;
    portId: string;
    x: number;
    y: number;
    angle: number;
    type: string;
    joined: boolean;
    ambiguous?: boolean;
  }[];
  routes: {
    from: { pieceId: string; portId: string };
    to: { pieceId: string; portId: string };
    kind: "internal" | "joint";
    path?: number;
    length?: number;
    radius?: number;
    turn?: number;
    event?: "switch" | "curve" | "crossing";
  }[];
  overhangs: { pieceId: string; rings: Point[][] }[];
  unresolved: { id: string; name: string; sourceId: string }[];
};

export async function initEngine(): Promise<Catalog> {
  await init({ module_or_path: releaseAsset("wasm/track_geometry_bg.wasm") });
  return JSON.parse(catalog_json()) as Catalog;
}

export function evaluate(project: Project): Analysis {
  return JSON.parse(evaluate_json(JSON.stringify(project))) as Analysis;
}

export function encodeWebp(rgba: Uint8Array, width: number, height: number): Uint8Array {
  return encode_webp(rgba, width, height);
}
