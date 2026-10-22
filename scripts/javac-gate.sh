#!/usr/bin/env bash
# ASTNUM — pre-gradle javac gate: compile ALL widget/launcher java against
# android.jar (platform-35) + minimal Capacitor stubs + aapt2-generated R.
# Catches missing imports / bad signatures / wrong R references BEFORE the
# multi-minute gradle build. Never produces artifacts — /tmp only.
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TC="$SCRIPT_DIR/../android-app/toolchain"
SDK="$TC/android-sdk"
AAPT2="$SDK/build-tools/35.0.0/aapt2"
JAVAC="$TC/jdk21/bin/javac"
MAIN="$SCRIPT_DIR/../android-app/android/app/src/main"
RES="$MAIN/res"
MANIFEST="$MAIN/AndroidManifest.xml"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# 1. aapt2: compile resources + link → R.java with every id/layout/drawable/
#    string/color the java layer references (missing @drawable → error here).
#    The gradle build injects the namespace; for aapt2 we patch a temp copy.
#    styles.xml (AppCompat/SplashScreen AAR parents) + manifest android:theme
#    attributes are stripped in the COPY only — they link via gradle, the
#    gate only needs the R constants the java layer actually references.
mkdir -p "$TMP/gen" "$TMP/res"
cp -r "$RES/." "$TMP/res/"
rm -f "$TMP/res/values/styles.xml"
sed -E 's|<manifest xmlns:android="http://schemas.android.com/apk/res/android">|<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="app.astnum.mobile">|; s/ android:theme="[^"]*"//g' \
  "$MANIFEST" > "$TMP/manifest.xml"
grep -q 'package="app.astnum.mobile"' "$TMP/manifest.xml" || { echo "✗ manifest patch failed"; exit 1; }
"$AAPT2" compile --dir "$TMP/res" -o "$TMP/res.zip" || { echo "✗ aapt2 compile failed"; exit 1; }
"$AAPT2" link -o "$TMP/out.apk" \
  -I "$SDK/platforms/android-35/android.jar" \
  --manifest "$TMP/manifest.xml" \
  --java "$TMP/gen" \
  --auto-add-overlay \
  "$TMP/res.zip" >/dev/null || { echo "✗ aapt2 link failed"; exit 1; }
echo "✓ aapt2: resources compile + link clean (R generated)"

# 2. Capacitor stubs — ONLY the surface the plugin/launcher touch.
mkdir -p "$TMP/stub/com/getcapacitor" "$TMP/stub/com/getcapacitor/annotation"
cat > "$TMP/stub/com/getcapacitor/Bridge.java" << 'EOF'
package com.getcapacitor;
public class Bridge {}
EOF
cat > "$TMP/stub/com/getcapacitor/BridgeActivity.java" << 'EOF'
package com.getcapacitor;
public class BridgeActivity extends android.app.Activity {
  public void registerPlugin(Class<?> plugin) {}
  @Override public void onCreate(android.os.Bundle savedInstanceState) { super.onCreate(savedInstanceState); }
}
EOF
cat > "$TMP/stub/com/getcapacitor/Plugin.java" << 'EOF'
package com.getcapacitor;
public class Plugin {
  protected Bridge bridge;
  public Bridge getBridge() { return bridge; }
  protected android.content.Context getContext() { return null; }
  protected android.app.Activity getActivity() { return null; }
  protected void notifyListeners(String event, org.json.JSONObject data) {}
  protected void handleOnDestroy() {}
  public void handleOnNewIntent(android.content.Intent intent) {}
}
EOF
cat > "$TMP/stub/com/getcapacitor/PluginCall.java" << 'EOF'
package com.getcapacitor;
public class PluginCall {
  public String getString(String key) { return null; }
  public JSArray getArray(String key) { return null; }
  public void reject(String message) {}
  public void resolve() {}
  public void resolve(JSObject data) {}
}
EOF
cat > "$TMP/stub/com/getcapacitor/JSObject.java" << 'EOF'
package com.getcapacitor;
public class JSObject extends org.json.JSONObject {
  public JSObject() { super(); }
  public JSObject put(String name, boolean value) { return this; }
  public JSObject put(String name, int value) { return this; }
  public JSObject put(String name, long value) { return this; }
  public JSObject put(String name, double value) { return this; }
  public JSObject put(String name, Object value) { return this; }
}
EOF
cat > "$TMP/stub/com/getcapacitor/JSArray.java" << 'EOF'
package com.getcapacitor;
public class JSArray extends org.json.JSONArray {
  public JSArray() { super(); }
  public JSArray put(boolean value) { return this; }
  public JSArray put(int value) { return this; }
  public JSArray put(long value) { return this; }
  public JSArray put(double value) { return this; }
  public JSArray put(Object value) { return this; }
}
EOF
cat > "$TMP/stub/com/getcapacitor/PluginMethod.java" << 'EOF'
package com.getcapacitor;
@java.lang.annotation.Retention(java.lang.annotation.RetentionPolicy.RUNTIME)
public @interface PluginMethod {}
EOF
cat > "$TMP/stub/com/getcapacitor/annotation/CapacitorPlugin.java" << 'EOF'
package com.getcapacitor.annotation;
@java.lang.annotation.Retention(java.lang.annotation.RetentionPolicy.RUNTIME)
@java.lang.annotation.Target(java.lang.annotation.ElementType.TYPE)
public @interface CapacitorPlugin { String name(); }
EOF

# 3. compile every java file (R stub + app sources + stubs) — warnings quiet.
find "$MAIN/java" -name "*.java" > "$TMP/sources.txt"
COUNT=$(wc -l < "$TMP/sources.txt")
"$JAVAC" -nowarn -encoding UTF-8 -d "$TMP/classes" \
  -classpath "$SDK/platforms/android-35/android.jar" \
  @"$TMP/sources.txt" "$TMP/gen/app/astnum/mobile/R.java" \
  $(find "$TMP/stub" -name "*.java") 2> "$TMP/errors.log"
RC=$?
if [ $RC -ne 0 ]; then
  echo "✗ javac failed ($COUNT source files):"
  head -60 "$TMP/errors.log"
  exit 1
fi
echo "✓ javac: $COUNT app classes + R + stubs compile clean"
exit 0
