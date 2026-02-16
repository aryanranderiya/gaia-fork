# GAIA WhatsApp Bot

The official WhatsApp bot for GAIA - your proactive personal AI assistant.

## Features

- 🤖 Chat with GAIA via WhatsApp messages
- 📋 Manage todos directly from WhatsApp
- 🔄 Execute and monitor workflows
- 💬 Access your conversation history



## Setup

### Prerequisites

- Node.js 18+ and pnpm
- WhatsApp account
- GAIA API running
- Chrome/Chromium browser (for authentication)

### 1. Environment Configuration

Create `.env` file in `apps/bots/whatsapp/`:

```bash
GAIA_API_URL=http://localhost:8000
GAIA_BOT_API_KEY=your_secure_bot_api_key
```

### 2. Start the Bot

```bash
# Development mode
nx dev bot-whatsapp

# Production mode
nx build bot-whatsapp
nx start bot-whatsapp
```

### 3. Authenticate with WhatsApp

When you first start the bot:

1. A QR code will appear in the terminal
2. Open WhatsApp on your phone
3. Go to Settings → Linked Devices
4. Tap "Link a Device"
5. Scan the QR code from the terminal
6. The bot will be ready once authentication succeeds

### 4. Authentication Data

- Session data is stored in `.wwebjs_auth/` directory
- This directory is git-ignored for security
- Keep this directory to avoid re-scanning QR code on restart
- Delete it to reset authentication

## Available Commands

All commands start with `/`:

### General

- `/help` - Show all available commands
- `/auth` - Link your WhatsApp number to GAIA

### Workflows

- `/workflow list` - List all workflows
- `/workflow get <id>` - Get workflow details
- `/workflow execute <id>` - Execute a workflow

### Todos

- `/todo list` - List your todos
- `/todo add <title>` - Create a new todo
- `/todo complete <id>` - Mark as complete
- `/todo delete <id>` - Delete a todo

### Conversations

- `/conversations` - List your recent GAIA conversations

### Utilities



## Authentication

1. Send `/auth` to the bot
2. Click the provided link in the response
3. Log in to your GAIA account
4. Your WhatsApp number is now linked!

## Troubleshooting

### QR code doesn't scan

- Ensure you have a stable internet connection
- Try restarting the bot
- Delete `.wwebjs_auth/` and re-authenticate

### Bot disconnects frequently

- Check your internet connection
- Ensure WhatsApp Web is not open in other browsers
- Verify your phone has a stable connection

### Commands don't work

- Ensure all commands start with `/`
- Check that you've linked your account with `/auth`
- Verify the GAIA API is running

### "Session terminated" errors

- Delete `.wwebjs_auth/` directory
- Restart the bot
- Re-scan the QR code

## Production Deployment

For production environments:

1. Use a headless server or VPS
2. Install Chrome/Chromium dependencies:

   ```bash
   # Ubuntu/Debian
   sudo apt-get install -y chromium-browser

   # Or use puppeteer bundled Chromium
   ```

3. Run in background with PM2 or similar:

   ```bash
   pm2 start dist/index.js --name gaia-whatsapp
   ```

4. Set up monitoring to restart on disconnection

## Important Notes

- WhatsApp may ban accounts that use unofficial APIs
- This bot uses whatsapp-web.js which mimics WhatsApp Web
- For production use, consider official WhatsApp Business API
- Keep your authentication data secure

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
nx dev bot-whatsapp

# Build for production
nx build bot-whatsapp
```

## Support

For issues and feature requests, visit [GAIA Documentation](https://docs.gaia.com).
