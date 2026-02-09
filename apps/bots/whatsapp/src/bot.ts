import { Client, LocalAuth } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import { GaiaClient, loadConfig } from "@gaia/shared";
import { handleMessage } from "./handlers/message";
import { registerCommands } from "./commands";

/**
 * Initializes and starts the WhatsApp bot.
 * Uses whatsapp-web.js with local authentication.
 */
export async function createBot() {
  const config = loadConfig();

  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });

  const gaia = new GaiaClient(config.gaiaApiUrl, config.gaiaApiKey);
  const commands = registerCommands(gaia);

  client.on("qr", (qr) => {
    console.log("Scan this QR code with WhatsApp:");
    qrcode.generate(qr, { small: true });
  });

  client.on("ready", () => {
    console.log("WhatsApp bot is ready!");
  });

  client.on("message", async (message) => {
    await handleMessage(message, gaia, commands);
  });

  client.on("auth_failure", (error) => {
    console.error("Authentication failure:", error);
  });

  await client.initialize();
  return client;
}
