export const APPEARANCE_STORAGE_KEY = 'branch-studio.appearance.v1';
export const textScales = [100, 110, 125, 150] as const;
export const codeFontSizes = [12, 14, 16, 18, 20, 24] as const;

export interface AppearancePreferences {
  textScale: (typeof textScales)[number];
  codeFontSize: (typeof codeFontSizes)[number];
}

export const defaultAppearance: AppearancePreferences = {
  textScale: 100,
  codeFontSize: 12,
};

/** Preferences belong to this device, independently of imported projects. */
export function parseAppearance(value: unknown): AppearancePreferences {
  if (!value || typeof value !== 'object') return { ...defaultAppearance };
  const input = value as Record<string, unknown>;
  return {
    textScale: textScales.includes(input.textScale as AppearancePreferences['textScale'])
      ? (input.textScale as AppearancePreferences['textScale'])
      : defaultAppearance.textScale,
    codeFontSize: codeFontSizes.includes(
      input.codeFontSize as AppearancePreferences['codeFontSize'],
    )
      ? (input.codeFontSize as AppearancePreferences['codeFontSize'])
      : defaultAppearance.codeFontSize,
  };
}
