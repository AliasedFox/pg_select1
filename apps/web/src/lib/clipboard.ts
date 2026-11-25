import { useEffect, useRef, useState } from "react";

/**
 * Puts `text` on the clipboard. The Clipboard API needs a secure context, and pg_select1 may be
 * served over plain HTTP on a local network, so without it the text is copied from a hidden
 * textarea instead, and focus goes back to where it was.
 *
 * @throws when the browser copies neither way.
 */
export async function copyText(text: string): Promise<void> {
  // Outside a secure context, browsers leave `navigator.clipboard` out altogether.
  if ("clipboard" in navigator) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const focused = document.activeElement;
  const area = document.createElement("textarea");
  area.value = text;
  area.readOnly = true;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  try {
    // oxlint-disable-next-line typescript/no-deprecated -- The only way to copy without a secure context.
    if (!document.execCommand("copy")) throw new Error("The browser didn't copy");
  } finally {
    area.remove();
    if (focused instanceof HTMLElement) focused.focus();
  }
}

// How long something says it's copied.
const COPIED_MS = 1500;

/**
 * Copies text with {@link copyText} and says whether it just did: `copied` is true for a moment
 * after each copy that worked. A copy that fails leaves it false, with nothing else to tell.
 */
export function useCopy(): { copied: boolean; copy: (text: string) => void } {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );
  const copy = (text: string) => {
    copyText(text).then(
      () => {
        clearTimeout(timer.current);
        setCopied(true);
        timer.current = setTimeout(() => {
          setCopied(false);
        }, COPIED_MS);
      },
      () => undefined,
    );
  };
  return { copied, copy };
}
