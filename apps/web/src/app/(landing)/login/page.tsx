import type { Metadata } from "next";

import { RedirectLoader } from "@/components/shared/RedirectLoader";
import { apiauth } from "@/lib";
import { generatePageMetadata } from "@/lib/seo";

export const metadata: Metadata = generatePageMetadata({
  title: "Login",
  description:
    "Sign in to your GAIA account. Access your personal AI assistant to manage tasks, emails, calendar, goals, and boost your productivity.",
  path: "/login",
  keywords: ["GAIA Login", "Sign In", "Account Access", "User Login"],
});

export default function LoginPage({
  searchParams,
}: {
  searchParams: { return_url?: string };
}) {
  const returnUrl = searchParams.return_url;
  const oauthUrl = `${apiauth.getUri()}oauth/login/workos${returnUrl ? `?return_url=${encodeURIComponent(returnUrl)}` : ""}`;

  return (
    <div className="h-screen">
      <RedirectLoader url={oauthUrl} replace />
    </div>
  );
}
