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
  );
}
