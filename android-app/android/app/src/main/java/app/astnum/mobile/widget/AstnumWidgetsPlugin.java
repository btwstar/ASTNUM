package app.astnum.mobile.widget;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

/**
 * AstnumWidgets — inline Capacitor plugin bridging the WebView app to the
 * 19 native home-screen widgets (the JS side: src/lib/widgets/bridge.ts).
 *
 *   update({payload, ts})     store the JSON snapshot + re-render all widgets
 *   requestPin({widget})      system "add widget to home screen" dialog (26+)
 *   getWidgetIds({widget})    ids of the placed instances of one kind
 *   getLaunchUrl()            cold-start deep link (widget tap → app boot)
 *   "deepLink" event          warm-start deep links (onNewIntent → JS)
 *   "quickAction" event       the active-session widget's buttons, forwarded
 *                             to the WebView when the process is alive — the
 *                             action runs WITHOUT bringing the app up. A dead
 *                             process falls back to launching the app with a
 *                             quicklog/quicknext deep link (completes on boot).
 *   "quickCapture" event      the quick-add dialog typed a habit/note (or
 *                             logged a drink — v2.4 water mode) over the
 *                             home screen → the LIVE WebView creates the
 *                             row through the app's own routes, acks via
 *                             captureAck and pushes a fresh snapshot.
 *   consumeCaptures()         the native quick-add queue as a JSON array
 *                             (the JS boot path commits any leftovers).
 *   captureAck({ids})         confirm committed entries — removed from the queue.
 *
 * The payload is validated before storing and rendering is fully wrapped —
 * a malformed snapshot can only produce the placeholder, never a crash.
 */
@CapacitorPlugin(name = "AstnumWidgets")
public class AstnumWidgetsPlugin extends Plugin {

    /** Live plugin instance — lets the widget receivers reach the WebView. */
    private static volatile AstnumWidgetsPlugin instance;

    public AstnumWidgetsPlugin() {
        super();
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        super.handleOnDestroy();
    }

    /**
     * Route a widget quick-action button. Process alive → "quickAction" event
     * (the JS side logs the set / defers the exercise and pushes the fresh
     * snapshot back). Process dead → launch the app with a quicklog deep link
     * (widget taps are user interactions → background-activity-launch allowed).
     */
    static void dispatchQuickAction(Context ctx, String action, String exerciseId, int widgetId) {
        AstnumWidgetsPlugin plugin = instance;
        if (plugin != null && plugin.getBridge() != null) {
            try {
                JSObject data = new JSObject();
                data.put("action", action);
                data.put("exerciseId", exerciseId == null ? "" : exerciseId);
                data.put("widgetId", widgetId);
                plugin.notifyListeners("quickAction", data);
                return;
            } catch (Exception ignored) {
                // fall through to the launch fallback
            }
        }
        try {
            String uri = "logSet".equals(action)
                    ? "astnum://open?tab=gym&quicklog=" + (exerciseId == null ? "" : exerciseId)
                    : "astnum://open?tab=gym&quicknext=" + (exerciseId == null ? "" : exerciseId);
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
            i.setPackage(ctx.getPackageName());
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
        } catch (Exception ignored) {
        }
    }

    /**
     * Route a quick-add dialog capture to the LIVE WebView (process alive):
     * JS creates the habit/note (or logs the drink — v2.4 water mode) through
     * the app's own routes, acks via captureAck and pushes the refreshed
     * widget snapshot by itself. Returns false when the bridge is dead —
     * the caller (QuickAddActivity) then commits through the headless
     * same-origin bundle instead.
     */
    static boolean dispatchQuickCapture(String entryId, String type, String title, String drink) {
        AstnumWidgetsPlugin plugin = instance;
        if (plugin != null && plugin.getBridge() != null) {
            try {
                JSObject data = new JSObject();
                data.put("id", entryId == null ? "" : entryId);
                data.put("type", type == null ? "habit" : type);
                data.put("title", title == null ? "" : title);
                if (drink != null && !drink.isEmpty()) data.put("drink", drink);
                plugin.notifyListeners("quickCapture", data);
                return true;
            } catch (Exception ignored) {
            }
        }
        return false;
    }

    @PluginMethod
    public void update(PluginCall call) {
        String payload = call.getString("payload");
        if (payload == null || payload.isEmpty()) {
            call.reject("payload required");
            return;
        }
        try {
            new JSONObject(payload); // sanity: reject anything that isn't JSON
        } catch (Exception e) {
            call.reject("payload must be valid JSON");
            return;
        }
        Context ctx = getContext();
        WidgetState.store(ctx, payload);
        WidgetRender.pushAll(ctx);
        call.resolve();
    }

    @PluginMethod
    public void requestPin(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            ret.put("ok", false);
            ret.put("supported", false);
            call.resolve(ret);
            return;
        }
        String kind = call.getString("widget");
        Class<?> provider = WidgetRender.providerFor(kind);
        if (provider == null) {
            call.reject("unknown widget kind: " + kind);
            return;
        }
        Context ctx = getContext();
        AppWidgetManager awm = (AppWidgetManager) ctx.getSystemService(Context.APPWIDGET_SERVICE);
        if (awm == null || !awm.isRequestPinAppWidgetSupported()) {
            ret.put("ok", false);
            ret.put("supported", false);
            call.resolve(ret);
            return;
        }
        // pre-render so the launcher's pin preview shows live data
        WidgetRender.push(ctx, provider);
        boolean ok;
        try {
            ok = awm.requestPinAppWidget(new ComponentName(ctx, provider), null, null);
        } catch (Exception e) {
            ok = false;
        }
        ret.put("ok", ok);
        ret.put("supported", true);
        call.resolve(ret);
    }

    /**
     * Ids of every placed instance of a widget kind — the settings section
     * lists the placed «عنصر مثبّت» widgets so each can be re-configured,
     * and the pin picker labels which instance it is editing.
     */
    @PluginMethod
    public void getWidgetIds(PluginCall call) {
        String kind = call.getString("widget");
        Class<?> provider = WidgetRender.providerFor(kind);
        if (provider == null) {
            call.reject("unknown widget kind: " + kind);
            return;
        }
        JSObject ret = new JSObject();
        JSArray ids = new JSArray();
        try {
            AppWidgetManager awm = AppWidgetManager.getInstance(getContext());
            int[] placed = awm == null ? null
                    : awm.getAppWidgetIds(new ComponentName(getContext(), provider));
            if (placed != null) for (int id : placed) ids.put(id);
        } catch (Exception ignored) {
            // list stays empty — never fail the call over a launcher quirk
        }
        ret.put("ids", ids);
        call.resolve(ret);
    }

    /**
     * Cold-start deep link: a widget tap that BOOTED the app carries its
     * astnum:// URI on the activity's launch intent. The JS side calls this
     * once on app mount (mirrors @capacitor/app's getLaunchUrl).
     */
    @PluginMethod
    public void getLaunchUrl(PluginCall call) {
        JSObject ret = new JSObject();
        String url = null;
        try {
            Intent intent = getActivity() != null ? getActivity().getIntent() : null;
            if (intent != null && intent.getData() != null) {
                url = intent.getData().toString();
            }
        } catch (Exception ignored) {
        }
        ret.put("url", url);
        call.resolve(ret);
    }

    /**
     * Warm-start deep links: MainActivity is singleTask, so a widget tap
     * while the app is alive routes through onNewIntent → this hook → the
     * JS "deepLink" listener (registered via the built-in addListener —
     * see bridge.ts; Capacitor's Plugin base class ships addListener).
     */
    @Override
    public void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        try {
            Uri data = intent != null ? intent.getData() : null;
            if (data != null) {
                JSObject ret = new JSObject();
                ret.put("url", data.toString());
                notifyListeners("deepLink", ret);
            }
        } catch (Exception ignored) {
        }
    }

    /**
     * The quick-add queue as a JSON array string. The JS boot path reads it,
     * commits every entry through the app's own routes (ledger-deduped),
     * acks the committed ids and pushes a fresh snapshot.
     */
    @PluginMethod
    public void consumeCaptures(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("entries", QuickAddStore.peek(getContext()));
        call.resolve(ret);
    }

    /**
     * Confirm entries as committed (created earlier or ledger-skipped) —
     * removes them from the queue. Idempotent; failures keep the entries
     * for the next pass.
     */
    @PluginMethod
    public void captureAck(PluginCall call) {
        try {
            JSArray ids = call.getArray("ids");
            if (ids != null) {
                java.util.List<String> list = new java.util.ArrayList<>(ids.length());
                for (int i = 0; i < ids.length(); i++) {
                    Object v = ids.opt(i);
                    if (v != null && !String.valueOf(v).isEmpty()) list.add(String.valueOf(v));
                }
                QuickAddStore.remove(getContext(), list);
            }
        } catch (Exception ignored) {
            // a failed ack just delays the removal — harmless
        }
        call.resolve();
    }
}
