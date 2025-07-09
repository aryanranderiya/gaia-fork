"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * Custom hook for managing email selection via URL query parameters
 * Provides a consistent way to handle email selection across all pages
 */
export function useUrlEmailSelection() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get the currently selected email ID from URL
  const selectedEmailId = searchParams.get("emailId");

  // Helper function to update URL with email ID
  const updateEmailInUrl = useCallback(
    (emailId: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      const currentEmailId = params.get("emailId");

      // Don't update URL if it's already correct
      if (currentEmailId === emailId) {
        return;
      }

      if (emailId) {
        params.set("emailId", emailId);
      } else {
        params.delete("emailId");
      }

      // Get current pathname and update URL
      const currentPath = window.location.pathname;
      const newUrl = params.toString()
        ? `${currentPath}?${params.toString()}`
        : currentPath;
      router.replace(newUrl, { scroll: false });
    },
    [router, searchParams],
  );

  // Helper function to select an email
  const selectEmail = useCallback(
    (emailId: string | null) => {
      updateEmailInUrl(emailId);
    },
    [updateEmailInUrl],
  );

  // Helper function to clear selection
  const clearSelection = useCallback(() => {
    updateEmailInUrl(null);
  }, [updateEmailInUrl]);

  return {
    selectedEmailId,
    selectEmail,
    clearSelection,
    isSelected: (emailId: string) => selectedEmailId === emailId,
  };
}
