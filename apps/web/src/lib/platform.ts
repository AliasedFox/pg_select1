/**
 * Answers the key held to run the SQL or open a table: ⌘ on a Mac (or iPhone or iPad), Ctrl
 * elsewhere. Read as the page renders, not as it loads, so Storybook's Mac and Windows switch can
 * change it.
 */
export function modifierKey(): "⌘" | "Ctrl" {
  return /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";
}
