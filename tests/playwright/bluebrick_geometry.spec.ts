import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import type { Project } from "../../src/project";
import { saveProject, test } from "./helper_planner";

function brick(
  id: number,
  partNumber: string,
  x: number,
  y: number,
  width: number,
  depth: number,
  angle: number,
  group?: number,
): string {
  return `<Brick id="${id}">
    <DisplayArea><X>${x - width / 2}</X><Y>${y - depth / 2}</Y><Width>${width}</Width><Height>${depth}</Height></DisplayArea>
    <MyGroup>${group ?? ""}</MyGroup><PartNumber>${partNumber}</PartNumber><Orientation>${angle}</Orientation>
    <ActiveConnectionPointIndex>0</ActiveConnectionPointIndex><Altitude>0</Altitude><Connexions count="0" />
  </Brick>`;
}

function fixture(expanded: boolean): string {
  const bricks: string[] = [];
  for (const [index, hand] of ["LEFT", "RIGHT"].entries()) {
    for (const [variant, side] of ["INSIDE", "OUTSIDE"].entries()) {
      const id = (2 * index + variant + 1) * 10;
      const x = 50 + (id - 10) * 8;
      const external = side === "OUTSIDE";
      const groupCenterY = external ? (10.3125 + 55 / 16 - 127 / 16) / 2 : 0;
      if (expanded) {
        const standX = hand === "LEFT" ? -16.0625 : 15.9375;
        const standY = external ? 10.3125 : -2.6875;
        bricks.push(
          brick(id, `BT SWITCH R104 ${hand}.8`, x + groupCenterY, 50, 127 / 8, 337 / 8, 90, id + 2),
          brick(
            id + 1,
            "BT SWITCH STAND.8",
            x + groupCenterY - standY,
            50 + standX,
            55 / 8,
            24 / 8,
            external ? 270 : 90,
            id + 2,
          ),
        );
      } else {
        const alias = `BT SWITCH R104 ${hand} STAND ${side}.8`;
        bricks.push(brick(id, alias, x, 50, 127 / 8 + 2 * groupCenterY, 337 / 8, 90));
      }
    }
  }
  return `<?xml version="1.0" encoding="utf-8"?>
    <Map><Version>9</Version><Event>Rotated turnout aliases</Event><Layers>
      <Layer type="brick" id="1"><Name>Track</Name><Visible>true</Visible><Bricks>${bricks.join("")}</Bricks><Groups /></Layer>
    </Layers></Map>`;
}

async function importFixture(page: Page, text: string): Promise<Project> {
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Import BlueBrick" }).click(),
  ]);
  await chooser.setFiles({
    name: "turnouts.bbm",
    mimeType: "application/xml",
    buffer: Buffer.from(text),
  });
  const preview = page.getByRole("dialog", { name: "Review BlueBrick import" });
  await expect(preview).toBeVisible();
  await preview.getByRole("button", { name: "Open imported layout" }).click();
  return (await saveProject(page)).project;
}

test("an unknown rotated BlueBrick piece retains its original display bounds", async ({
  planner,
}) => {
  const xml = `<Map><Version>9</Version><Layers><Layer type="brick" id="1"><Name>Track</Name><Visible>true</Visible><Bricks>${brick(1, "Unknown track", 24, 12, 8, 40, 90)}</Bricks></Layer></Layers></Map>`;
  const project = await importFixture(planner, xml);
  expect(project.items[0]).toMatchObject({ kind: "unresolved", angle: 90, width: 8, depth: 40 });
  expect(project.area).toMatchObject({ width: 40, depth: 72 });
});

test("imports floated and rotated BrickTracks aliases with equivalent track geometry", async ({
  planner,
}) => {
  const expanded = await importFixture(planner, fixture(true));
  const synthesized = await importFixture(planner, fixture(false));

  expect(expanded.area).toEqual(synthesized.area);
  expect(expanded.items).toHaveLength(8);
  expect(synthesized.items).toHaveLength(8);
  for (const [index, actual] of synthesized.items.entries()) {
    const expected = expanded.items[index];
    if (expected?.kind !== "track" || actual.kind !== "track")
      throw new Error("Expected physical track.");
    expect(actual.partId).toBe(expected.partId);
    expect(actual.angle).toBeCloseTo(expected.angle, 8);
    expect(actual.x).toBeCloseTo(expected.x, 7);
    expect(actual.y).toBeCloseTo(expected.y, 7);
    expect(actual.groupId).toBeTruthy();
    expect(actual.arrangementId).toMatch(/^bricktracks:r104-/);
  }
  await expect(planner.locator("#tabletop [data-track-scene]")).toBeVisible();
});
