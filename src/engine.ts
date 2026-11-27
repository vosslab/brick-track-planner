import init, {
  catalog_json,
  encode_webp,
  evaluate_json,
} from "../generated/wasm/track_geometry.js";
import type { Catalog, Point, Project } from "./project";

export type NiltcIssue =
  | { kind: "missing-mainline"; lane: "outer" | "inner" }
  | { kind: "mainline-height"; lane: "outer" | "inner"; itemId: string }
  | { kind: "exit-off-standard"; lane: "outer" | "inner"; exitId: string }
  | { kind: "exit-away-from-boundary"; lane: "outer" | "inner"; exitId: string }
  | {
      kind: "mainline-radius";
      lane: "outer" | "inner";
      itemId: string;
      expectedRadius: number;
      actualRadius: number;
      minimumRadius: boolean;
    }
  | { kind: "mainline-curve-sweep"; lane: "outer" | "inner"; actualDegrees: number }
  | {
      kind: "mainline-event-spacing";
      lane: "outer" | "inner";
      previousItemId: string;
      itemId: string;
      requiredStuds: number;
      actualStuds: number;
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
  niltcIssues: NiltcIssue[];
  unresolved: { id: string; name: string; sourceId: string }[];
};

export async function initEngine(): Promise<Catalog> {
  await init({ module_or_path: new URL("./wasm/track_geometry_bg.wasm", import.meta.url) });
  return JSON.parse(catalog_json()) as Catalog;
}

export function evaluate(project: Project): Analysis {
  return JSON.parse(evaluate_json(JSON.stringify(project))) as Analysis;
}

export function encodeWebp(rgba: Uint8Array, width: number, height: number): Uint8Array {
  return encode_webp(rgba, width, height);
}
