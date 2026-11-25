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
    <DisplayArea>
      <X>${x - width / 2}</X><Y>${y - depth / 2}</Y>
      <Width>${width}</Width><Height>${depth}</Height>
    </DisplayArea>
    <MyGroup>${group ?? ""}</MyGroup>
    <PartNumber>${partNumber}</PartNumber>
    <Orientation>${angle}</Orientation>
    <ActiveConnectionPointIndex>0</ActiveConnectionPointIndex>
    <Altitude>0</Altitude>
    <Connexions count="0" />
  </Brick>`;
}

function fixture(expanded: boolean): string {
  const bricks: string[] = [];
  const groups: string[] = [];
  for (const [index, hand] of ["LEFT", "RIGHT"].entries()) {
    for (const [variant, side] of ["INSIDE", "OUTSIDE"].entries()) {
      const id = (2 * index + variant + 1) * 10;
      const x = 50 + (id - 10) * 8;
      const external = side === "OUTSIDE";
      const alias = `BT SWITCH R104 ${hand} STAND ${side}.8`;
      // BrickTracks 1.1 groups use DisplayArea centers for their leaf transforms.
      // Body and stand heights are 127 and 55 pixels, and the outside stand sits at y=10.3125.
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
        groups.push(`<Group id="${id + 2}"><PartNumber>${alias}</PartNumber><MyGroup /></Group>`);
      } else {
        const width = 127 / 8 + 2 * groupCenterY;
        bricks.push(brick(id, alias, x, 50, width, 337 / 8, 90));
      }
    }
  }
  return `<?xml version="1.0" encoding="utf-8"?>
    <Map><Version>9</Version><Event>BrickTracks stand comparison</Event><Layers>
      <Layer type="brick" id="1"><Name>Switches</Name><Visible>true</Visible>
        <Bricks>${bricks.join("")}</Bricks><Groups>${groups.join("")}</Groups>
      </Layer>
    </Layers></Map>`;
}

async function importFixture(page: Page, text: string): Promise<Project> {
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Import BlueBrick" }).click(),
  ]);
  await chooser.setFiles({
    name: "stands.bbm",
    mimeType: "application/xml",
    buffer: Buffer.from(text),
  });
  const preview = page.getByRole("dialog", { name: "Review BlueBrick import" });
  await expect(preview).toBeVisible();
  await preview.getByRole("button", { name: "Open imported layout" }).click();
  return (await saveProject(page)).project;
}

async function railEndpoints(page: Page): Promise<{ id: string | null; x: number; y: number }[]> {
  const ports = page.locator("#tabletop [data-port-id]");
  await expect(ports).toHaveCount(12);
  return ports.evaluateAll((elements) =>
    elements.map((port) => {
      const marker = port.querySelector("circle");
      return {
        id: port.getAttribute("data-port-id"),
        x: Number(marker?.getAttribute("cx")),
        y: Number(marker?.getAttribute("cy")),
      };
    }),
  );
}

test("imports and places equivalent BrickTracks stand assemblies", async ({ planner }) => {
  const grouped = await importFixture(planner, fixture(true));
  const groupedPorts = await railEndpoints(planner);
  const synthesized = await importFixture(planner, fixture(false));
  const synthesizedPorts = await railEndpoints(planner);
  expect(grouped.items).toHaveLength(8);
  expect(synthesized.items).toHaveLength(8);
  for (const [index, actual] of synthesized.items.entries()) {
    const expected = grouped.items[index];
    if (expected?.kind !== "track" || actual.kind !== "track") {
      throw new Error("Every body and stand must import as a supported physical piece.");
    }
    expect(actual.partId).toBe(expected.partId);
    expect(actual.angle).toBe(expected.angle);
    expect(actual.x).toBeCloseTo(expected.x, 7);
    expect(actual.y).toBeCloseTo(expected.y, 7);
  }
  for (const [index, actual] of synthesizedPorts.entries()) {
    const expected = groupedPorts[index];
    expect(actual.id).toBe(expected?.id);
    expect(actual.x).toBeCloseTo(expected?.x ?? NaN, 7);
    expect(actual.y).toBeCloseTo(expected?.y ?? NaN, 7);
  }

  const variants = ["left-inside", "left-outside", "right-inside", "right-outside"];
  await planner.getByLabel("New project preset").selectOption("blank");
  for (const [index, variant] of variants.entries()) {
    const sourceBody = grouped.items[index * 2];
    const sourceStand = grouped.items[index * 2 + 1];
    await planner.getByRole("button", { name: "New layout" }).click();
    await planner.locator(`[data-kit-id="bricktracks:r104-${variant}"]`).click();
    await planner.getByRole("button", { name: /^Rotate 90/ }).click();
    await planner.locator("#tabletop").press("Enter");
    const { project } = await saveProject(planner);
    expect(project.items).toHaveLength(2);
    const [body, stand] = project.items;
    if (
      body?.kind !== "track" ||
      stand?.kind !== "track" ||
      sourceBody?.kind !== "track" ||
      sourceStand?.kind !== "track"
    ) {
      throw new Error("Expected a supported turnout body and stand in both layouts.");
    }
    expect(body).toMatchObject({ partId: sourceBody.partId, angle: sourceBody.angle });
    expect(stand).toMatchObject({ partId: sourceStand.partId, angle: sourceStand.angle });
    expect(stand.x - body.x).toBeCloseTo(sourceStand.x - sourceBody.x, 7);
    expect(stand.y - body.y).toBeCloseTo(sourceStand.y - sourceBody.y, 7);
  }
});
