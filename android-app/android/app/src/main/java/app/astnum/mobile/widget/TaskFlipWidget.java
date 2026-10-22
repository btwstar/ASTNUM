package app.astnum.mobile.widget;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import app.astnum.mobile.R;

/**
 * «مهمة اليوم» (1×1 flip square) — shows ONE of today's pending tasks at a
 * time; tapping the card flips to the next one (a broadcast back into this
 * provider advances the per-widget index — instant, no app launch). The
 * counter pill + flip glyph show there is more to cycle through.
 */
public class TaskFlipWidget extends BaseAstnumWidget {

    static final String ACTION_FLIP = "app.astnum.mobile.action.FLIP_TASK";

    @Override
    String flipAction() {
        return ACTION_FLIP;
    }

    @Override
    boolean flipEnabled() {
        return true;
    }

    @Override
    public void onReceive(Context context, android.content.Intent intent) {
        super.onReceive(context, intent);
        try {
            if (intent == null || !ACTION_FLIP.equals(intent.getAction())) return;
            JSONObject state = WidgetState.load(context);
            JSONArray items = WidgetState.arr(WidgetState.obj(state, "tasks"), "items");
            int count = items == null ? 0 : items.length();
            int id = intent.getIntExtra(
                    android.appwidget.AppWidgetManager.EXTRA_APPWIDGET_ID,
                    android.appwidget.AppWidgetManager.INVALID_APPWIDGET_ID);
            if (id != android.appwidget.AppWidgetManager.INVALID_APPWIDGET_ID) {
                advanceFlip(context, id, Math.min(count, 6));
            }
        } catch (Exception ignored) {
        }
    }

    @Override
    RemoteViews build(Context ctx, JSONObject state, int appWidgetId) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_task_flip);

        boolean empty = WidgetState.bool(state, "empty", true);
        boolean en = state != null && "en".equals(WidgetState.str(state, "lang", "ar"));
        JSONObject t = WidgetState.obj(state, "t");
        String title = WidgetState.str(t, "taskFlipTitle", "Task of the day");
        String openHint = WidgetState.str(t, "openApp", "Open ASTNUM");

        WidgetRender.text(views, R.id.tflip_title, title);

        JSONObject tasks = WidgetState.obj(state, "tasks");
        JSONArray items = WidgetState.arr(tasks, "items");
        int count = items == null ? 0 : Math.min(items.length(), 6);

        if (empty || count == 0) {
            String hint = WidgetState.str(tasks, "emptyHint",
                    WidgetState.str(t, "tasksEmpty", "No tasks today — enjoy"));
            WidgetRender.text(views, R.id.tflip_body, empty ? openHint : hint);
            WidgetRender.text(views, R.id.tflip_counter, "");
            WidgetRender.visible(views, R.id.tflip_flip_icon, false);
            WidgetRender.visible(views, R.id.tflip_check, false);
            WidgetRender.visible(views, R.id.tflip_body, true);
            WidgetRender.click(views, R.id.widget_root, ctx, 42, "astnum://open?tab=notes&sub=tasks");
            return views;
        }

        int index = flipIndex(ctx, appWidgetId, count);
        JSONObject item = WidgetState.at(items, index);

        WidgetRender.text(views, R.id.tflip_body, WidgetState.str(item, "title", ""));
        WidgetRender.text(views, R.id.tflip_counter, WidgetState.str(item, "counterLabel", ""));
        WidgetRender.visible(views, R.id.tflip_flip_icon, count > 1);

        // state check: overdue rows use the danger tint, pending the muted ring
        boolean overdue = WidgetState.bool(item, "overdue", false);
        WidgetRender.tint(views, R.id.tflip_check,
                overdue ? WidgetRender.danger(ctx) : WidgetRender.checkMuted(ctx));

        // tap = flip to the next task (broadcast → instant re-render)
        try {
            android.app.PendingIntent pi = WidgetRender.broadcast(
                    ctx, 43, TaskFlipWidget.class, ACTION_FLIP, appWidgetId, null, null);
            views.setOnClickPendingIntent(R.id.widget_root, pi);
        } catch (Exception ignored) {
        }
        return views;
    }

    @Override
    RemoteViews build(Context ctx, JSONObject state) {
        return build(ctx, state, android.appwidget.AppWidgetManager.INVALID_APPWIDGET_ID);
    }
}
