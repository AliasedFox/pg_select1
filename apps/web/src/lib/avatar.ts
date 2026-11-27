/**
 * A two-hue gradient for a user's avatar that looks random but is the same every time for the
 * same seed (a user's id), so a user keeps their colors across visits and renames. Both stops are
 * light enough for black text, in the light and dark themes alike.
 */
export function avatarGradient(seed: string): string {
  const hash = fnv1a(seed);
  const hue = hash % 360;
  const shift = 40 + ((hash >>> 9) % 80);
  const angle = 90 + ((hash >>> 17) % 180);
  return `linear-gradient(${angle}deg, oklch(0.86 0.12 ${hue}), oklch(0.78 0.14 ${(hue + shift) % 360}))`;
}

// FNV-1a: a tiny, well-spread 32-bit string hash, plenty for picking colors.
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
