#!/bin/bash

# Floating Todo Development Script
# This script starts the development server

echo "🚀 Starting Floating Todo in development mode..."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check if Rust is installed
if ! command -v rustc &> /dev/null; then
    echo "⚠️  Rust is not installed. Installing..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source $HOME/.cargo/env
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo "🔧 Starting development server..."
echo ""
echo "💡 Tips:"
echo "   - Press Ctrl+C to stop"
echo "   - The app will auto-reload when you make changes"
echo ""

npm run tauri-dev
