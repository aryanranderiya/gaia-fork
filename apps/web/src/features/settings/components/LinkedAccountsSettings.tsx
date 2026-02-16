"use client";

import { Button } from "@heroui/button";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { SettingsCard } from "@/features/settings/components/SettingsCard";
import { SettingsOption } from "@/features/settings/components/SettingsOption";
import {
  DiscordIcon,
  SlackIcon,
  TelegramIcon,
  WhatsappIcon,
} from "@/components/shared/icons";
import { api } from "@/lib/api";

interface PlatformLink {
  platform: "discord" | "slack" | "telegram" | "whatsapp";
  platformUserId: string | null;
  connectedAt?: string;
}

interface PlatformConfig {
  id: string;
  name: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  description: string;
  color: string;
}

const PLATFORMS: PlatformConfig[] = [
  {
    id: "discord",
    name: "Discord",
    icon: DiscordIcon,
    description: "Use GAIA directly from Discord servers and DMs",
    color: "bg-[#5865F2]",
  },
  {
    id: "slack",
    name: "Slack",
    icon: SlackIcon,
    description: "Bring GAIA into your Slack workspace",
    color: "bg-[#4A154B]",
  },
  {
    id: "telegram",
    name: "Telegram",
    icon: TelegramIcon,
    description: "Chat with GAIA on Telegram",
    color: "bg-[#0088cc]",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    icon: WhatsappIcon,
    description: "Connect GAIA to WhatsApp (Beta)",
    color: "bg-[#25D366]",
  },
];

export default function LinkedAccountsSettings() {
  const [platformLinks, setPlatformLinks] = useState<
    Record<string, PlatformLink | null>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(
    null,
  );

  useEffect(() => {
    fetchPlatformLinks();
  }, []);

  const fetchPlatformLinks = async () => {
    try {
      setIsLoading(true);
      const response = await api.get("/user/platform-links");
      setPlatformLinks(response.platform_links || {});
    } catch (error) {
      console.error("Failed to fetch platform links:", error);
      toast.error("Failed to load connected accounts");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async (platformId: string) => {
    try {
      setConnectingPlatform(platformId);

      // Get OAuth URL from backend
      const response = await api.post(
        `/platform-auth/${platformId}/connect`,
        {},
      );

      if (response.auth_url) {
        // Open OAuth in popup
        const width = 600;
        const height = 700;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;

        const popup = window.open(
          response.auth_url,
          `Connect ${platformId}`,
          `width=${width},height=${height},left=${left},top=${top}`,
        );

        // Poll for popup close
        const pollTimer = setInterval(() => {
          if (popup?.closed) {
            clearInterval(pollTimer);
            fetchPlatformLinks(); // Refresh status
            setConnectingPlatform(null);
          }
        }, 500);
      } else if (response.instructions) {
        toast.info(response.instructions, { duration: 8000 });
        setConnectingPlatform(null);
      }
    } catch (error) {
      console.error(`Failed to connect ${platformId}:`, error);
      toast.error(`Failed to connect ${platformId}`);
      setConnectingPlatform(null);
    }
  };

  const handleDisconnect = async (platformId: string) => {
    try {
      await api.delete(`/platform-auth/${platformId}/disconnect`);
      toast.success(`Disconnected from ${platformId}`);
      await fetchPlatformLinks();
    } catch (error) {
      console.error(`Failed to disconnect ${platformId}:`, error);
      toast.error(`Failed to disconnect from ${platformId}`);
    }
  };

  return (
    <div className="flex w-full grid-cols-4 gap-10 space-y-4">
      <div className="col-span-3 w-full space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Linked Accounts</h3>
          <p className="text-sm text-zinc-400">
            Connect your chat platforms to use GAIA from anywhere
          </p>
        </div>

        <SettingsCard>
          <div className="space-y-4">
            {PLATFORMS.map((platform) => {
              const isConnected =
                platformLinks[platform.id]?.platformUserId != null;
              const Icon = platform.icon;

              return (
                <SettingsOption
                  key={platform.id}
                  icon={
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg ${platform.color}`}
                    >
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                  }
                  title={platform.name}
                  description={
                    isConnected
                      ? `Connected • Use /gaia in ${platform.name} to get started`
                      : platform.description
                  }
                  action={
                    isConnected ? (
                      <Button
                        variant="flat"
                        color="danger"
                        size="sm"
                        onPress={() => handleDisconnect(platform.id)}
                        isDisabled={isLoading}
                      >
                        Disconnect
                      </Button>
                    ) : (
                      <Button
                        variant="flat"
                        color="primary"
                        size="sm"
                        onPress={() => handleConnect(platform.id)}
                        isLoading={connectingPlatform === platform.id}
                        isDisabled={isLoading || connectingPlatform != null}
                      >
                        Connect
                      </Button>
                    )
                  }
                />
              );
            })}
          </div>
        </SettingsCard>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <h4 className="mb-2 text-sm font-medium text-white">
            How to use connected platforms:
          </h4>
          <ul className="space-y-1 text-sm text-zinc-400">
            <li>• Connect your account using the button above</li>
            <li>• Use /gaia command in Discord, Slack, or Telegram</li>
            <li>• All conversations sync with your GAIA account</li>
            <li>• Disconnect anytime from this page</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
