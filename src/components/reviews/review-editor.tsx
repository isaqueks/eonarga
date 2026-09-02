"use client";

import { CharacterCount } from "@tiptap/extension-character-count";
import { Link } from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { CONTENT_TEXT_MAX } from "@/lib/constants";
import { cn } from "@/lib/utils";

import { reviewContentClass } from "./review-content";

const PLACEHOLDER = "Conta mais: o que pediu, o que evitar, quem foi junto…";

/**
 * Editor visual da avaliação (Tiptap v3). Atalhos de markdown vêm do StarterKit
 * (`**negrito**`, `- lista`, `## título`), então a toolbar é só o atalho pra quem
 * está no celular. O HTML sai num input escondido e é sanitizado no servidor.
 */
export function ReviewEditor({
  initialHtml = "",
  name = "contentHtml",
  onChange,
  className,
}: {
  initialHtml?: string;
  name?: string;
  onChange?: (html: string) => void;
  className?: string;
}) {
  const [html, setHtml] = useState(initialHtml);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    // SSR: sem isso o Next reclama de hidratação (o editor só existe no cliente).
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        // O link vem configurado à parte, logo abaixo.
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      }),
      Placeholder.configure({ placeholder: PLACEHOLDER }),
      CharacterCount.configure({ limit: CONTENT_TEXT_MAX }),
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        class: cn(reviewContentClass, "min-h-40 px-3 py-3 focus:outline-none"),
        "aria-label": "Conta mais: o texto da avaliação",
      },
    },
    onUpdate: ({ editor: instance }) => {
      const next = instance.isEmpty ? "" : instance.getHTML();
      setHtml(next);
      onChangeRef.current?.(next);
    },
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: instance }) =>
      instance
        ? {
            bold: instance.isActive("bold"),
            italic: instance.isActive("italic"),
            strike: instance.isActive("strike"),
            heading: instance.isActive("heading", { level: 2 }),
            bulletList: instance.isActive("bulletList"),
            orderedList: instance.isActive("orderedList"),
            blockquote: instance.isActive("blockquote"),
            link: instance.isActive("link"),
            characters: instance.storage.characterCount.characters(),
          }
        : null,
  });

  const characters = state?.characters ?? 0;

  function promptLink() {
    if (!editor) return;
    const current = editor.getAttributes("link").href as string | undefined;
    const answer = window.prompt("Endereço do link (vazio tira o link)", current ?? "https://");
    if (answer === null) return;
    const url = answer.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    if (!url) chain.unsetLink().run();
    else chain.setLink({ href: url }).run();
  }

  return (
    <div className={cn("border-input flex flex-col overflow-hidden rounded-lg border", className)}>
      <div
        role="toolbar"
        aria-label="Formatação"
        className="border-border bg-card sticky top-14 z-10 flex flex-wrap gap-0.5 border-b p-1"
      >
        <ToolButton
          label="Negrito"
          active={state?.bold}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold className="size-4" aria-hidden />
        </ToolButton>
        <ToolButton
          label="Itálico"
          active={state?.italic}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-4" aria-hidden />
        </ToolButton>
        <ToolButton
          label="Tachado"
          active={state?.strike}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="size-4" aria-hidden />
        </ToolButton>
        <ToolButton
          label="Título"
          active={state?.heading}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="size-4" aria-hidden />
        </ToolButton>
        <ToolButton
          label="Lista"
          active={state?.bulletList}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List className="size-4" aria-hidden />
        </ToolButton>
        <ToolButton
          label="Lista numerada"
          active={state?.orderedList}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-4" aria-hidden />
        </ToolButton>
        <ToolButton
          label="Citação"
          active={state?.blockquote}
          disabled={!editor}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="size-4" aria-hidden />
        </ToolButton>
        <ToolButton label="Link" active={state?.link} disabled={!editor} onClick={promptLink}>
          <Link2 className="size-4" aria-hidden />
        </ToolButton>
      </div>

      <EditorContent editor={editor} />
      {!editor ? <div className="text-muted-foreground px-3 py-3 text-sm">Carregando…</div> : null}

      <p className="text-muted-foreground px-3 pb-2 text-right text-xs tabular-nums">
        {characters}/{CONTENT_TEXT_MAX}
      </p>

      <input type="hidden" name={name} value={html} />
    </div>
  );
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active ?? false}
      aria-label={label}
      title={label}
      className={cn(
        "focus-visible:ring-ring/50 flex size-11 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-3 disabled:opacity-40",
        active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
