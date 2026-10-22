#!/usr/bin/env bash
# ASTNUM — re-provision the (gitignored) Android build toolchain inside the
# project (survives environment resets): Temurin JDK 21 + Android SDK cmdline-tools
# + platform-35 + build-tools 35.0.0. Orphaned: logs to toolchain-setup.log.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../android-app"
mkdir -p toolchain
cd toolchain
LOG="$SCRIPT_DIR/../toolchain-setup.log"
{
  echo "▸ $(date -Is) toolchain setup start"
  if [ ! -d jdk-21.0.12.1+1 ] && [ ! -d jdk21 ]; then
    echo "▸ downloading Temurin JDK 21"
    curl -sL -o jdk21.tar.gz "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse" || { echo "✗ jdk download failed"; exit 1; }
    tar xzf jdk21.tar.gz && rm jdk21.tar.gz
    JDkdir=$(ls -d jdk-21* | head -1)
    ln -sfn "$JDkdir" jdk21
  fi
  echo "▸ jdk: $(jdk21/bin/javac -version 2>&1)"
  if [ ! -d android-sdk/platforms/android-35 ]; then
    echo "▸ downloading cmdline-tools"
    curl -sL -o cmdtools.zip "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" || { echo "✗ cmdtools download failed"; exit 1; }
    unzip -q cmdtools.zip && mkdir -p android-sdk/cmdline-tools && mv cmdline-tools android-sdk/cmdline-tools/latest && rm cmdtools.zip
    echo "▸ sdkmanager installing platform + build-tools"
    yes | android-sdk/cmdline-tools/latest/bin/sdkmanager --sdk_root=$PWD/android-sdk "platform-tools" "platforms;android-35" "build-tools;35.0.0" >/dev/null 2>&1
  fi
  echo "▸ aapt2: $(android-sdk/build-tools/35.0.0/aapt2 version 2>&1)"
  echo "sdk.dir=$(pwd)/android-sdk" > ../android/local.properties
  echo "✓ $(date -Is) toolchain ready — local.properties written"
} >> "$LOG" 2>&1
