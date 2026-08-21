import { createLightTheme, createDarkTheme, type BrandVariants, type Theme } from "@fluentui/react-components";

/**
 * The app's existing accent (`--primary` in index.css) is a medium blue at
 * OKLCH hue ~255 — close to Microsoft's own default Fluent brand ramp, so we
 * reuse that well-tested 16-step ramp rather than hand-deriving one: it's
 * already accessibility-verified across every shade or Fluent wouldn't ship
 * it as the default. Neutral (background/foreground/border) tokens are left
 * as Fluent's own defaults too — its near-white/near-black neutral ramp
 * already closely matches this app's OKLCH backgrounds, so no override was
 * needed there.
 */
const brand: BrandVariants = {
  10: "#020305",
  20: "#111823",
  30: "#16263D",
  40: "#193253",
  50: "#1B3F6A",
  60: "#1B4C82",
  70: "#18599C",
  80: "#0F67B1",
  90: "#0078D4",
  100: "#1A86D9",
  110: "#3593DD",
  120: "#4EA0E1",
  130: "#66ADE5",
  140: "#7DBAE8",
  150: "#93C7EC",
  160: "#A9D3EF",
};

export const appLightTheme: Theme = createLightTheme(brand);
export const appDarkTheme: Theme = createDarkTheme(brand);
