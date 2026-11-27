import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { TargetTable } from "@pg_select1/shared";
import { type Ref, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import { type Paste, readyForPaste } from "./paste";
import { editorSetup, sqlLanguage } from "./sql";

// One empty list, so an editor with no tables isn't reconfigured on every render.
const NO_TABLES: readonly TargetTable[] = [];

// The glow the editor pulses once it's ready for a paste, so it's plain where focus went.
const GLOW = "animate-glow";

/** What a page can do to a {@link SqlEditor} besides giving it its SQL. */
export interface SqlEditorHandle {
  /** Puts the cursor back in the SQL. */
  focus: () => void;
  /**
   * Gets the SQL ready for what was just copied to be pasted: puts the cursor back in it where
   * that goes, or selects what it replaces, with {@link readyForPaste}, and pulses a glow around
   * the editor so it's plain where focus went.
   */
  readyFor: (paste: Paste) => void;
}

/**
 * A SQL editor for Postgres: highlighted, indented as you go, and completing keywords, pairs of
 * them like `group by`, and the database's tables. The SQL is `value`, and every change to it
 * goes to `onChange`; ⌘ or Ctrl Enter calls `onRun`.
 */
export function SqlEditor({
  value,
  onChange,
  onRun,
  tables = NO_TABLES,
  label,
  placeholder,
  className,
  ref,
}: {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  /** The database's tables, to complete their names. */
  tables?: readonly TargetTable[];
  label: string;
  placeholder: string;
  className?: string;
  ref?: Ref<SqlEditorHandle>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const language = useRef(new Compartment());
  // The latest callbacks, so the editor, made once, never calls stale ones.
  const callbacks = useRef({ onChange, onRun });
  callbacks.current = { onChange, onRun };

  // The editor is made once, with what it starts with, and kept in step below.
  useEffect(() => {
    const editor = new EditorView({
      parent: host.current ?? undefined,
      state: EditorState.create({
        doc: value,
        extensions: [
          language.current.of(sqlLanguage(tables)),
          editorSetup({
            label,
            hint: placeholder,
            run: () => {
              callbacks.current.onRun();
            },
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) callbacks.current.onChange(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- made once; the effects below keep it in step
  }, []);

  // SQL set by the page, as when a table is picked or the SQL cleared. Before the next keystroke
  // can land, which a passive effect isn't: it would take an earlier render's SQL for the page's
  // and undo what was typed since.
  useLayoutEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === value) return;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: language.current.reconfigure(sqlLanguage(tables)) });
  }, [tables]);

  useImperativeHandle(ref, () => ({
    focus: () => view.current?.focus(),
    readyFor: (paste) => {
      const editor = view.current;
      if (!editor) return;
      editor.dispatch({ ...readyForPaste(editor.state, paste), scrollIntoView: true });
      // The glow goes on in the same frame as the focus, so the focus ring, which it covers, never
      // shows first. On the element itself rather than through a render, which would be a frame
      // later; React leaves it, since the class it renders doesn't change. Taken off and put back,
      // a reflow between, to start again when it's glowing already.
      const glowing = host.current;
      glowing?.classList.remove(GLOW);
      void glowing?.offsetWidth;
      glowing?.classList.add(GLOW);
      editor.focus();
    },
  }));

  return (
    <div
      ref={host}
      onAnimationEnd={(event) => {
        // Not CodeMirror's own, like its cursor's blink, which end inside it.
        if (event.target === event.currentTarget) event.currentTarget.classList.remove(GLOW);
      }}
      className={cn(
        "min-w-0 overflow-hidden rounded-md border border-input text-base shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 md:text-xs dark:bg-input/30",
        className,
      )}
    />
  );
}
