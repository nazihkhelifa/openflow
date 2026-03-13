export const DEFAULT_CUSTOM_BEZIER: [number, number, number, number] = [0.42, 0, 0.58, 1];

export const PRESET_BEZIERS = {
  easeInExpoOutCubic: [0.85, 0, 0.15, 1],
  easeInOutExpo: [0.87, 0, 0.13, 1],
  easeInQuartOutQuad: [0.8, 0, 0.2, 1],
  easeInOutCubic: [0.65, 0, 0.35, 1],
  easeInOutSine: [0.37, 0, 0.63, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

export type EasingPresetName = keyof typeof PRESET_BEZIERS;

export const EASING_PRESETS: EasingPresetName[] = [
  'easeInExpoOutCubic', 'easeInOutExpo', 'easeInQuartOutQuad', 'easeInOutCubic', 'easeInOutSine',
];

// Cubic-bezier values for standard easings from easings.net (ai/easings.net).
// Hybrid easings (easeInExpoOutCubic, easeInQuartOutQuad) are approximations
// since asymmetric compositions can't be exactly represented by a single cubic bezier.
const EASING_BEZIER_MAP: Record<string, readonly [number, number, number, number]> = {
  ...PRESET_BEZIERS,
  linear:         [0, 0, 1, 1],
  easeInSine:     [0.12, 0, 0.39, 0],
  easeOutSine:    [0.61, 1, 0.88, 1],
  easeInQuad:     [0.11, 0, 0.5, 0],
  easeOutQuad:    [0.5, 1, 0.89, 1],
  easeInOutQuad:  [0.45, 0, 0.55, 1],
  easeInCubic:    [0.32, 0, 0.67, 0],
  easeOutCubic:   [0.33, 1, 0.68, 1],
  easeInQuart:    [0.5, 0, 0.75, 0],
  easeOutQuart:   [0.25, 1, 0.5, 1],
  easeInOutQuart: [0.76, 0, 0.24, 1],
  easeInQuint:    [0.64, 0, 0.78, 0],
  easeOutQuint:   [0.22, 1, 0.36, 1],
  easeInOutQuint: [0.83, 0, 0.17, 1],
  easeInExpo:     [0.7, 0, 0.84, 0],
  easeOutExpo:    [0.16, 1, 0.3, 1],
  easeInCirc:     [0.55, 0, 1, 0.45],
  easeOutCirc:    [0, 0.55, 0.45, 1],
  easeInOutCirc:  [0.85, 0, 0.15, 1],
};

export function getPresetBezier(preset?: string | null): [number, number, number, number] {
  const handles = preset ? PRESET_BEZIERS[preset as EasingPresetName] : null;
  const source = handles ?? DEFAULT_CUSTOM_BEZIER;
  return [...source] as [number, number, number, number];
}

export function getEasingBezier(name?: string | null): [number, number, number, number] {
  const handles = name ? EASING_BEZIER_MAP[name] : null;
  const source = handles ?? DEFAULT_CUSTOM_BEZIER;
  return [...source] as [number, number, number, number];
}
