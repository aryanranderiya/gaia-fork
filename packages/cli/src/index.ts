#!/usr/bin/env bun

import { runInit } from "./commands/init/handler.js";

// Simple routing for now since we don't have commander yet
// In future: parse argv
runInit();
