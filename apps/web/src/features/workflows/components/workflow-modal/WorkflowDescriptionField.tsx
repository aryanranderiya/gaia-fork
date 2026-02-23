import { Textarea } from "@heroui/input";
import { type Control, Controller, type FieldErrors } from "react-hook-form";
import type { WorkflowFormData } from "../../schemas/workflowFormSchema";

interface WorkflowDescriptionFieldProps {
  control: Control<WorkflowFormData>;
  errors: FieldErrors<WorkflowFormData>;
  mode?: "create" | "edit";
}

export default function WorkflowDescriptionField({
  control,
  errors,
  mode = "create",
}: WorkflowDescriptionFieldProps) {
  return (
    <div className="space-y-4">
      <Controller
        name="prompt"
        control={control}
        render={({ field }) => (
          <Textarea
            {...field}
            label="Instructions"
            placeholder={
              mode === "edit"
                ? "Detailed instructions for what this workflow should do"
                : "Describe in detail what this workflow should do when triggered, including specific actions and expected outcomes"
            }
            minRows={5}
            variant="underlined"
            className="text-sm"
            isRequired
            isInvalid={!!errors.prompt}
            errorMessage={errors.prompt?.message}
          />
        )}
      />
      <Controller
        name="description"
        control={control}
        render={({ field }) => (
          <Textarea
            {...field}
            value={field.value ?? ""}
            label="Display Description"
            placeholder="Optional: short summary shown on workflow cards (1-2 sentences)"
            minRows={2}
            maxRows={3}
            variant="underlined"
            className="text-sm"
            isInvalid={!!errors.description}
            errorMessage={errors.description?.message}
          />
        )}
      />
    </div>
  );
}
