"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Link2, List, ListOrdered, Underline } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sectionBodyToEditorHtml, sectionHtmlForSave } from "@/lib/registration-forms/section-html";
import { normalizeSectionColor } from "@/lib/registration-forms/section-color";
import { cn } from "@/lib/utils";

const SECTION_COLORS = ["#1a3556", "#8a6d00", "#b91c1c", "#15803d", "#1d4ed8", "#7c3aed"];

type EditorProps = {
  value: string;
  onChange: (value: string) => void;
};

export function SectionBodyEditor({ value, onChange }: EditorProps) {
  const lastEmitted = useRef(value);
  const editing = useRef(false);

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          link: { openOnClick: false, autolink: true },
        }),
      ],
      content: sectionBodyToEditorHtml(value),
      editorProps: {
        attributes: {
          class:
            "min-h-28 px-3 py-2 text-sm leading-relaxed text-foreground outline-none [&_a]:underline [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5",
        },
      },
      onFocus: () => {
        editing.current = true;
      },
      onBlur: () => {
        editing.current = false;
      },
      onUpdate: ({ editor: current }) => {
        if (!editing.current) return;
        const next = sectionHtmlForSave(current.getHTML());
        lastEmitted.current = next;
        onChange(next);
      },
    },
    ["section-body-editor"]
  );

  useEffect(() => {
    if (!editor || editing.current) return;
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(sectionBodyToEditorHtml(value), { emitUpdate: false });
  }, [editor, value]);

  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) {
        return { bold: false, italic: false, underline: false, bullet: false, ordered: false, link: false };
      }
      return {
        bold: current.isActive("bold"),
        italic: current.isActive("italic"),
        underline: current.isActive("underline"),
        bullet: current.isActive("bulletList"),
        ordered: current.isActive("orderedList"),
        link: current.isActive("link"),
      };
    },
  });

  const apply = (command: () => void) => {
    editing.current = true;
    command();
  };

  const setLink = () => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const next = window.prompt("Link URL", previous ?? "https://");
    if (next === null) return;
    const url = next.trim();
    if (!url) {
      apply(() => editor.chain().focus().extendMarkRange("link").unsetLink().run());
      return;
    }
    if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) return;
    apply(() => editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run());
  };

  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <div className="flex flex-wrap items-center gap-1 border-b bg-muted/40 p-1">
        <FormatButton
          label="Bold"
          pressed={active?.bold}
          disabled={!editor}
          onClick={() => apply(() => editor?.chain().focus().toggleBold().run())}
        >
          <Bold />
        </FormatButton>
        <FormatButton
          label="Italic"
          pressed={active?.italic}
          disabled={!editor}
          onClick={() => apply(() => editor?.chain().focus().toggleItalic().run())}
        >
          <Italic />
        </FormatButton>
        <FormatButton
          label="Underline"
          pressed={active?.underline}
          disabled={!editor}
          onClick={() => apply(() => editor?.chain().focus().toggleUnderline().run())}
        >
          <Underline />
        </FormatButton>
        <FormatButton
          label="Bullet list"
          pressed={active?.bullet}
          disabled={!editor}
          onClick={() => apply(() => editor?.chain().focus().toggleBulletList().run())}
        >
          <List />
        </FormatButton>
        <FormatButton
          label="Numbered list"
          pressed={active?.ordered}
          disabled={!editor}
          onClick={() => apply(() => editor?.chain().focus().toggleOrderedList().run())}
        >
          <ListOrdered />
        </FormatButton>
        <FormatButton label="Link" pressed={active?.link} disabled={!editor} onClick={setLink}>
          <Link2 />
        </FormatButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

export function SectionColorControl({
  value,
  onChange,
}: {
  value?: string;
  onChange: (color: string | undefined) => void;
}) {
  const selected = normalizeSectionColor(value);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {SECTION_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Section color ${color}`}
          aria-pressed={selected === color}
          className={cn(
            "h-5 w-5 rounded-sm border border-foreground/30",
            selected === color && "ring-2 ring-foreground ring-offset-2 ring-offset-background"
          )}
          style={{ backgroundColor: color }}
          onClick={() => onChange(color)}
        />
      ))}
      <input
        type="color"
        aria-label="Custom section color"
        className="h-6 w-8 cursor-pointer bg-background"
        value={selected ?? "#1a3556"}
        onChange={(event) => onChange(normalizeSectionColor(event.target.value))}
      />
      <button
        type="button"
        className="px-1 text-[11px] text-foreground"
        onClick={() => onChange(undefined)}
      >
        None
      </button>
    </div>
  );
}

function FormatButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={pressed ? "secondary" : "ghost"}
      size="sm"
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      className="h-7 w-7 px-0 text-foreground disabled:bg-muted disabled:text-foreground disabled:opacity-100"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
