import { expect, test } from "bun:test";

import { insertNewlineAndIndent } from "@codemirror/commands";
import { indentOnInput, indentUnit } from "@codemirror/language";
import { EditorState } from "@codemirror/state";

import { sqlLanguage, tablesIn } from "./sql";

// Types `text` as a person would, a key at a time, with Enter for each new line.
function typed(text: string): string {
  let state = EditorState.create({
    extensions: [sqlLanguage([]), indentUnit.of("  "), indentOnInput()],
  });
  for (const key of text) {
    if (key === "\n") {
      insertNewlineAndIndent({
        state,
        dispatch: (tr) => {
          state = tr.state;
        },
      });
      continue;
    }
    const at = state.selection.main.head;
    state = state.update({
      changes: { from: at, insert: key },
      selection: { anchor: at + 1 },
      userEvent: "input.type",
    }).state;
  }
  return state.doc.toString();
}

test("indents a clause's lines under it, and brings the next clause back out", () => {
  expect(typed("select\na,\nb\nfrom t\nwhere x = 1\nand y = 2\norder by a")).toBe(
    "select\n  a,\n  b\nfrom t\nwhere x = 1\n  and y = 2\norder by a",
  );
});

test("indents inside parentheses, and closes them where they opened", () => {
  expect(typed("select *\nfrom (\nselect a\nfrom b\n) x\nwhere a > 1")).toBe(
    "select *\nfrom (\n  select a\n  from b\n) x\nwhere a > 1",
  );
});

test("doesn't take a column starting like a keyword for a clause", () => {
  expect(typed("select\norder_id,\nfull_name")).toBe("select\n  order_id,\n  full_name");
});

test("starts the next statement at the margin", () => {
  expect(typed("select 1;\nselect 2")).toBe("select 1;\nselect 2");
});

test("finds the tables a statement reads or writes, with their schema, quoted or not", () => {
  const table = (schema: string, name: string) => ({
    schema,
    name,
    kind: "table" as const,
    columns: [],
  });
  const customers = table("public", "customers");
  const products = table("shop", "products");
  const odd = table("public", 'Odd "name"');
  const byName = new Map([
    ["customers", customers],
    ["public.customers", customers],
    ["shop.products", products],
    ['Odd "name"', odd],
  ]);

  expect(
    tablesIn(
      'select * from Customers c join shop . products p on true join "Odd ""name""" o on true',
      byName,
    ),
  ).toEqual([customers, products, odd]);
  expect(tablesIn("select * from products", byName)).toEqual([]);
  expect(tablesIn("update public.customers set a = 1", byName)).toEqual([customers]);
});
