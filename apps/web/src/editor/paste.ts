import type { EditorState, TransactionSpec } from "@codemirror/state";

/**
 * What's about to be pasted into the SQL from a result's column: a whole query, like one that
 * counts each group, an `order by`, or a `where` (or `and`).
 */
export type Paste = "query" | "order by" | "where";

/**
 * Answers how to get the SQL ready for a paste: the whole of it selected for a query, to replace
 * it; the last line selected for an `order by` when it's one already, or else the cursor at the
 * end, on a new line; and for a `where`, the cursor at the end of the first line, after a space.
 * The new line and the space are written into the SQL, so what's pasted lands as it should.
 */
export function readyForPaste(state: EditorState, paste: Paste): TransactionSpec {
  const { doc } = state;
  if (paste === "query") return { selection: { anchor: 0, head: doc.length } };
  if (paste === "where") {
    const first = doc.line(1);
    if (!first.text || /\s$/.test(first.text)) return { selection: { anchor: first.to } };
    return { changes: { from: first.to, insert: " " }, selection: { anchor: first.to + 1 } };
  }
  // The last line with something on it, past any blank ones at the end.
  let last = doc.line(doc.lines);
  while (last.number > 1 && !last.text.trim()) last = doc.line(last.number - 1);
  if (/^\s*order\s+by\b/i.test(last.text)) {
    return { selection: { anchor: last.from, head: last.to } };
  }
  if (!doc.length || doc.sliceString(doc.length - 1) === "\n") {
    return { selection: { anchor: doc.length } };
  }
  return { changes: { from: doc.length, insert: "\n" }, selection: { anchor: doc.length + 1 } };
}
