#!/bin/bash
set -e

echo "Setting up Ploybundle development environment..."

# Check Node.js version
NODE_VERSION=$(node -v 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 20 ]; then
  echo "Error: Node.js >= 20 required. Found: $(node -v 2>/dev/null || echo 'not installed')"
  exit 1
fi

# Check pnpm
if ! command -v pnpm &> /dev/null; then
  echo "Error: pnpm is required. Install with: npm install -g pnpm"
  exit 1
fi

echo "Node.js: $(node -v)"
echo "pnpm: $(pnpm -v)"

# Install dependencies
echo "Installing dependencies..."
pnpm install

# Build all packages
echo "Building packages..."
pnpm build

echo ""
echo "Setup complete. You can now use:"
echo "  pnpm build    - Build all packages"
echo "  pnpm test     - Run all tests"
echo "  pnpm dev      - Start dev mode"
echo ""
echo "To test the CLI:"
echo "  node packages/cli/dist/bin.js --help"
