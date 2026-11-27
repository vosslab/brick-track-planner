export type RouteEndpoint = { pieceId: string; portId: string };
export type RouteLink = {
  from: RouteEndpoint;
  to: RouteEndpoint;
  kind: "internal" | "joint";
  path?: number;
  length?: number;
  radius?: number;
  event?: "switch" | "curve" | "crossing";
};

function endpointKey(endpoint: RouteEndpoint): string {
  return `${endpoint.pieceId}\u0000${endpoint.portId}`;
}

function sameEndpoint(a: RouteEndpoint, b: RouteEndpoint): boolean {
  return a.pieceId === b.pieceId && a.portId === b.portId;
}

/** Returns the installed route between two track ports. */
export function traceRoute(
  links: readonly RouteLink[],
  start: RouteEndpoint,
  destination: RouteEndpoint,
): RouteLink[] | undefined {
  if (sameEndpoint(start, destination)) return [];
  const neighbors = new Map<string, { link: RouteLink; endpoint: RouteEndpoint }[]>();
  for (const link of links) {
    for (const [from, to] of [
      [link.from, link.to],
      [link.to, link.from],
    ] as const) {
      const key = endpointKey(from);
      const choices = neighbors.get(key) ?? [];
      choices.push({ link, endpoint: to });
      neighbors.set(key, choices);
    }
  }
  const destinationKey = endpointKey(destination);
  type State = { endpoint: RouteEndpoint; lastKind?: RouteLink["kind"] };
  const stateKey = (state: State): string =>
    `${endpointKey(state.endpoint)}\u0000${state.lastKind ?? "start"}`;
  const previous = new Map<string, { from: string; link: RouteLink }>();
  const initial: State = { endpoint: start };
  const pending: State[] = [initial];
  const visited = new Set([stateKey(initial)]);
  while (pending.length) {
    const current = pending.shift()!;
    const currentKey = endpointKey(current.endpoint);
    for (const { link, endpoint } of neighbors.get(currentKey) ?? []) {
      if (link.kind === current.lastKind) continue;
      const next: State = { endpoint, lastKind: link.kind };
      const key = stateKey(next);
      if (visited.has(key)) continue;
      visited.add(key);
      previous.set(key, { from: stateKey(current), link });
      if (endpointKey(endpoint) === destinationKey) {
        const route: RouteLink[] = [];
        for (let cursor = key; cursor !== stateKey({ endpoint: start });) {
          const step = previous.get(cursor)!;
          route.unshift(step.link);
          cursor = step.from;
        }
        return route;
      }
      pending.push(next);
    }
  }
  return undefined;
}
