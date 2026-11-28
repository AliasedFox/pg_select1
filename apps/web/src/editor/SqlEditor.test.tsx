import { expect, test } from "bun:test";

import { EditorView } from "@codemirror/view";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { SqlEditor } from "./SqlEditor";

const tables = [
  {
    schema: "public",
    name: "customers",
    kind: "table" as const,
    columns: [
      { name: "id", type: "bigint" },
      { name: "email", type: "text" },
      { name: "Signed Up", type: "date" },
    ],
  },
  {
    schema: "public",
    name: "orders",
    kind: "table" as const,
    columns: [
      { name: "id", type: "bigint" },
      { name: "customer_id", type: "bigint" },
    ],
  },
  {
    schema: "shop",
    name: "products",
    kind: "view" as const,
    columns: [{ name: "price", type: "numeric" }],
  },
];

const functions = [
  { schema: "public", name: "order_total", arguments: "order_id bigint" },
  { schema: "shop", name: "price_of", arguments: "id bigint" },
  { schema: "shop", name: "price_of", arguments: "name text" },
];

let runs = 0;

function Editor({ initial = "" }: { initial?: string }) {
  const [sql, setSql] = useState(initial);
  return (
    <SqlEditor
      label="SQL"
      value={sql}
      onChange={setSql}
      onRun={() => {
        runs += 1;
      }}
      tables={tables}
      functions={functions}
      placeholder="select …"
    />
  );
}

function setup(initial?: string) {
  const user = userEvent.setup();
  render(<Editor initial={initial} />);
  const box = screen.getByRole("textbox", { name: "SQL" });
  const sql = () => EditorView.findFromDOM(box)?.state.doc.toString();
  return { user, box, sql };
}

// The completions offered, once they're there for what was typed, a moment after typing stops,
// and can be taken, a moment later still (CodeMirror's `interactionDelay`, so a keystroke meant
// for the SQL doesn't take one that just opened).
async function offered(): Promise<(string | undefined)[]> {
  await new Promise((resolve) => setTimeout(resolve, 200));
  const list = await screen.findByRole("listbox");
  return within(list)
    .getAllByRole("option")
    .map((o) => o.querySelector(".cm-completionLabel")?.textContent);
}

test("completes a keyword with Tab", async () => {
  const { user, box, sql } = setup();
  await user.type(box, "sel");
  expect((await offered())[0]).toBe("select");
  await user.keyboard("{Tab}");
  expect(sql()).toBe("select");
});

test("offers keywords that go in pairs whole, and goes on from their first word", async () => {
  const { user, box, sql } = setup();
  await user.type(box, "select a from t where a > 1 gro");
  expect((await offered())[0]).toBe("group by");
  await user.keyboard("up b");
  expect((await offered())[0]).toBe("group by");
  await user.keyboard("{Enter}");
  expect(sql()).toBe("select a from t where a > 1 group by");
});

test("picks another completion with the arrows and takes it with Enter", async () => {
  const { user, box, sql } = setup();
  await user.type(box, "select * from ord");
  expect((await offered()).slice(0, 3)).toEqual(["order by", "order", "orders"]);
  await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowUp}{Enter}");
  expect(sql()).toBe("select * from orders");
});

test("completes the database's tables", async () => {
  const { user, box, sql } = setup();
  await user.type(box, "select * from cust");
  expect(await offered()).toContain("customers");
  await user.keyboard("{Tab}");
  expect(sql()).toBe("select * from customers");
});

test("completes a table's columns after its name or alias and a dot", async () => {
  const { user, box, sql } = setup();
  await user.type(box, "select * from orders o where o.cust");
  expect(await offered()).toContain("customer_id");
  await user.keyboard("{Tab}");
  expect(sql()).toBe("select * from orders o where o.customer_id");
});

test("completes the columns of the tables a statement reads, quoting a name that needs it", async () => {
  const { user, box, sql } = setup();
  await user.type(box, "select * from customers where Sig");
  expect(await offered()).toContain("Signed Up");
  await user.keyboard("{Tab}");
  expect(sql()).toBe('select * from customers where "Signed Up"');
});

test("completes another schema's tables and functions after its name", async () => {
  const { user, box } = setup();
  await user.type(box, "select shop.");
  const options = await offered();
  expect(options).toContain("products");
  expect(options).toContain("price_of");
});

test("completes the functions in public by name", async () => {
  const { user, box, sql } = setup();
  await user.type(box, "select order_t");
  expect(await offered()).toContain("order_total");
  await user.keyboard("{Tab}");
  expect(sql()).toBe("select order_total");
});

test("indents a clause's lines on Enter, and with Tab when nothing's offered", async () => {
  const { user, box, sql } = setup();
  await user.type(box, "select{Enter}a,{Enter}b{Enter}from t");
  expect(sql()).toBe("select\n  a,\n  b\nfrom t");
  await user.keyboard("{Escape}{Tab}x");
  expect(sql()).toBe("select\n  a,\n  b\nfrom t  x");
  const editor = EditorView.findFromDOM(box);
  editor?.dispatch({ selection: { anchor: 0, head: editor.state.doc.length } });
  await user.keyboard("{Shift>}{Tab}{/Shift}");
  expect(sql()).toBe("select\na,\nb\nfrom t  x");
});

test("runs with Ctrl or ⌘ and Enter, without a new line", async () => {
  const { user, box, sql } = setup("select 1");
  runs = 0;
  await user.click(box);
  await user.keyboard("{Control>}{Enter}{/Control}");
  expect(runs).toBe(1);
  expect(sql()).toBe("select 1");
});
