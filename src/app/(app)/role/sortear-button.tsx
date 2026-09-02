"use client";

import { Dices } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** A roleta é v2 (docs/01). Fica visível e desabilitada pra galera saber que vem. */
export function SortearButton() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex" />}>
          <Button variant="outline" size="lg" className="h-11" disabled title="vem na v2">
            <Dices className="size-4" aria-hidden />
            🎲 Sortear
          </Button>
        </TooltipTrigger>
        <TooltipContent>vem na v2</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
