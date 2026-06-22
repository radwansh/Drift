"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CURRENCY_OPTIONS } from "@/lib/currency";
import { Badge } from "@/components/ui/badge";

interface CurrencyBadgeProps {
  code: string;
  showTooltip?: boolean;
}

export function CurrencyBadge({ code, showTooltip = true }: CurrencyBadgeProps) {
  const option = CURRENCY_OPTIONS.find((c) => c.value === code);
  const label = option?.label ?? `${code} - Unknown Currency`;

  const badge = (
    <Badge variant="outline" className="font-mono text-xs">
      {code}
    </Badge>
  );

  if (!showTooltip) return badge;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
