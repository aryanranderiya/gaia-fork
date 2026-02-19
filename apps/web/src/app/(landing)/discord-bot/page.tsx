import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { generatePageMetadata } from "@/lib/seo";

export const metadata: Metadata = generatePageMetadata({
  title: "Add GAIA to Discord",
  description:
    "Add the GAIA AI assistant bot to your Discord server. Use slash commands, @mentions, and DMs to chat with GAIA, manage todos, and run workflows without leaving Discord.",
  path: "/discord-bot",
  keywords: [
    "GAIA Discord bot",
    "add Discord bot",
    "Discord AI assistant",
    "Discord bot invite",
    "GAIA bot",
    "Discord slash commands",
  ],
});

export default function DiscordBotPage() {
  redirect(
    "https://discord.com/oauth2/authorize?client_id=1388905575399559370",
  );
}
