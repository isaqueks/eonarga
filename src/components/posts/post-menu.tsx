"use client";

import { MoreHorizontal, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { deletePost } from "@/actions/posts";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Menu "⋯" do post. Só aparece pra quem postou e pro admin (docs/05). */
export function PostMenu({ postId }: { postId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    if (!window.confirm("Apagar esse post? Não tem desfazer.")) return;
    setError(null);
    startTransition(async () => {
      const result = await deletePost(postId);
      if (!result.ok) setError(result.error ?? "Não rolou apagar.");
    });
  }

  return (
    <div className="flex flex-col items-end">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-lg"
              className="size-9"
              aria-label="Mais ações do post"
            >
              <MoreHorizontal className="size-5" aria-hidden />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            variant="destructive"
            onClick={remove}
            disabled={pending}
            className="min-h-10 px-2"
          >
            <Trash2 className="size-4" aria-hidden />
            {pending ? "Apagando…" : "Apagar"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
