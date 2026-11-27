declare const BRICK_TRACK_RELEASE: string;

/** Paths that must remain compatible with the JavaScript bundle that loads them. */
export function releaseAsset(path: string): URL {
  return new URL(`./assets/${BRICK_TRACK_RELEASE}/${path}`, import.meta.url);
}
