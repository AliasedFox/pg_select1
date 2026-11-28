import { cn } from "cn";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

/**
 * One line of text that's changed where it stands: clicking it, or focusing it and pressing
 * Enter, puts it in a field that looks as it did, with all of it selected. Enter or clicking away
 * keeps the change, and Escape puts it back. `onSave` gets the trimmed text only when it changed, and never blank text when
 * `required`. With no text, `placeholder` is shown in its place, to click.
 */
export function InlineEdit({
  value,
  label,
  placeholder,
  required = false,
  maxLength,
  className,
  onSave,
}: {
  value: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  maxLength: number;
  className?: string;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const field = useRef<HTMLInputElement>(null);
  const editing = draft !== undefined;

  useEffect(() => {
    if (!editing) return;
    field.current?.focus();
    field.current?.select();
  }, [editing]);

  const commit = () => {
    if (draft === undefined) return;
    const text = draft.trim();
    setDraft(undefined);
    if (text === value.trim() || (required && !text)) return;
    onSave(text);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setDraft(undefined);
    } else if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }
  };

  // The field and the text it stands in for share their box, so nothing moves between them.
  const box = cn("-mx-1.5 rounded-md px-1.5 py-0.5", className);
  if (editing) {
    return (
      <input
        ref={field}
        aria-label={label}
        value={draft}
        maxLength={maxLength}
        className={cn(
          box,
          "field-sizing-content max-w-full min-w-[12ch] bg-transparent ring-1 ring-ring outline-none",
        )}
        onChange={(e) => {
          setDraft(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
    );
  }
  return (
    <button
      type="button"
      title={`Click to edit the ${label.toLowerCase()}`}
      className={cn(
        box,
        "cursor-text text-left transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50",
        !value && "text-muted-foreground",
      )}
      onClick={() => {
        setDraft(value);
      }}
    >
      {value || placeholder}
    </button>
  );
}
