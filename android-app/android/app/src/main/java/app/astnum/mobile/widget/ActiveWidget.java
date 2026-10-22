package app.astnum.mobile.widget;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONObject;

import app.astnum.mobile.R;

/**
 * «الجلسة الجارية» (4×2) — the live session: a ticking Chronometer (native,
 * keeps counting even while the app is closed), the current exercise with
 * its sets progress, volume so far and what is next.
 *
 * The two quick-action buttons are the widget-side INPUT the Android
 * framework allows (no text entry exists in widgets):
 *   «سجّل مجموعة»      → broadcast ACTION_QUICK_LOG → if the app process is
 *                        alive the plugin forwards it to the WebView which
 *                        logs the set instantly (the app never comes up);
 *                        if the process is dead the tap launches the app
 *                        with quicklog and the action completes on boot.
 *   «التمرين التالي»   → same flow via the existing defer endpoint.
 */
public class ActiveWidget extends BaseAstnumWidget {

    static final String ACTION_QUICK_LOG = "app.astnum.mobile.action.QUICK_LOG";
    static final String ACTION_QUICK_NEXT = "app.astnum.mobile.action.QUICK_NEXT";
    static final String EXTRA_ACTION = "quick";
    static final String EXTRA_EXERCISE = "exerciseId";

    @Override
    public void onReceive(Context context, android.content.Intent intent) {
        super.onReceive(context, intent);
        try {
            if (intent == null) return;
            String action = intent.getAction();
            if (!ACTION_QUICK_LOG.equals(action) && !ACTION_QUICK_NEXT.equals(action)) return;
            int widgetId = intent.getIntExtra(
                    android.appwidget.AppWidgetManager.EXTRA_APPWIDGET_ID,
                    android.appwidget.AppWidgetManager.INVALID_APPWIDGET_ID);
            String quick = ACTION_QUICK_LOG.equals(action) ? "logSet" : "nextExercise";
            String exerciseId = intent.getStringExtra(EXTRA_EXERCISE);
            AstnumWidgetsPlugin.dispatchQuickAction(context, quick, exerciseId, widgetId);
        } catch (Exception ignored) {
        }
    }

    @Override
    RemoteViews build(Context ctx, JSONObject state) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_active);

        boolean empty = WidgetState.bool(state, "empty", true);
        boolean en = state != null && "en".equals(WidgetState.str(state, "lang", "ar"));
        JSONObject t = WidgetState.obj(state, "t");
        String title = WidgetState.str(t, "activeTitle", "Active session");
        String noneLabel = WidgetState.str(t, "activeNone", "No active session");
        String startHint = WidgetState.str(t, "activeStartHint", "Open the gym and start today's workout");
        String openHint = WidgetState.str(t, "openApp", "Open ASTNUM");
        String logSetLabel = WidgetState.str(t, "activeLogSet", "Log a set");
        String nextLabel = WidgetState.str(t, "activeNext", "Next exercise");

        WidgetRender.text(views, R.id.act_title, title);

        JSONObject workout = WidgetState.obj(state, "workout");
        boolean active = workout != null && WidgetState.bool(workout, "active", false);

        if (empty || !active) {
            WidgetRender.text(views, R.id.act_body, empty ? openHint : noneLabel);
            WidgetRender.text(views, R.id.act_hint, startHint);
            WidgetRender.visible(views, R.id.act_exercise_block, false);
            WidgetRender.visible(views, R.id.act_buttons, false);
            WidgetRender.visible(views, R.id.act_chrono, false);
            WidgetRender.visible(views, R.id.act_empty_block, true);
            WidgetRender.click(views, R.id.widget_root, ctx, 61, "astnum://open?tab=gym");
            return views;
        }
        WidgetRender.visible(views, R.id.act_empty_block, false);
        WidgetRender.visible(views, R.id.act_exercise_block, true);
        WidgetRender.visible(views, R.id.act_buttons, true);
        WidgetRender.visible(views, R.id.act_chrono, true);

        // live timer (native Chronometer — ticks even while the app is closed)
        long startedAt = WidgetState.longNum(workout, "startedAtMs", 0L);
        if (startedAt > 0) {
            WidgetRender.chronometer(views, R.id.act_chrono, startedAt);
        }

        WidgetRender.text(views, R.id.act_name, WidgetState.str(workout, "name", ""));

        JSONObject current = WidgetState.obj(workout, "currentExercise");
        String exName = WidgetState.str(current, "name",
                WidgetState.str(t, "activeAllDone", "All exercises done"));
        String setsLabel = WidgetState.str(current, "setsLabel", "");
        String next = WidgetState.str(workout, "nextLabel", "");

        WidgetRender.text(views, R.id.act_exercise, exName);
        WidgetRender.text(views, R.id.act_sets, setsLabel);
        WidgetRender.visible(views, R.id.act_sets, !setsLabel.isEmpty());
        WidgetRender.text(views, R.id.act_volume, WidgetState.str(workout, "volumeLabel", ""));
        WidgetRender.text(views, R.id.act_next, next);
        WidgetRender.visible(views, R.id.act_next, !next.isEmpty());

        // quick-action buttons → broadcast → plugin (process alive) / deep link (dead)
        String exerciseId = WidgetState.str(current, "id", "");
        try {
            views.setOnClickPendingIntent(R.id.act_log_set,
                    WidgetRender.broadcast(ctx, 62, ActiveWidget.class,
                            ACTION_QUICK_LOG, 0, EXTRA_EXERCISE, exerciseId));
            views.setOnClickPendingIntent(R.id.act_next_ex,
                    WidgetRender.broadcast(ctx, 63, ActiveWidget.class,
                            ACTION_QUICK_NEXT, 0, EXTRA_EXERCISE, exerciseId));
        } catch (Exception ignored) {
        }
        WidgetRender.text(views, R.id.act_log_set, logSetLabel);
        WidgetRender.text(views, R.id.act_next_ex, nextLabel);

        WidgetRender.click(views, R.id.widget_root, ctx, 61, "astnum://open?tab=gym");
        return views;
    }
}
