"use client";

import { Button } from "@heroui/button";
import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  DiscordIcon,
  SlackIcon,
  TelegramIcon,
  WhatsappIcon,
} from "@/components/shared/icons";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { apiService } from "@/lib/api";

const PLATFORM_CONFIG: Record<
  string,
  {
    name: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    color: string;
  }
> = {
  discord: { name: "Discord", icon: DiscordIcon, color: "bg-[#5865F2]" },
  slack: { name: "Slack", icon: SlackIcon, color: "bg-[#4A154B]" },
  telegram: { name: "Telegram", icon: TelegramIcon, color: "bg-[#0088cc]" },
  whatsapp: { name: "WhatsApp", icon: WhatsappIcon, color: "bg-[#25D366]" },
};

export default function LinkPlatformPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const platform = searchParams.get("platform");
  const pid = searchParams.get("pid");

  const [isLinking, setIsLinking] = useState(false);
  const [isLinked, setIsLinked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!platform || !pid || !PLATFORM_CONFIG[platform]) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <p className="text-zinc-400">
            Invalid link. Please try again from your bot.
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    const returnUrl = `/auth/link-platform?platform=${encodeURIComponent(platform)}&pid=${encodeURIComponent(pid)}`;
    return (
      <div className="flex h-full items-center justify-center">
        <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <h2 className="mb-2 text-xl font-semibold text-white">
            Sign in Required
          </h2>
          <p className="mb-6 text-sm text-zinc-400">
            You need to sign in to your GAIA account before linking your{" "}
            {PLATFORM_CONFIG[platform].name} account.
          </p>
          <Button
            color="primary"
            className="w-full"
            onPress={() =>
              router.push(
                `/login?return_url=${encodeURIComponent(returnUrl)}`,
              )
            }
          >
            Sign in to GAIA
          </Button>
        </div>
      </div>
    );
  }

  const config = PLATFORM_CONFIG[platform];
  const Icon = config.icon;

  const handleLink = async () => {
    setIsLinking(true);
    setError(null);
    try {
      await apiService.post(
        `/platform-auth/${platform}/link`,
        { platform_user_id: pid },
        { silent: true },
      );
      setIsLinked(true);
      toast.success("Account linked successfully!");
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;

      if (status === 409) {
        setError(detail || "This account is already linked.");
      } else {
        setError("Failed to link account. Please try again.");
      }
    } finally {
      setIsLinking(false);
    }
  };

  if (isLinked) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <div
            className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl ${config.color}`}
          >
            <Icon className="h-7 w-7 text-white" />
          </div>
          <h2 className="mb-2 text-xl font-semibold text-white">
            Account Linked!
          </h2>
          <p className="text-zinc-400">
            You can close this window and return to {config.name}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <div
          className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl ${config.color}`}
        >
          <Icon className="h-7 w-7 text-white" />
        </div>
        <h2 className="mb-2 text-xl font-semibold text-white">
          Link your {config.name} account to GAIA?
        </h2>
        <p className="mb-6 text-sm text-zinc-400">
          This will connect your {config.name} account so you can use GAIA
          directly from {config.name}.
        </p>

        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        <Button
          color="primary"
          className="w-full"
          onPress={handleLink}
          isLoading={isLinking}
        >
          Confirm Link
        </Button>
      </div>
    </div>
  );
}
