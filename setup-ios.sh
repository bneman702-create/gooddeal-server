#!/bin/bash
# GoodDeal? — iOS App Store Setup Script
# Run this on your Mac after cloning the repo
# Requirements: Node.js, Xcode (from Mac App Store), Apple Developer account

set -e
echo "🔍 GoodDeal? — iOS Setup"
echo "========================"

# Check for Xcode
if ! xcode-select -p &>/dev/null; then
  echo "❌ Xcode not found. Install it from the Mac App Store first."
  exit 1
fi

echo "✅ Xcode found"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build web files
echo "🏗️  Building web files..."
npm run build

# Initialize Capacitor iOS project
echo "📱 Adding iOS platform..."
npx cap add ios

# Sync
echo "🔄 Syncing..."
npx cap sync ios

echo ""
echo "✅ Done! Opening Xcode..."
echo ""
echo "Next steps in Xcode:"
echo "1. Select 'GoodDeal?' in the project navigator"
echo "2. Under Signing & Capabilities, select your Apple Developer Team"
echo "3. Change Bundle Identifier if needed (currently: com.gooddeal.app)"
echo "4. Connect your iPhone and click Run — or Archive to submit to App Store"
echo ""

npx cap open ios
