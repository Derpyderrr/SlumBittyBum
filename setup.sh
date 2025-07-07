#!/bin/bash

echo "🔹 Starting project setup..."

# Step 1: Install npm dependencies
echo "📦 Installing Node.js packages..."
npm install

# Step 2: Setup .env file
if [ -f ".env" ]; then
    echo "⚠️  .env file already exists. Skipping creation."
else
    if [ -f ".env.example" ]; then
        echo "🗂️  Creating .env from .env.example..."
        cp .env.example .env
        echo "✅ .env file created. Please update it with your actual Discord bot token."
    else
        echo "⚠️  No .env.example found. Skipping .env creation."
    fi
fi

echo "✅ Setup complete! You can now run your bot with: node index.js"