#!/usr/bin/env bash
# Build the RemoteMac macOS app (Release), package it into a DMG, and move
# the DMG into ~/Desktop/RemoteMac-DMG. Run from anywhere:
#   ./scripts/export-mac-dmg.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_DIR="$ROOT/apps/mac/RemoteMac"
OUT_DIR="${REMOTEMAC_DMG_DIR:-$HOME/Desktop/RemoteMac-DMG}"
BUILD_DIR="$PROJECT_DIR/build"
STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT

echo "==> Building RemoteMac (Release)"
xcodebuild \
  -project "$PROJECT_DIR/RemoteMac.xcodeproj" \
  -scheme RemoteMac \
  -configuration Release \
  -derivedDataPath "$PROJECT_DIR/.build/DerivedData" \
  CONFIGURATION_BUILD_DIR="$BUILD_DIR/Release" \
  build | tail -n 3

APP="$BUILD_DIR/Release/RemoteMac.app"
[ -d "$APP" ] || { echo "error: $APP not found" >&2; exit 1; }

# Without a Developer ID cert the build is ad-hoc signed, and hardened-runtime
# library validation then refuses to load the embedded WebRTC.framework
# ("different Team IDs"). Re-sign inside-out and allow the embedded framework.
echo "==> Re-signing app bundle"
ENTITLEMENTS="$STAGE_DIR/entitlements.plist"
cat > "$ENTITLEMENTS" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
</dict>
</plist>
PLIST
SIGN_ID="${REMOTEMAC_SIGN_IDENTITY:--}"
for fw in "$APP"/Contents/Frameworks/*; do
  [ -e "$fw" ] && codesign --force --sign "$SIGN_ID" --timestamp=none "$fw"
done
codesign --force --sign "$SIGN_ID" --timestamp=none --options runtime \
  --entitlements "$ENTITLEMENTS" "$APP"
rm -f "$ENTITLEMENTS"
codesign --verify --deep --strict "$APP"

VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist" 2>/dev/null || echo 0.0.0)"
DMG_NAME="RemoteMac-${VERSION}.dmg"

echo "==> Packaging $DMG_NAME"
cp -R "$APP" "$STAGE_DIR/"
ln -s /Applications "$STAGE_DIR/Applications"
hdiutil create -volname "RemoteMac" -srcfolder "$STAGE_DIR" \
  -ov -format UDZO "$BUILD_DIR/$DMG_NAME" >/dev/null

mkdir -p "$OUT_DIR"
mv -f "$BUILD_DIR/$DMG_NAME" "$OUT_DIR/$DMG_NAME"
echo "==> Done: $OUT_DIR/$DMG_NAME"
