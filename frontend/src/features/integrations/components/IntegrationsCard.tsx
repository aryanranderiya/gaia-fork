import { Accordion, AccordionItem } from "@heroui/accordion";
import { Chip } from "@heroui/chip";
import { Selection } from "@heroui/react";
import Image from "next/image";
import React, { useEffect, useState } from "react";

import { useIntegrations } from "../hooks/useIntegrations";
import { Integration } from "../types";

interface IntegrationsCardProps {
  onClose?: () => void;
}

const IntegrationItem: React.FC<{
  integration: Integration;
  onConnect: (id: string) => void;
}> = ({ integration, onConnect }) => {
  const isConnected = integration.status === "connected";
  const isAvailable = !!integration.loginEndpoint;

  const handleClick = () => {
    if (isAvailable && !isConnected) {
      onConnect(integration.id);
    }
  };

  return (
    <div
      className={`flex items-center gap-2 rounded-lg p-2 px-3 hover:outline-1 hover:outline-white/5 ${
        isAvailable && !isConnected
          ? "cursor-pointer hover:bg-zinc-800/50"
          : "hover:bg-zinc-800/20"
      }`}
      onClick={handleClick}
    >
      {/* Icon */}
      <div className="flex-shrink-0">
        <div className="flex h-7 w-7 items-center justify-center rounded">
          <Image
            width={25}
            height={25}
            src={integration.icon}
            alt={integration.name}
            className="aspect-square max-w-[25px] min-w-[25px] object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      </div>

      {/* Name */}
      <div className="min-w-0 flex-1">
        <span className="block truncate text-xs text-zinc-300">
          {integration.name}
        </span>
      </div>

      {/* Status / Button */}
      <div className="flex-shrink-0">
        {isConnected && (
          <Chip size="sm" variant="flat" color="success">
            Connected
          </Chip>
        )}

        {isAvailable && !isConnected && (
          <Chip size="sm" variant="flat" color="primary" className="text-xs">
            Click to Connect
          </Chip>
        )}

        {!isAvailable && (
          <Chip size="sm" variant="flat" color="danger" className="text-xs">
            Soon
          </Chip>
        )}
      </div>
    </div>
  );
};

export const IntegrationsCard: React.FC<IntegrationsCardProps> = ({
  onClose,
}) => {
  const { integrations, connectIntegration, refreshStatus } = useIntegrations();

  // Load saved accordion state from localStorage
  // This preserves the expand/collapse state of the integrations accordion
  // across multiple opens of the slash command dropdown
  const [selectedKeys, setSelectedKeys] = useState<Selection>(() => {
    if (typeof window === "undefined") {
      return new Set(["integrations"]);
    }

    const saved = localStorage.getItem("gaia-integrations-accordion-expanded");
    if (saved !== null) {
      try {
        const isExpanded = JSON.parse(saved);
        return isExpanded ? new Set(["integrations"]) : new Set([]);
      } catch {
        // If parsing fails, default to expanded
        return new Set(["integrations"]);
      }
    }
    // Default to expanded if no saved state
    return new Set(["integrations"]);
  });

  // Save accordion state to localStorage whenever it changes
  const handleSelectionChange = (keys: Selection) => {
    setSelectedKeys(keys);

    if (typeof window !== "undefined") {
      const isExpanded =
        keys === "all" || (keys instanceof Set && keys.has("integrations"));
      localStorage.setItem(
        "gaia-integrations-accordion-expanded",
        JSON.stringify(isExpanded),
      );
    }
  };

  // Force refresh integration status on mount
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const handleConnect = async (integrationId: string) => {
    try {
      await connectIntegration(integrationId);
      onClose?.();
    } catch (error) {
      console.error("Failed to connect integration:", error);
    }
  };

  const connectedCount = integrations.filter(
    (i) => i.status === "connected",
  ).length;

  return (
    <div className="p-2">
      <Accordion
        variant="light"
        isCompact
        selectedKeys={selectedKeys}
        onSelectionChange={handleSelectionChange}
        itemClasses={{ base: "py-2 px-2" }}
        className="rounded-xl bg-zinc-900/50"
      >
        <AccordionItem
          key="integrations"
          title={
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground-600">
                    Integrations
                  </span>
                  <span className="text-xs text-zinc-400">
                    {connectedCount}/{integrations.length}
                  </span>
                </div>
              </div>
            </div>
          }
        >
          <div onClick={(e) => e.stopPropagation()}>
            <div>
              <div className="grid grid-cols-2 gap-2">
                {integrations.map((integration) => (
                  <IntegrationItem
                    key={integration.id}
                    integration={integration}
                    onConnect={handleConnect}
                  />
                ))}
              </div>
            </div>
          </div>
        </AccordionItem>
      </Accordion>
    </div>
  );
};
