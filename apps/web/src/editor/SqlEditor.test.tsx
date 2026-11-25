import { expect, test } from "bun:test";

import { EditorView } from "@codemirror/view";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { SqlEditor } from "./SqlEditor";

const tables = [
  { schema: "public", name: "customers", kind: "table" as const },
  { schema: "public", name: "orders", kind: "table" as const },
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
async function offered(): Promise<string[]> {
  await new Promise((resolve) => setTimeout(resolve, 200));
  const list = await screen.findByRole("listbox");
  return within(list)
    .getAllByRole("option")
    .map((o) => o.textContent);
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
