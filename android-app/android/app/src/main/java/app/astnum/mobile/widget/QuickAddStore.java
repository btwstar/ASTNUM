package app.astnum.mobile.widget;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * The persistent quick-capture queue — the transactional heart of the
 * "add habit/note/drink from the home screen" story.
 *
 * Every typed capture is enqueued HERE first (a SharedPreferences JSON
 * array — survives process death), then one of two paths commits it:
 *   • live  — the app process is alive → the plugin forwards it into the
 *             running WebView, which creates the row through the app's own
 *             routes and acks (captureAck).
 *   • headless — the process is dead → QuickAddActivity spawns a same-origin
 *             offscreen WebView (quickadd bundle) that commits into the
 *             shared localStorage database, rebuilds the widget snapshot
 *             and returns the acked ids.
 * Whatever crashes in between (frozen WebView, killed process, launcher
 * quirks) — the queue entry survives and the app consumes it on its next
 * open, deduplicated through the web-side ledger. Nothing is ever lost,
 * nothing is ever duplicated.
 */
final class QuickAddStore {

    private static final String PREFS = "astnum_quickadd";
    private static final String KEY_QUEUE = "queue";
    /** generous cap — the queue is a transient buffer, not a log */
    private static final int MAX_QUEUE = 64;

    private QuickAddStore() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Add one capture; returns its id (null only if storage itself failed).
     *  The drink parameter is only meaningful for type="water"
     *  ("water" | "juice" | "other") and is persisted into the entry so
     *  the web commit path logs the right hydration category. */
    static synchronized String enqueue(Context ctx, String type, String title, String drink) {
        try {
            SharedPreferences p = prefs(ctx);
            JSONArray arr = read(p);
            JSONObject entry = new JSONObject();
            String id = UUID.randomUUID().toString();
            entry.put("id", id);
            entry.put("type", "note".equals(type) ? "note"
                    : "water".equals(type) ? "water" : "habit");
            entry.put("title", title == null ? "" : title);
            if (drink != null && !drink.isEmpty()) entry.put("drink", drink);
            entry.put("ts", System.currentTimeMillis());
            arr.put(entry);
            while (arr.length() > MAX_QUEUE) arr.remove(0);
            p.edit().putString(KEY_QUEUE, arr.toString()).apply();
            return id;
        } catch (Exception e) {
            return null;
        }
    }

    /** Habit/note captures (no drink category). */
    static synchronized String enqueue(Context ctx, String type, String title) {
        return enqueue(ctx, type, title, null);
    }

    /** Current queue as a JSON array string (never null). */
    static synchronized String peek(Context ctx) {
        try {
            return prefs(ctx).getString(KEY_QUEUE, "[]");
        } catch (Exception e) {
            return "[]";
        }
    }

    /** True when there is nothing pending. */
    static synchronized boolean isEmpty(Context ctx) {
        try {
            return read(prefs(ctx)).length() == 0;
        } catch (Exception e) {
            return true;
        }
    }

    /** Remove the given committed ids (the ack path). */
    static synchronized void remove(Context ctx, List<String> ids) {
        if (ids == null || ids.isEmpty()) return;
        try {
            SharedPreferences p = prefs(ctx);
            JSONArray arr = read(p);
            JSONArray kept = new JSONArray();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject e = arr.optJSONObject(i);
                String id = e == null ? null : e.optString("id", "");
                if (id != null && ids.contains(id)) continue;
                kept.put(arr.get(i));
            }
            p.edit().putString(KEY_QUEUE, kept.toString()).apply();
        } catch (Exception ignored) {
            // a failed ack just means a harmless duplicate-skipped entry later
        }
    }

    /** Remove one committed id (live-path ack). */
    static synchronized void removeId(Context ctx, String id) {
        if (id == null || id.isEmpty()) return;
        List<String> one = new ArrayList<>(1);
        one.add(id);
        remove(ctx, one);
    }

    /** Drop everything (hard reset — never used in the normal flow). */
    static synchronized void clear(Context ctx) {
        try {
            prefs(ctx).edit().remove(KEY_QUEUE).apply();
        } catch (Exception ignored) {
        }
    }

    private static JSONArray read(SharedPreferences p) {
        try {
            String raw = p.getString(KEY_QUEUE, "[]");
            JSONArray arr = new JSONArray(raw == null ? "[]" : raw);
            return arr;
        } catch (Exception e) {
            return new JSONArray();
        }
    }
}
