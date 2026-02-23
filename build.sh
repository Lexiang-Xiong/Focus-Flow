#!/bin/bash

# Floating Todo Build Script
# This script builds both the frontend and the Tauri desktop application

set -e

echo "🚀 Building Floating Todo..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js 18+ first.${NC}"
    exit 1
fi

# Check if Rust is installed
if ! command -v rustc &> /dev/null; then
    echo -e "${YELLOW}⚠️  Rust is not installed. Installing...${NC}"
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source $HOME/.cargo/env
fi

echo -e "${GREEN}✓ Dependencies check passed${NC}"

# Install npm dependencies
echo "📦 Installing npm dependencies..."
npm install

# Build frontend
echo "🔨 Building frontend..."
npm run build

# Build Tauri application
echo "🖥️  Building desktop application..."
npm run tauri build

echo -e "${GREEN}✅ Build complete!${NC}"
echo ""
echo "📁 Output locations:"
echo "   - Frontend: ./dist/"
echo "   - Desktop app: ./src-tauri/target/release/bundle/"
echo ""
echo "🎉 You can now install the application from the bundle directory!"
