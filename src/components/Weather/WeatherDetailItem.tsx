import React, { ReactNode } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface WeatherDetailItemProps {
  icon: ReactNode;
  label: string;
  value: string;
  tooltipText?: string;
  highlight: string;
}

export const WeatherDetailItem: React.FC<WeatherDetailItemProps> = ({
  icon,
  label,
  value,
  tooltipText,
  highlight,
}) => {
  return (
    <div
      className={`flex flex-col items-start rounded-2xl bg-black/10 p-2 px-3 backdrop-blur-sm`}
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger className="flex w-full flex-row items-start justify-between">
            <div className="flex flex-col">
              <div className="w-fit text-sm text-white/70">{label}</div>
              <div className="w-fit font-medium text-white">{value}</div>
            </div>
            <div style={{ color: highlight }}>{icon}</div>
          </TooltipTrigger>
          {tooltipText && (
            <TooltipContent>
              <p>{tooltipText}</p>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};
