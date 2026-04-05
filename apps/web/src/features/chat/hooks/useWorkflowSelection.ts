import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { Workflow } from "@/features/workflows/api/workflowApi";
import { usePathname } from "@/i18n/navigation";
import { ANALYTICS_EVENTS, trackEvent } from "@/lib/analytics";
import {
  type SelectedWorkflowData,
  useWorkflowSelectionStore,
  type WorkflowSelectionOptions,
} from "@/stores/workflowSelectionStore";

export type { SelectedWorkflowData, WorkflowSelectionOptions };

const FEATURE_DISCOVERED_WORKFLOWS_KEY = "feature_discovered_workflows";

export const useWorkflowSelection = () => {
  const {
    selectedWorkflow,
    selectWorkflow: storeSelectWorkflow,
    clearSelectedWorkflow,
    setSelectedWorkflow,
  } = useWorkflowSelectionStore();
  const router = useRouter();
  const pathname = usePathname();

  const selectWorkflow = useCallback(
    (
      workflow: Workflow | SelectedWorkflowData,
      options?: WorkflowSelectionOptions,
    ) => {
      console.log(
        "[useWorkflowSelection] selectWorkflow called, pathname:",
        pathname,
        "options:",
        options,
      );
      // Use store to persist the workflow selection
      storeSelectWorkflow(workflow, options);
      console.log(
        "[useWorkflowSelection] storeSelectWorkflow done, store state:",
        {
          selectedWorkflow: workflow.id,
          autoSend: options?.autoSend,
        },
      );

      // Track first workflow use as feature discovery
      const hasTrackedFeatureDiscovered =
        typeof globalThis.window !== "undefined" &&
        localStorage.getItem(FEATURE_DISCOVERED_WORKFLOWS_KEY);

      if (!hasTrackedFeatureDiscovered) {
        trackEvent(ANALYTICS_EVENTS.FEATURE_DISCOVERED, {
          feature: "workflows",
          workflow_title: workflow.title,
        });

        if (typeof globalThis.window !== "undefined") {
          localStorage.setItem(FEATURE_DISCOVERED_WORKFLOWS_KEY, "true");
        }
      }

      // Navigate to chat page if not already there
      if (pathname !== "/c") {
        console.log("[useWorkflowSelection] navigating to /c");
        router.push("/c");
      } else {
        console.log("[useWorkflowSelection] already on /c, no navigation");
      }
    },
    [storeSelectWorkflow, pathname, router],
  );

  return {
    selectedWorkflow,
    selectWorkflow,
    clearSelectedWorkflow,
    setSelectedWorkflow,
  };
};
