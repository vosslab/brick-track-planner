import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { STARTER_CARDS, createStarter } from "../src/niltc_starters.ts";
import { composePose, newProject, parseProject, worldPose } from "../src/project.ts";
import { exportSection } from "../src/section_files.ts";

const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"));
const tolerance = 1e-6;

for (const [kind, width, mode, endEdge] of [
  ["40x40", 128, "straight", "west"],
  ["60x40-straight", 192, "straight", "west"],
  ["60x40-curve", 192, "corner", "south"],
]) {
  test(`${kind} fills its table and has two connected mainlines with named exits`, () => {
    const starter = createStarter(kind, catalog);
    const project = parseProject(JSON.stringify(starter));
    assert.deepEqual(project, starter);
    const [table] = project.tables;
    const [section] = project.sections;
    assert.equal(project.tables.length, 1);
    assert.equal(project.sections.length, 1);
    assert.deepEqual([table.width, table.depth, table.niltc], [width, 128, mode]);
    assert.deepEqual(table.fronts, mode === "corner" ? ["north", "west"] : ["north"]);
    assert.equal(table.sectionId, section.id);
    assert.equal(section.name, STARTER_CARDS.find((card) => card.kind === kind).title);

    const plates = project.items.filter(({ kind }) => kind === "baseplate");
    const centers = new Set(plates.map(({ x, y }) => `${x},${y}`));
    assert.equal(plates.length, (width / 32) * 4);
    for (let y = 16; y < 128; y += 32) {
      for (let x = 16; x < width; x += 32) assert.ok(centers.has(`${x},${y}`));
    }
    assert.ok(project.items.every(({ tableId }) => tableId === table.id));

    const track = project.items.filter(({ kind }) => kind === "track");
    assert.ok(track.every(({ heightPlates }) => heightPlates === 2));
    const ports = track.flatMap((item) => {
      const part = catalog.parts.find(({ id }) => id === item.partId);
      return part.ports.map((port) => {
        const pose = composePose(port, worldPose(item, project.tables));
        if (part.radius) {
          assert.ok(Math.abs(Math.hypot(pose.x - 128, pose.y - 128) - part.radius) < tolerance);
        }
        return { ...pose, pieceId: item.id, portId: port.id };
      });
    });
    for (const [partId, count] of [
      ["lego:9v-s16", mode === "corner" ? 8 : width / 8],
      ["bricktracks:r104", mode === "corner" ? 8 : 0],
      ["bricktracks:r120", mode === "corner" ? 8 : 0],
    ]) {
      assert.equal(track.filter((item) => item.partId === partId).length, count, partId);
    }

    assert.deepEqual(
      section.exits.map(({ edge, name }) => [edge, name]),
      [
        ["east", "East exit"],
        [endEdge, endEdge === "south" ? "South exit" : "West exit"],
      ],
    );
    const exitPorts = new Set();
    for (const exit of section.exits) {
      for (const [lane, offset] of [
        ["outer", 8],
        ["inner", 24],
      ]) {
        const endpoint = exit[lane];
        const port = ports.find(
          ({ pieceId, portId }) => pieceId === endpoint.pieceId && portId === endpoint.portId,
        );
        assert.ok(port);
        const [x, y, angle] =
          exit.edge === "east"
            ? [width, offset, 0]
            : exit.edge === "south"
              ? [offset, 128, 90]
              : [0, offset, 180];
        assert.ok(Math.hypot(port.x - x, port.y - y) < tolerance);
        assert.equal(port.angle % 360, angle);
        exitPorts.add(port);
      }
    }

    for (const port of ports) {
      const matches = ports.filter(
        (candidate) =>
          candidate.pieceId !== port.pieceId &&
          Math.hypot(candidate.x - port.x, candidate.y - port.y) < tolerance &&
          Math.abs((candidate.angle - port.angle) % 360) === 180,
      );
      assert.equal(matches.length, exitPorts.has(port) ? 0 : 1, `${port.pieceId}/${port.portId}`);
    }
    const { bundle, warnings } = exportSection(project, section.id, table.id);
    assert.deepEqual(bundle.project, project);
    assert.deepEqual(warnings, []);
  });
}

test("Advanced starts with an empty version 2 project", () => {
  assert.deepEqual(createStarter("advanced", { parts: [], kits: [] }), newProject());
});
