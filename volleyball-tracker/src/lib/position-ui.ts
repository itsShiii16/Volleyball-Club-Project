export type PositionCode = string;

export function normPos(p?: string) {
  return (p ?? "").trim().toUpperCase();
}

/**
 * Choose HIGH-CONTRAST colors (ring + bg + text) so labels are readable.
 * You can adjust colors any time without touching logic.
 */
export function positionColors(posRaw?: string) {
  const pos = normPos(posRaw);

  // Tailwind class sets
  const map: Record<string, { chipBg: string; chipText: string; ring: string; badgeBg: string; badgeText: string }> = {
    // Middle Blocker
    "MB": { chipBg: "bg-violet-500", chipText: "text-white", ring: "ring-violet-300", badgeBg: "bg-violet-100", badgeText: "text-violet-900" },

    // Wing Spiker / Outside / OH
    "WS": { chipBg: "bg-sky-500", chipText: "text-white", ring: "ring-sky-300", badgeBg: "bg-sky-100", badgeText: "text-sky-900" },
    "OH": { chipBg: "bg-sky-500", chipText: "text-white", ring: "ring-sky-300", badgeBg: "bg-sky-100", badgeText: "text-sky-900" },

    // Setter
    "S":  { chipBg: "bg-emerald-500", chipText: "text-white", ring: "ring-emerald-300", badgeBg: "bg-emerald-100", badgeText: "text-emerald-900" },
    "SETTER": { chipBg: "bg-emerald-500", chipText: "text-white", ring: "ring-emerald-300", badgeBg: "bg-emerald-100", badgeText: "text-emerald-900" },

    // Libero
    "L":  { chipBg: "bg-amber-500", chipText: "text-black", ring: "ring-amber-300", badgeBg: "bg-amber-100", badgeText: "text-amber-900" },
    "LIBERO": { chipBg: "bg-amber-500", chipText: "text-black", ring: "ring-amber-300", badgeBg: "bg-amber-100", badgeText: "text-amber-900" },

    // Opposite
    "OPP": { chipBg: "bg-rose-500", chipText: "text-white", ring: "ring-rose-300", badgeBg: "bg-rose-100", badgeText: "text-rose-900" },
    "OP":  { chipBg: "bg-rose-500", chipText: "text-white", ring: "ring-rose-300", badgeBg: "bg-rose-100", badgeText: "text-rose-900" },
  };

  return (
    map[pos] ??
    { chipBg: "bg-gray-500", chipText: "text-white", ring: "ring-gray-300", badgeBg: "bg-gray-100", badgeText: "text-gray-900" }
  );
}
