/** Display colors for the planner surface, named after LEGO's familiar palette. */
export const baseplateColors = {
  "classic-white": { label: "Classic White", color: "#f4f4f4" },
  "classic-green": { label: "Classic Green", color: "#648754" },
  "bright-green": { label: "Bright Green", color: "#4b9f4a" },
  "classic-blue": { label: "Classic Blue", color: "#0055bf" },
  "dark-blue": { label: "Dark Blue", color: "#0a3463" },
  "light-bley": { label: "Light Bley", color: "#a0a5a9" },
} as const;

export const baseplatePatterns = {
  solid: "Solid color",
  checkerboard: "Checkerboard",
  "vertical-stripes": "Vertical stripes",
  "horizontal-stripes": "Horizontal stripes",
} as const;

export type BaseplateColor = keyof typeof baseplateColors;
export type BaseplatePattern = keyof typeof baseplatePatterns;
export type BaseplateAppearance =
  | { pattern: "solid"; color: BaseplateColor; secondary?: never }
  | {
      pattern: Exclude<BaseplatePattern, "solid">;
      color: BaseplateColor;
      secondary: BaseplateColor;
    };

export const defaultBaseplateAppearance: BaseplateAppearance = {
  pattern: "solid",
  color: "classic-green",
};
