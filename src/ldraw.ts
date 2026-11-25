import { composePose, worldPose } from "./project";
import type { Catalog, Pose, Project } from "./project";

type Mapping = {
  filename: string;
  origin: Pose;
  baseY: number;
  color: number;
  url?: string;
};

const brickTracksZip = "https://l-gauge.org/downloads/BricktracksCurvesRev1.0.zip";

// Origins are measured in the planner's local studs, including the DAT's rotation.
// LEGO anchors: official 2865a, 2867a, 2859, and 2861 end sleepers (LDraw.org).
// BrickTracks anchors: s/2865s04.dat connector references in Gale's L-Gauge DATs.
const mappings = new Map<string, Mapping>([
  ["lego:9v-s16", { filename: "74746.dat", origin: { x: 0, y: 0, angle: 0 }, baseY: -8, color: 8 }],
  [
    "lego:9v-r40",
    {
      filename: "74747.dat",
      origin: { x: -0.383887097, y: -0.606411228, angle: 11.25 },
      baseY: -8,
      color: 8,
    },
  ],
  [
    "lego:9v-r40-left",
    {
      filename: "75542c01-f1.dat",
      origin: { x: -0.9375, y: 6.375, angle: 0 },
      baseY: -8,
      color: 8,
    },
  ],
  [
    "lego:9v-r40-right",
    {
      filename: "75541c01-f1.dat",
      origin: { x: -0.9375, y: -6.375, angle: 0 },
      baseY: -8,
      color: 8,
    },
  ],
  [
    "bricktracks:r104",
    {
      filename: "BrickTracksR104.dat",
      origin: { x: 9.399214163, y: 3.022402515, angle: -78.75 },
      baseY: 0,
      color: 72,
      url: brickTracksZip,
    },
  ],
  [
    "bricktracks:r120",
    {
      filename: "BrickTracksR120.dat",
      origin: { x: 10.721886486, y: 3.387534823, angle: -78.75 },
      baseY: 0,
      color: 72,
      url: brickTracksZip,
    },
  ],
]);

type LDrawExport = {
  text: string;
  omitted: { name: string; count: number }[];
  custom: { filename: string; url: string }[];
};

function partReference(pose: Pose, heightPlates: number, mapping: Mapping): string {
  const origin = composePose(mapping.origin, pose);
  const radians = (origin.angle % 360) * (Math.PI / 180);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  // LDraw top view has +X right and +Z up. The planner's downward Y maps to -Z.
  const transform = [
    origin.x * 20,
    mapping.baseY - 8 * heightPlates,
    -origin.y * 20,
    cos,
    0,
    sin,
    0,
    1,
    0,
    -sin,
    0,
    cos,
  ];
  if (!transform.every(Number.isFinite))
    throw new Error("Track placement exceeds LDraw numeric range.");
  const coordinates = transform.map((value) => Number(value.toFixed(6))).join(" ");
  return `1 ${mapping.color} ${coordinates} ${mapping.filename}`;
}

export function exportLDraw(project: Project, catalog: Catalog): LDrawExport {
  const visibleLayers = new Set(
    project.layers.filter(({ visible }) => visible).map(({ id }) => id),
  );
  const parts = new Map(catalog.parts.map((part) => [part.id, part]));
  const omitted = new Map<string, { name: string; count: number }>();
  const custom = new Map<string, string>();
  const lines = ["0 Brick Track Planner track layout"];
  for (const item of project.items) {
    if (!visibleLayers.has(item.layerId) || item.kind === "baseplate") continue;
    const mapping = item.kind === "track" ? mappings.get(item.partId) : undefined;
    if (item.kind === "track" && mapping) {
      lines.push(partReference(worldPose(item, project.tables), item.heightPlates, mapping));
      if (mapping.url) custom.set(mapping.filename, mapping.url);
    } else {
      const part = item.kind === "track" ? parts.get(item.partId) : undefined;
      const key = item.kind === "track" ? item.partId : item.name;
      const name = part
        ? `${part.brand} ${part.name}`
        : item.kind === "track"
          ? item.partId
          : item.name;
      const previous = omitted.get(key);
      omitted.set(key, { name, count: (previous?.count ?? 0) + 1 });
    }
  }
  return {
    text: `${lines.join("\r\n")}\r\n`,
    omitted: [...omitted.values()],
    custom: [...custom].map(([filename, url]) => ({ filename, url })),
  };
}
