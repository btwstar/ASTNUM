package app.astnum.mobile.widget;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import app.astnum.mobile.R;

/**
 * «عادة اليوم» (1×1 flip square) — shows ONE of today's scheduled habits
 * (with its streak pill + done state); tapping flips to the next one.
 * Logging stays on the habits list widget's one-tap rows (this square is
 * the quick-glance cycler).
 */
public class HabitFlipWidget extends BaseAstnumWidget {

    static final String ACTION_FLIP = "app.astnum.mobile.action.FLIP_HABIT";

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
            JSONArray items = WidgetState.arr(WidgetState.obj(state, "habits"), "items");
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
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_habit_flip);

        boolean empty = WidgetState.bool(state, "empty", true);
        boolean en = state != null && "en".equals(WidgetState.str(state, "lang", "ar"));
        JSONObject t = WidgetState.obj(state, "t");
        String title = WidgetState.str(t, "habitFlipTitle", "Habit of the day");
        String openHint = WidgetState.str(t, "openApp", "Open ASTNUM");

        WidgetRender.text(views, R.id.hflip_title, title);

        JSONObject habits = WidgetState.obj(state, "habits");
        JSONArray items = WidgetState.arr(habits, "items");
        int count = items == null ? 0 : Math.min(items.length(), 6);

        if (empty || count == 0) {
            String hint = WidgetState.str(habits, "emptyHint",
                    WidgetState.str(t, "habitsEmpty", "Add your first habit in the app"));
            WidgetRender.text(views, R.id.hflip_body, empty ? openHint : hint);
            WidgetRender.text(views, R.id.hflip_counter, "");
            WidgetRender.visible(views, R.id.hflip_flip_icon, false);
            WidgetRender.visible(views, R.id.hflip_streak, false);
            WidgetRender.visible(views, R.id.hflip_check, false);
            WidgetRender.visible(views, R.id.hflip_body, true);
            WidgetRender.click(views, R.id.widget_root, ctx, 45, "astnum://open?tab=habits");
            return views;
        }

        int index = flipIndex(ctx, appWidgetId, count);
        JSONObject item = WidgetState.at(items, index);
        boolean done = WidgetState.bool(item, "done", false);
        boolean hasStreak = WidgetState.bool(item, "hasStreak", false);

        WidgetRender.text(views, R.id.hflip_body, WidgetState.str(item, "name", ""));
        WidgetRender.text(views, R.id.hflip_counter, WidgetState.str(item, "counterLabel", ""));
        WidgetRender.visible(views, R.id.hflip_flip_icon, count > 1);
        WidgetRender.tint(views, R.id.hflip_check, done ? WidgetRender.doneMint(ctx) : WidgetRender.checkMuted(ctx));
        WidgetRender.text(views, R.id.hflip_streak, WidgetState.str(item, "streakLabel", ""));
        WidgetRender.visible(views, R.id.hflip_streak, hasStreak);
        WidgetRender.tint(views, R.id.hflip_streak, WidgetRender.streakAmber(ctx));

        // tap = flip to the next habit (broadcast → instant re-render)
        try {
            android.app.PendingIntent pi = WidgetRender.broadcast(
                    ctx, 46, HabitFlipWidget.class, ACTION_FLIP, appWidgetId, null, null);
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
