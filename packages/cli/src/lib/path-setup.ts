import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

interface PathSetupResult {
  success: boolean;
  message: string;
  inPath: boolean;
  pathAdded: boolean;
}

function getNpmBinDir(): string | null {
  try {
    const prefix = execSync("npm config get prefix", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return path.join(prefix, "bin");
  } catch {
    return null;
  }
}

function isGaiaInPath(): boolean {
  try {
    const cmd = process.platform === "win32" ? "where gaia" : "command -v gaia";
    execSync(cmd, { stdio: ["pipe", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

function getShellRcFile(): string | null {
  const shell = process.env.SHELL || "";
  const home = os.homedir();

  if (shell.includes("zsh")) return path.join(home, ".zshrc");
  if (shell.includes("bash")) {
    const bashrc = path.join(home, ".bashrc");
    const profile = path.join(home, ".bash_profile");
    return fs.existsSync(bashrc) ? bashrc : profile;
  }
  if (shell.includes("fish"))
    return path.join(home, ".config", "fish", "config.fish");

  return null;
}

function addToRcFile(binDir: string, rcFile: string): boolean {
  try {
    const content = fs.existsSync(rcFile)
      ? fs.readFileSync(rcFile, "utf-8")
      : "";

    if (content.includes(binDir)) return true;

    const isFish = rcFile.includes("fish");
    const exportLine = isFish
      ? `\nset -gx PATH "${binDir}" $PATH  # Added by GAIA CLI\n`
      : `\nexport PATH="${binDir}:$PATH"  # Added by GAIA CLI\n`;

    fs.appendFileSync(rcFile, exportLine);
    return true;
  } catch {
    return false;
  }
}

export async function ensureGaiaInPath(): Promise<PathSetupResult> {
  if (isGaiaInPath()) {
    return {
      success: true,
      message: "gaia command is ready.",
      inPath: true,
      pathAdded: false,
    };
  }

  const binDir = getNpmBinDir();
  if (!binDir) {
    return {
      success: false,
      message:
        "Could not detect npm bin directory. Run manually: npm install -g @heygaia/cli",
      inPath: false,
      pathAdded: false,
    };
  }

  const gaiaPath = path.join(binDir, "gaia");
  if (!fs.existsSync(gaiaPath)) {
    return {
      success: false,
      message: `gaia binary not found at ${gaiaPath}. Install may have failed.`,
      inPath: false,
      pathAdded: false,
    };
  }

  const rcFile = getShellRcFile();
  if (!rcFile) {
    return {
      success: false,
      message: `Add to your PATH: export PATH="${binDir}:$PATH"`,
      inPath: false,
      pathAdded: false,
    };
  }

  const added = addToRcFile(binDir, rcFile);
  if (added) {
    const rcName = path.basename(rcFile);
    return {
      success: true,
      message: `Added to PATH via ~/${rcName}. Restart terminal or run: source ~/${rcName}`,
      inPath: false,
      pathAdded: true,
    };
  }

  return {
    success: false,
    message: `Could not write to ${rcFile}. Add manually: export PATH="${binDir}:$PATH"`,
    inPath: false,
    pathAdded: false,
  };
}
