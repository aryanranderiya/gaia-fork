#!/bin/sh
set -e

# GAIA CLI Installer
# Usage: curl -fsSL https://heygaia.io/install.sh | sh

BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

info() { printf "${BLUE}[info]${NC} %s\n" "$1"; }
success() { printf "${GREEN}[ok]${NC} %s\n" "$1"; }
warn() { printf "${YELLOW}[warn]${NC} %s\n" "$1"; }
error() { printf "${RED}[error]${NC} %s\n" "$1"; exit 1; }

detect_os() {
  case "$(uname -s)" in
    Linux*)   echo "linux" ;;
    Darwin*)  echo "macos" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    *)        echo "unknown" ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64)  echo "x64" ;;
    aarch64|arm64)  echo "arm64" ;;
    *)              echo "unknown" ;;
  esac
}

check_command() {
  command -v "$1" >/dev/null 2>&1
}

install_node() {
  info "Installing Node.js via nvm..."
  if [ "$(detect_os)" = "windows" ]; then
    error "Please install Node.js manually on Windows: https://nodejs.org"
  fi
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  # shellcheck source=/dev/null
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  nvm install --lts
  if ! check_command node; then
    error "Node.js installation failed. Please install manually: https://nodejs.org"
  fi
  success "Node.js $(node --version) installed successfully"
}

main() {
  printf "\n${BOLD}${BLUE}GAIA CLI Installer${NC}\n\n"

  OS=$(detect_os)
  ARCH=$(detect_arch)
  info "Detected: $OS ($ARCH)"

  if [ "$OS" = "unknown" ]; then
    error "Unsupported operating system"
  fi

  # Determine package manager: prefer npm, fallback to bun
  PKG_MGR=""

  if check_command npm; then
    success "npm is already installed ($(npm --version))"
    PKG_MGR="npm"
  elif check_command bun; then
    success "Bun is already installed ($(bun --version))"
    PKG_MGR="bun"
  else
    warn "No supported package manager found (npm or bun)"
    install_node
    PKG_MGR="npm"
  fi

  # Install GAIA CLI globally
  info "Installing @heygaia/cli via $PKG_MGR..."
  if [ "$PKG_MGR" = "npm" ]; then
    npm install -g @heygaia/cli
  else
    bun install -g @heygaia/cli
  fi

  if check_command gaia; then
    success "GAIA CLI installed successfully!"
    printf "\n${BOLD}Get started:${NC}\n"
    printf "  ${GREEN}gaia init${NC}    - Set up GAIA from scratch\n"
    printf "  ${GREEN}gaia setup${NC}   - Configure an existing repo\n"
    printf "  ${GREEN}gaia status${NC}  - Check service health\n"
    printf "  ${GREEN}gaia --help${NC}  - Show all commands\n\n"
  else
    warn "Installation completed but 'gaia' command not found in PATH"
    if [ "$PKG_MGR" = "npm" ]; then
      printf "You may need to add npm's global bin directory to your PATH:\n"
      printf "  export PATH=\"\$(npm config get prefix)/bin:\$PATH\"\n\n"
    else
      printf "You may need to add Bun's global bin directory to your PATH:\n"
      printf "  export PATH=\"\$HOME/.bun/bin:\$PATH\"\n\n"
    fi
  fi
}

main
