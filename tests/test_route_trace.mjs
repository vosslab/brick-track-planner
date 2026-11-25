import assert from "node:assert/strict";

import { traceRoute } from "../src/route_trace.ts";

const endpoint = (pieceId, portId) => ({ pieceId, portId });
const mainline = endpoint("main", "west");
const yard = endpoint("yard", "east");
const links = [
  { from: mainline, to: endpoint("switch", "common"), kind: "joint" },
  { from: endpoint("switch", "common"), to: endpoint("switch", "branch"), kind: "internal" },
  { from: endpoint("switch", "branch"), to: yard, kind: "joint" },
];
assert.deepEqual(traceRoute(links, mainline, yard), links);
assert.equal(traceRoute(links, mainline, endpoint("missing", "port")), undefined);

const branchToBranch = [
  { from: mainline, to: endpoint("switch", "left"), kind: "joint" },
  { from: endpoint("switch", "common"), to: endpoint("switch", "left"), kind: "internal" },
  { from: endpoint("switch", "common"), to: endpoint("switch", "right"), kind: "internal" },
  { from: endpoint("switch", "right"), to: yard, kind: "joint" },
];
assert.equal(traceRoute(branchToBranch, mainline, yard), undefined);
