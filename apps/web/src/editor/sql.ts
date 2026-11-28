import {
  acceptCompletion,
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentLess,
  indentMore,
} from "@codemirror/commands";
import { PostgreSQL, sql, type SQLNamespace } from "@codemirror/lang-sql";
import {
  bracketMatching,
  getIndentUnit,
  HighlightStyle,
  type IndentContext,
  indentOnInput,
  indentService,
  indentUnit,
  matchBrackets,
  syntaxHighlighting,
  syntaxTree,
} from "@codemirror/language";
import {
  countColumn,
  EditorState,
  type Extension,
  Prec,
  type StateCommand,
} from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
  rectangularSelection,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import type { CatalogTable, TargetFunction } from "@pg_select1/shared";

// Keywords people write all the time, ranked above Postgres's hundreds of others, so `se` offers
// `select` before `security`.
const COMMON = new Set(
  `select from where and or not in is null as on join left right inner full cross limit offset
  order group having distinct union all with case when then else end between like ilike exists
  count insert into values update set delete returning true false asc desc`.split(/\s+/),
);

/** Keywords that go in pairs, offered whole: picking `group by` writes both words. */
export const PHRASES = [
  "group by",
  "order by",
  "partition by",
  "left join",
  "right join",
  "inner join",
  "full join",
  "cross join",
  "union all",
  "insert into",
  "delete from",
  "is null",
  "is not null",
  "not in",
  "not exists",
  "not like",
  "on conflict",
  "do nothing",
  "do update set",
  "distinct on",
  "nulls first",
  "nulls last",
  "if exists",
  "if not exists",
  "with recursive",
  "primary key",
  "create table",
  "alter table",
  "drop table",
  "create index",
  "explain analyze",
];

// Above the single words, so `group by` is offered before `group` and `grouping`.
const phraseOptions: Completion[] = PHRASES.map((label) => ({ label, type: "keyword", boost: 2 }));

// Where nothing is offered: inside a string, a quoted name or a comment.
const QUIET = new Set(["String", "QuotedIdentifier", "LineComment", "BlockComment"]);

/**
 * Offers {@link PHRASES}: those starting with the word being written, or, once its first word and
 * a space are written (`group b`), those going on from there.
 */
export function completePhrases(context: CompletionContext): CompletionResult | null {
  if (QUIET.has(syntaxTree(context.state).resolveInner(context.pos, -1).name)) return null;
  const pair = context.matchBefore(/\b[a-z]+\s+[a-z]*$/i);
  if (pair) {
    const written = pair.text.toLowerCase().replace(/\s+/, " ");
    const options = phraseOptions.filter((o) => o.label.startsWith(written));
    // Filtered here: CodeMirror's fuzzy match would also offer `order by` for `on b`.
    if (options.length > 0) return { from: pair.from, options, filter: false };
  }
  const word = context.matchBefore(/[a-z]+$/i);
  if (!word && !context.explicit) return null;
  return { from: word?.from ?? context.pos, options: phraseOptions, validFor: /^[a-z]*$/i };
}

// A name as it's written in SQL: quoted when it has capitals, spaces or the like, which lang-sql
// leaves to whoever gives it a completion of their own.
function nameCompletion(name: string, type: string, detail: string, boost = 0): Completion {
  const plain = /^[a-z_][a-z_\d$]*$/.test(name);
  return {
    label: name,
    type,
    detail,
    boost,
    ...(!plain && { apply: `"${name.replaceAll('"', '""')}"` }),
  };
}

// A name in SQL, quoted or not.
const NAME = String.raw`(?:"(?:[^"]|"")+"|[a-z_][\w$]*)`;

// A table named where a statement reads or writes one: after `from`, `join`, `update` or `into`,
// with its schema or without.
const TABLE_REFERENCE = new RegExp(
  String.raw`\b(?:from|join|update|into)\s+(${NAME}(?:\s*\.\s*${NAME})?)`,
  "gi",
);

// A name as Postgres reads it: without its quotes, or, unquoted, in lower case.
function unquote(name: string): string {
  return name.startsWith('"') ? name.slice(1, -1).replaceAll('""', '"') : name.toLowerCase();
}

/**
 * Answers the tables a statement names after `from`, `join`, `update` or `into`, looked up in
 * `byName` by `schema.name`, or by name alone for one in `public`. Others it names, as in a
 * list after `from` (`from a, b`), aren't found.
 */
export function tablesIn(
  statement: string,
  byName: ReadonlyMap<string, CatalogTable>,
): CatalogTable[] {
  const found = new Set<CatalogTable>();
  for (const [, reference = ""] of statement.matchAll(TABLE_REFERENCE)) {
    const parts = reference.match(new RegExp(NAME, "gi")) ?? [];
    const table = byName.get(parts.map(unquote).join("."));
    if (table) found.add(table);
  }
  return [...found];
}

/**
 * Completes the columns of the tables the statement at the cursor reads, as {@link tablesIn}
 * finds them, without a table's name or alias before them, which lang-sql's completion needs.
 * Those of one name are offered once. Above keywords, since a column is what's written most.
 */
export function completeColumns(tables: readonly CatalogTable[]): CompletionSource {
  const byName = new Map<string, CatalogTable>();
  for (const table of tables) {
    byName.set(`${table.schema}.${table.name}`, table);
    if (table.schema === "public") byName.set(table.name, table);
  }
  return (context) => {
    if (byName.size === 0) return null;
    if (QUIET.has(syntaxTree(context.state).resolveInner(context.pos, -1).name)) return null;
    const word = context.matchBefore(/[\w$]+$/);
    if (!word && !context.explicit) return null;
    const from = word?.from ?? context.pos;
    // After a dot, lang-sql completes the columns of the table or alias before it.
    if (context.state.sliceDoc(from - 1, from) === ".") return null;
    const doc = context.state.doc.toString();
    const start = doc.lastIndexOf(";", from - 1) + 1;
    const end = doc.indexOf(";", from);
    const statement = doc.slice(start, end === -1 ? undefined : end);
    const seen = new Set<string>();
    const options: Completion[] = [];
    for (const table of tablesIn(statement, byName)) {
      for (const column of table.columns) {
        if (seen.has(column.name)) continue;
        seen.add(column.name);
        options.push(nameCompletion(column.name, "property", column.type, 1));
      }
    }
    return options.length > 0 ? { from, options, validFor: /^[\w$]*$/ } : null;
  };
}

/**
 * Answers the tables, their columns and the functions to complete, by schema: lang-sql offers
 * those in `public` without their schema too, a table's columns after its name or alias and a
 * dot, and the columns of the tables in the statement as it's written. Each says what it is: a
 * table's kind, a column's type, a function's arguments. A function with a table's name in the
 * same schema is left out, since a schema holds one of each name.
 */
export function catalogNamespace(
  tables: readonly CatalogTable[],
  functions: readonly TargetFunction[] = [],
): SQLNamespace {
  const namespace: Record<string, Record<string, SQLNamespace>> = {};
  for (const { schema, name, kind, columns } of tables) {
    (namespace[schema] ??= {})[name] = {
      self: nameCompletion(name, "type", kind),
      children: columns.map((c) => nameCompletion(c.name, "property", c.type)),
    };
  }
  // A function's overloads, which come one after another, are offered once.
  const overloads = new Map<string, TargetFunction[]>();
  for (const fn of functions) {
    const key = `${fn.schema}\0${fn.name}`;
    overloads.set(key, [...(overloads.get(key) ?? []), fn]);
  }
  for (const [first, ...more] of overloads.values()) {
    if (!first) continue;
    const schema = (namespace[first.schema] ??= {});
    if (first.name in schema) continue;
    const detail = more.length > 0 ? `${more.length + 1} overloads` : `(${first.arguments})`;
    // Below tables, which are wanted more often where both could go.
    schema[first.name] = { self: nameCompletion(first.name, "function", detail, -1), children: [] };
  }
  return namespace;
}

// A line's text and where it starts.
interface Line {
  text: string;
  from: number;
}

// A line starting one of a statement's clauses, under which its other lines are indented.
const CLAUSE =
  /^(?:select|from|where|group|order|having|limit|offset|union|except|intersect|with|insert|update|delete|set|values|returning|window|join|inner|left|right|full|cross)\b/i;

/**
 * Answers how far to indent the line at `pos`, in columns: under a line starting a clause or
 * ending in `(`, a level in; under any other line, as far as it is; a line starting a clause, as
 * far as the clause before it, past any parentheses in between; a line starting with `)`, as far
 * as the line with its `(`. lang-sql's own indentation stops at the end of a statement, which
 * is where SQL is written.
 */
export function sqlIndentation(context: IndentContext, pos: number): number {
  const { state } = context;
  const { doc } = state;
  const unit = getIndentUnit(state);
  const indentOf = (text: string) => countColumn(/^\s*/.exec(text)?.[0] ?? "", state.tabSize);
  // A line up to `pos`, which is where a line being broken in two ends.
  const upTo = (at: number): Line => {
    const line = doc.lineAt(at);
    return { text: doc.sliceString(line.from, Math.min(line.to, pos)), from: line.from };
  };
  const above = (line: { from: number }): Line | null =>
    line.from > 0 ? upTo(line.from - 1) : null;
  // Where the `(` is that the `)` at `at` closes.
  const opening = (at: number) => {
    const match = matchBrackets(state, at + 1, -1);
    return match?.matched && match.end ? match.end.from : undefined;
  };

  const after = context.textAfterPos(pos);
  const text = after.trimStart();
  let previous = pos > doc.lineAt(pos).from ? upTo(pos) : above(doc.lineAt(pos));
  while (previous && !previous.text.trim()) previous = above(previous);
  if (!previous) return 0;

  if (text.startsWith(")")) {
    const open = opening(pos + after.length - text.length);
    if (open !== undefined) return indentOf(upTo(open).text);
  }
  if (CLAUSE.test(text)) {
    for (let line: Line | null = previous; line; line = above(line)) {
      const trimmed = line.text.trim();
      if (trimmed.startsWith(")")) {
        const open = opening(line.from + line.text.indexOf(")"));
        if (open !== undefined) {
          line = upTo(open);
          if (CLAUSE.test(line.text.trim())) return indentOf(line.text);
          continue;
        }
      }
      if (trimmed.endsWith("(")) return indentOf(line.text) + unit;
      if (CLAUSE.test(trimmed)) return indentOf(line.text);
    }
    return 0;
  }
  const trimmed = previous.text.trim();
  if (trimmed.endsWith(";")) return 0;
  if (trimmed.endsWith("(") || CLAUSE.test(trimmed)) return indentOf(previous.text) + unit;
  return indentOf(previous.text);
}

/**
 * The SQL language with completion of Postgres's keywords, {@link PHRASES}, and `tables`, their
 * columns and `functions`, as {@link catalogNamespace} and {@link completeColumns} offer them.
 */
export function sqlLanguage(
  tables: readonly CatalogTable[],
  functions: readonly TargetFunction[] = [],
): Extension {
  return [
    sql({
      dialect: PostgreSQL,
      schema: catalogNamespace(tables, functions),
      defaultSchema: "public",
      keywordCompletion: (label, type) => ({ label, type, boost: COMMON.has(label) ? 1 : -1 }),
    }),
    PostgreSQL.language.data.of({ autocomplete: completeColumns(tables) }),
    PostgreSQL.language.data.of({
      autocomplete: completePhrases,
      // Moves a line back out when it turns out to start a clause, as its keyword's space is
      // typed (not as its last letter is, which `order_id` would trip), or with a `)`.
      indentOnInput:
        /^\s*(?:(?:select|from|where|group|order|having|limit|offset|union|except|intersect|returning|window|join|inner|left|right|full|cross|set|values)\s|\))$/i,
    }),
    indentService.of(sqlIndentation),
  ];
}

// The page's own colors, from index.css, so the editor follows light and dark with the rest:
// keywords bold, values (strings, numbers) green, types and punctuation grey, comments grey and
// slanted, and anything Postgres can't read red.
const highlightStyle = HighlightStyle.define([
  { tag: [tags.keyword, tags.bool, tags.null], color: "var(--foreground)", fontWeight: "600" },
  { tag: [tags.string, tags.number], color: "var(--success)" },
  { tag: [tags.typeName, tags.standard(tags.name)], color: "var(--muted-foreground)" },
  {
    tag: [tags.operator, tags.punctuation, tags.paren, tags.brace, tags.squareBracket],
    color: "var(--muted-foreground)",
  },
  {
    tag: [tags.lineComment, tags.blockComment],
    color: "var(--muted-foreground)",
    fontStyle: "italic",
  },
  { tag: tags.invalid, color: "var(--destructive)" },
]);

// Three lines and the content's padding: the editor's height when it's empty, growing from there.
const minHeight = "calc(3 * 1.6em + 1rem)";

const theme = EditorView.theme({
  "&": { backgroundColor: "transparent", color: "var(--foreground)", maxHeight: "40svh" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.6", overflow: "auto" },
  ".cm-content": { minHeight, padding: "0.5rem 0", caretColor: "var(--foreground)" },
  ".cm-line": { padding: "0 0.75rem" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
  ".cm-placeholder": { color: "var(--muted-foreground)" },
  ".cm-gutters": {
    minHeight,
    backgroundColor: "transparent",
    color: "var(--muted-foreground)",
    border: "none",
    paddingLeft: "0.25rem",
  },
  ".cm-activeLine": { backgroundColor: "color-mix(in oklab, var(--muted) 60%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--foreground)" },
  ".cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground":
    { backgroundColor: "color-mix(in oklab, var(--foreground) 15%, transparent)" },
  // A small mark, so the highlight, with black text on it.
  "&.cm-focused .cm-matchingBracket": {
    backgroundColor: "var(--highlight)",
    color: "var(--highlight-foreground)",
  },
  "&.cm-focused .cm-nonmatchingBracket": { color: "var(--destructive)" },
  ".cm-tooltip": {
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
    borderRadius: "calc(var(--radius) - 2px)",
    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
    overflow: "hidden",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": {
    fontFamily: "var(--font-mono)",
    maxHeight: "14rem",
    padding: "0.25rem",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
    padding: "0.125rem 0.5rem",
    borderRadius: "calc(var(--radius) - 4px)",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--accent)",
    color: "var(--accent-foreground)",
  },
  ".cm-completionMatchedText": { textDecoration: "none", fontWeight: "600" },
});

// Tab as in an IDE: a level's spaces at the cursor, or the selected lines a level in.
const indentOrInsert: StateCommand = ({ state, dispatch }) => {
  if (state.selection.ranges.some((r) => !r.empty)) return indentMore({ state, dispatch });
  dispatch(
    state.update(state.replaceSelection(state.facet(indentUnit)), {
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
};

/**
 * Everything the SQL editor does but its language: line numbers, undo, two-space indents, closing brackets and quotes, and completion as you type, picked with the
 * arrows and taken with Tab or Enter. Otherwise Tab indents, at the cursor or the selected lines,
 * and Shift Tab takes them back out. `run` is called on
 * ⌘ or Ctrl Enter.
 */
export function editorSetup({
  label,
  hint,
  run,
}: {
  label: string;
  hint: string;
  run: () => void;
}): Extension {
  return [
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    history(),
    drawSelection(),
    rectangularSelection(),
    EditorState.allowMultipleSelections.of(true),
    indentUnit.of("  "),
    EditorState.tabSize.of(2),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    // Fades in as it opens, as menus do, and not again as it narrows down.
    autocompletion({ tooltipClass: () => "animate-fade-in", icons: false }),
    syntaxHighlighting(highlightStyle),
    theme,
    placeholder(hint),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({
      "aria-label": label,
      spellcheck: "false",
      autocapitalize: "off",
      autocorrect: "off",
    }),
    // Above the default keys, where Mod-Enter adds a line and Tab moves focus out.
    Prec.highest(
      keymap.of([
        {
          key: "Mod-Enter",
          run: () => {
            run();
            return true;
          },
        },
        { key: "Tab", run: acceptCompletion },
      ]),
    ),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      { key: "Tab", run: indentOrInsert, shift: indentLess },
    ]),
  ];
}
