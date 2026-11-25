import { composePose, poseConnectingPorts } from "./project";
import type { Catalog, Kit, Pose } from "./project";
import { createTurnbackWye } from "./turnback_wye";
import { createDriveThroughYard } from "./drive_through_yard";

/** Two LEGO R40 switches have opposite hands so their common ends stay on the same mainline. */
export function createParkingKits(catalog: Catalog, storageStuds = 64): Kit[] {
  if (!Number.isSafeInteger(storageStuds) || storageStuds < 0 || storageStuds % 16) return [];
  const byId = new Map(catalog.parts.map((part) => [part.id, part]));
  function attach(
    parts: Kit["parts"],
    partId: string,
    incoming: string,
    target: Pose,
  ): (id: string) => Pose {
    const part = byId.get(partId);
    const inlet = part?.ports.find((port) => port.id === incoming);
    if (!inlet || !part) throw new Error(`Missing parking track connector ${partId}/${incoming}.`);
    const placed = { partId, ...poseConnectingPorts(inlet, target) };
    parts.push(placed);
    return (id: string): Pose => {
      const end = part.ports.find((port) => port.id === id);
      if (!end) throw new Error(`Missing parking track connector ${partId}/${id}.`);
      return composePose(end, placed);
    };
  }

  function straights(parts: Kit["parts"], start: Pose, length: number): Pose {
    let end = start;
    for (let studs = 0; studs < length; studs += 16)
      end = attach(parts, "lego:rc-s16", "a", end)("b");
    return end;
  }

  const backOutParts: Kit["parts"] = [];
  const entrance = attach(backOutParts, "lego:rc-r40-right-switch", "common", {
    x: 0,
    y: 0,
    angle: 0,
  });
  const rearParts = [...backOutParts];
  const storageStart = attach(backOutParts, "lego:rc-r40", "b", entrance("branch"))("a");
  straights(backOutParts, storageStart, storageStuds);
  const backOut: Kit = {
    id: "parking:r40-back-out",
    brand: "LEGO",
    name: "Back-out parking siding",
    notes:
      "A right switch and return curve lead to a terminal storage track. Back the parked train out to rejoin the mainline.",
    parts: backOutParts,
  };

  let rearStorageStart = entrance("branch");
  for (let curve = 0; curve < 7; curve++)
    rearStorageStart = attach(rearParts, "lego:rc-r40", "a", rearStorageStart)("b");
  straights(rearParts, rearStorageStart, storageStuds);
  const rear: Kit = {
    id: "parking:r40-rear-siding",
    brand: "LEGO",
    name: "Rear parking siding",
    notes:
      "A right switch and seven R40 curves turn behind the display into a terminal storage track.",
    parts: rearParts,
  };

  const driveThroughParts = [...backOutParts];
  // Each return curve ends one S16 farther along than its turnout's through connector.
  const mainlineEnd = straights(driveThroughParts, entrance("through"), storageStuds + 32);
  const rejoining = attach(driveThroughParts, "lego:rc-r40-left-switch", "through", mainlineEnd);
  attach(driveThroughParts, "lego:rc-r40", "a", rejoining("branch"));
  return [
    backOut,
    {
      id: "parking:r40-drive-through",
      brand: "LEGO",
      name: "Drive-through parking siding",
      notes: "Opposite-handed switches connect both ends of the storage track to the mainline.",
      parts: driveThroughParts,
    },
    rear,
    createTurnbackWye(catalog, storageStuds),
    createDriveThroughYard(catalog, storageStuds),
  ];
}

export function withParkingKits(catalog: Catalog, storageStuds = 64): Catalog {
  return {
    ...catalog,
    kits: [
      ...catalog.kits.filter((kit) => !kit.id.startsWith("parking:")),
      ...createParkingKits(catalog, storageStuds),
    ],
  };
}
