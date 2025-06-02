"use client";
import { QueryFunctionContext } from "@tanstack/react-query";

import { mailApi } from "@/features/mail/api/mailApi";
import { EmailsResponse } from "@/types/features/mailTypes";

export function parseEmail(from: string | undefined): {
  name: string;
  email: string;
} {
  if (!from)
    return {
      name: "",
      email: "",
    };

  const match = from.match(/^(.*?)\s*<(.+?)>$/) || from.match(/(.+)/);

  if (match) {
    return {
      name: match[1] ? match[1].trim().replace(/^"|"$/g, "") : "",
      email: match[2] || "",
    };
  }

  return {
    name: "",
    email: from,
  };
}

export function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();

  const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffMonths =
    now.getMonth() -
    date.getMonth() +
    12 * (now.getFullYear() - date.getFullYear());
  const diffYears = now.getFullYear() - date.getFullYear();

  if (diffSeconds < 60) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffMonths < 1)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (diffYears < 1)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export const fetchEmails = async ({
  pageParam = undefined,
}: QueryFunctionContext<string[]>): Promise<EmailsResponse> => {
  return mailApi.fetchEmails(pageParam as string | undefined);
};
