#!/bin/zsh
set -euo pipefail
cd "${0:A:h}/.."
BUILD_DIR="${MARKDOWNDESK_BUILD_DIR:-${PWD}/build}"
APP="$BUILD_DIR/MarkdownDesk.app"
node scripts/prepare-vendor.js
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/Web/vendor" "$APP/Contents/Resources/Licenses"
cp Info.plist "$APP/Contents/Info.plist"
cp Web/index.html Web/style.css Web/editor.js "$APP/Contents/Resources/Web/"
cp Web/vendor/*.js "$APP/Contents/Resources/Web/vendor/"
for name in marked dompurify turndown turndown-plugin-gfm mermaid; do
  cp "node_modules/$name/LICENSE" "$APP/Contents/Resources/Licenses/$name.txt"
done
SWIFT_ARCH=()
BUILD_ARCH=$(uname -m)
if /usr/bin/arch -arm64 /usr/bin/true 2>/dev/null; then
  SWIFT_ARCH=(/usr/bin/arch -arm64)
  BUILD_ARCH=arm64
fi
SDK="${MARKDOWNDESK_SDK:-$("${SWIFT_ARCH[@]}" /usr/bin/xcrun --show-sdk-path)}"
if [[ -z "${MARKDOWNDESK_SDK:-}" && "$("${SWIFT_ARCH[@]}" /usr/bin/swiftc --version 2>/dev/null)" == *"Swift version 6.3"* \
      && -d /Library/Developer/CommandLineTools/SDKs/MacOSX26.sdk ]]; then
  SDK=/Library/Developer/CommandLineTools/SDKs/MacOSX26.sdk
fi
"${SWIFT_ARCH[@]}" /usr/bin/swiftc -swift-version 5 -O -sdk "$SDK" \
  -target "${BUILD_ARCH}-apple-macos13.0" \
  -module-cache-path "$BUILD_DIR/ModuleCache" -framework AppKit -framework WebKit \
  Sources/MarkdownDesk.swift -o "$APP/Contents/MacOS/MarkdownDesk"
echo "$APP"
