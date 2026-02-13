#!/usr/bin/env node

import { Command } from "commander";
import { runInit } from "./commands/init/handler.js";
import { runSetup } from "./commands/setup/handler.js";
import { runStart } from "./commands/start/handler.js";
import { runStatus } from "./commands/status/handler.js";
import { runStop } from "./commands/stop/handler.js";

const program = new Command();

program
  .name("gaia")
  .description("CLI tool for setting up and managing GAIA")
  .version("0.1.0");

program
  .command("init")
  .description("Full setup from scratch (clone, configure, start)")
  .action(async () => {
    await runInit();
  });

program
  .command("setup")
  .description("Configure an existing GAIA repository")
  .action(async () => {
    await runSetup();
  });

program
  .command("status")
  .description("Check health of all GAIA services")
  .action(async () => {
    await runStatus();
  });

program
  .command("start")
  .description("Start GAIA services")
  .action(async () => {
    await runStart();
  });

program
  .command("stop")
  .description("Stop all GAIA services")
  .action(async () => {
    await runStop();
  });

// Show help when no command is given instead of silently running init
if (!process.argv.slice(2).length) {
  program.outputHelp();
  process.exit(0);
}

program.parse();
