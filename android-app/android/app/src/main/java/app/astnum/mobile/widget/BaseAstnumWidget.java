package app.astnum.mobile.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import org.json.JSONObject;

/**
 * Base for the 19 ASTNUM widgets: renders from the shared SharedPreferences
 * snapshot on every system onUpdate and gives the flip widgets a tiny
 * per-widget-id index store (tap-to-advance cycles it) plus a per-widget-id
 * RENDER mode for the pin widget (each instance shows its own item).
 *
 * Subclasses override:
 *   build(ctx, state)            — content (static, mirrors WidgetState)
 *   build(ctx, state, id)       — flip widgets + per-id widgets (pin)
 *   flipAction() / flipEnabled() — flip widgets: their broadcast action
 *   perIdEnabled()               — pin widget: render per instance, no flip
 */
abstract class BaseAstnumWidget extends AppWidgetProvider {

    private static final String FLIP_PREFS = "astnum_widget_flip";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        if (appWidgetIds == null || appWidgetIds.length == 0) return;
        try {
            JSONObject state = WidgetState.load(context);
            if (flipEnabled() || perIdEnabled()) {
                for (int id : appWidgetIds) {
                    RemoteViews views = build(context, state, id);
                    if (views != null) appWidgetManager.updateAppWidget(id, views);
                }
            } else {
                // identical content for every instance → one RemoteViews push
                RemoteViews views = build(context, state);
                if (views != null) appWidgetManager.updateAppWidget(appWidgetIds, views);
            }
        } catch (Exception ignored) {
            // never crash the launcher
        }
    }

    /** Flip widgets: advance the stored index for the tapped widget + re-render it. */
    void advanceFlip(Context context, int appWidgetId, int count) {
        if (count <= 1) return; // nothing to cycle
        SharedPreferences prefs = context.getSharedPreferences(FLIP_PREFS, Context.MODE_PRIVATE);
        String key = getClass().getSimpleName() + "_" + appWidgetId;
        int next = (prefs.getInt(key, 0) + 1) % count;
        prefs.edit().putInt(key, next).apply();
        WidgetRender.pushId(context, getClass(), appWidgetId);
    }

    /** Current flip index for one widget id (clamped against the live count). */
    int flipIndex(Context context, int appWidgetId, int count) {
        if (count <= 0) return 0;
        SharedPreferences prefs = context.getSharedPreferences(FLIP_PREFS, Context.MODE_PRIVATE);
        String key = getClass().getSimpleName() + "_" + appWidgetId;
        int idx = prefs.getInt(key, 0);
        return idx % count;
    }

    /* ── subclass contract ──────────────────────────────────────────────── */

    /** Content RemoteViews from the shared snapshot (non-flip widgets). */
    abstract RemoteViews build(Context ctx, org.json.JSONObject state);

    /** Content RemoteViews for one widget id (flip widgets). */
    @SuppressWarnings("unused")
    RemoteViews build(Context ctx, org.json.JSONObject state, int appWidgetId) {
        return build(ctx, state);
    }

    /** The widget's own broadcast action (register in the manifest receiver). */
    @SuppressWarnings("unused")
    String flipAction() {
        return null;
    }

    boolean flipEnabled() {
        return false;
    }

    /** Per-instance rendering WITHOUT flip semantics (the pin widget: each
     *  placed instance shows the one item the user pinned to IT). */
    @SuppressWarnings("unused")
    boolean perIdEnabled() {
        return false;
    }
}
