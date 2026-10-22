package app.astnum.mobile.widget;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Single source of truth for the widget payload (mirrors the TypeScript
 * contract in src/lib/widgets/types.ts — the web app pushes ONE JSON
 * snapshot with every display string PRE-FORMATTED; the native layer only
 * mirrors strings and drives ProgressBar/Chronometer ints and ring bitmaps).
 *
 * Stored in SharedPreferences so every AppWidgetProvider (and the plugin)
 * reads the same state cheaply from any process context.
 */
public final class WidgetState {

    static final String PREFS = "astnum_widgets";
    static final String KEY_PAYLOAD = "payload";

    private WidgetState() {}

    public static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Latest payload — null when absent/corrupt (callers render the placeholder). */
    public static JSONObject load(Context c) {
        String raw = prefs(c).getString(KEY_PAYLOAD, null);
        if (raw == null || raw.isEmpty()) return null;
        try {
            return new JSONObject(raw);
        } catch (Exception e) {
            return null;
        }
    }

    public static void store(Context c, String payload) {
        prefs(c).edit().putString(KEY_PAYLOAD, payload).apply();
    }

    /* ── never-throw typed getters ─────────────────────────────────────── */

    public static JSONObject obj(JSONObject root, String key) {
        if (root == null) return null;
        try {
            return root.has(key) ? root.getJSONObject(key) : null;
        } catch (Exception e) {
            return null;
        }
    }

    /** JSON array getter — null when absent/corrupt. */
    public static JSONArray arr(JSONObject root, String key) {
        if (root == null) return null;
        try {
            return root.has(key) ? root.getJSONArray(key) : null;
        } catch (Exception e) {
            return null;
        }
    }

    /** Element of a JSON array — null when out of range/corrupt. */
    public static JSONObject at(JSONArray a, int i) {
        if (a == null || i < 0 || i >= a.length()) return null;
        try {
            return a.getJSONObject(i);
        } catch (Exception e) {
            return null;
        }
    }

    public static String str(JSONObject o, String key, String fallback) {
        if (o == null) return fallback;
        try {
            String v = o.optString(key, null);
            return v == null || v.isEmpty() ? fallback : v;
        } catch (Exception e) {
            return fallback;
        }
    }

    public static int num(JSONObject o, String key, int fallback) {
        if (o == null) return fallback;
        try {
            return o.optInt(key, fallback);
        } catch (Exception e) {
            return fallback;
        }
    }

    public static long longNum(JSONObject o, String key, long fallback) {
        if (o == null) return fallback;
        try {
            return o.optLong(key, fallback);
        } catch (Exception e) {
            return fallback;
        }
    }

    public static boolean bool(JSONObject o, String key, boolean fallback) {
        if (o == null) return fallback;
        try {
            return o.optBoolean(key, fallback);
        } catch (Exception e) {
            return fallback;
        }
    }

    /** barDone from a {barDone, barTotal} object. */
    static int barDone(JSONObject o) {
        return num(o, "barDone", 0);
    }

    /** barTotal from a {barDone, barTotal} object. */
    static int barTotal(JSONObject o) {
        return num(o, "barTotal", 0);
    }
}
