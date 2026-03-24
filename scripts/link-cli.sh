#!/bin/bash
set -e

echo "Linking ploybundle CLI globally..."

cd "$(dirname "$0")/.."

# Build first
pnpm build

# Create a symlink
SCRIPT_DIR="$(cd packages/cli && pwd)"
chmod +x "$SCRIPT_DIR/dist/bin.js"

# Add shebang if needed and link
npm link --workspace=packages/cli 2>/dev/null || {
  echo "Manual linking..."
  ln -sf "$SCRIPT_DIR/dist/bin.js" /usr/local/bin/ploybundle 2>/dev/null || {
    echo "Cannot link to /usr/local/bin. Try:"
    echo "  alias ploybundle='node $SCRIPT_DIR/dist/bin.js'"
  }
}

echo "CLI linked. Try: ploybundle --help"
