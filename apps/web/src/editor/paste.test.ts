import { expect, test } from "bun:test";

import { EditorState } from "@codemirror/state";

import { type Paste, readyForPaste } from "./paste";

// The SQL once it's ready, with the selection in it as `[` and `]`, or the cursor as `|`.
function ready(sql: string, paste: Paste): string {
  const before = EditorState.create({ doc: sql });
  const { state } = before.update(readyForPaste(before, paste));
  const { from, to } = state.selection.main;
  const doc = state.doc.toString();
  return from === to
    ? `${doc.slice(0, from)}|${doc.slice(from)}`
    : `${doc.slice(0, from)}[${doc.slice(from, to)}]${doc.slice(to)}`;
}

test("selects all of the SQL for a query, to replace it", () => {
  expect(ready("select *\nfrom orders", "query")).toBe("[select *\nfrom orders]");
});

test("puts the cursor on a new line at the end for an order by", () => {
  expect(ready("select *\nfrom orders", "order by")).toBe("select *\nfrom orders\n|");
  // On the line already there, rather than another.
  expect(ready("select *\nfrom orders\n", "order by")).toBe("select *\nfrom orders\n|");
  expect(ready("", "order by")).toBe("|");
});

test("selects the last line for an order by when it's one already", () => {
  expect(ready("select *\nfrom orders\norder by id", "order by")).toBe(
    "select *\nfrom orders\n[order by id]",
  );
  expect(ready("select *\nfrom orders\n  ORDER  BY id desc\n\n", "order by")).toBe(
    "select *\nfrom orders\n[  ORDER  BY id desc]\n\n",
  );
  // Only the last line.
  expect(ready("select *\norder by id\nlimit 5", "order by")).toBe(
    "select *\norder by id\nlimit 5\n|",
  );
});

test("puts the cursor at the end of the first line for a where, after a space", () => {
  expect(ready("select * from orders\nlimit 5", "where")).toBe("select * from orders |\nlimit 5");
  expect(ready("select * from orders ", "where")).toBe("select * from orders |");
  expect(ready("", "where")).toBe("|");
});
