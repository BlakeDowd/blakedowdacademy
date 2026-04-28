/**
 * Canonical app palette — mirrored in globals.css `:root` for CSS and Tailwind `@theme`.
 */
export const theme = {
  primary: "#065F46",
  secondary: "#F59E0B",
  danger: "#DC2626",
  surface: "#FFFFFF",
  background: "#F9FAFB",
} as const;

export type ThemeColors = typeof theme;
