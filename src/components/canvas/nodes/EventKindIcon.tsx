import {
  CircleRegular as Circle,
  DiamondRegular as Diamond,
  HomeRegular as Home,
  OvalRegular as Egg,
  RectangleLandscapeRegular as RectangleHorizontal,
  TriangleRegular as Triangle,
} from "@fluentui/react-icons";
import type { EventKind } from "@/types/fta";

const ICONS: Record<EventKind, typeof Circle> = {
  basic: Circle,
  undeveloped: Diamond,
  house: Home,
  conditional: Egg,
  intermediate: RectangleHorizontal,
  transfer: Triangle,
};

const COLORS: Record<EventKind, string> = {
  basic: "var(--event-basic)",
  undeveloped: "var(--event-undeveloped)",
  house: "var(--event-house)",
  conditional: "var(--event-conditional)",
  intermediate: "var(--muted-foreground)",
  transfer: "var(--event-transfer)",
};

export function EventKindIcon({ kind, className }: { kind: EventKind; className?: string }) {
  const Icon = ICONS[kind];
  return <Icon className={className} style={{ color: COLORS[kind] }} />;
}
