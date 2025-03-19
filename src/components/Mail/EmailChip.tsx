// components/Mail/EmailChip.tsx
import { Chip } from "@heroui/chip";
import { XCircle } from "lucide-react";
import React from "react";

export interface EmailSuggestion {
  id: string;
  email: string;
  name?: string;
}

interface EmailChipProps {
  suggestion: EmailSuggestion;
  selected: boolean;
  onToggle: (suggestion: EmailSuggestion) => void;
}

export const EmailChip: React.FC<EmailChipProps> = ({
  suggestion,
  selected,
  onToggle,
}) => {
  return (
    <Chip
      variant={selected ? "solid" : "flat"}
      color="primary"
      endContent={selected && <XCircle fill="black" color="#00bbff" />}
      onClick={() => onToggle(suggestion)}
      className={`cursor-pointer select-none ${selected ? "" : "text-primary"}`}
    >
      {suggestion.email}
    </Chip>
  );
};
