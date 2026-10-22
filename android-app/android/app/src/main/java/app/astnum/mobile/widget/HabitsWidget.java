package app.astnum.mobile.widget;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import app.astnum.mobile.R;

/**
 * «عادات اليوم» (2×2 list) — up to four of today's scheduled habits with
 * done state, streak pills and ONE-TAP LOGGING from the home screen:
 * tapping a habit row deep-links into the app and toggles that habit
 * instantly (haptic + toast), then the new state flows back into every
 * widget. Replaces the v1.18 habits widget with the v1.19 design system.
 */
public class HabitsWidget extends BaseAstnumWidget {

    private static final int ROWS = 4;

    @Override
    RemoteViews build(Context ctx, JSONObject state) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_habits_list);

        boolean empty = WidgetState.bool(state, "empty", true);
        boolean en = state != null && "en".equals(WidgetState.str(state, "lang", "ar"));
        JSONObject t = WidgetState.obj(state, "t");
        String title = WidgetState.str(t, "habitsTitle", "Today's habits");
        String openHint = WidgetState.str(t, "openApp", "Open ASTNUM");

        WidgetRender.text(views, R.id.hab_title, title);

        if (empty) {
            WidgetRender.text(views, R.id.hab_count, "");
            WidgetRender.visible(views, R.id.hab_bar, false);
            WidgetRender.text(views, R.id.hab_empty, openHint);
            WidgetRender.visible(views, R.id.hab_empty, true);
            for (int i = 0; i < ROWS; i++) {
                WidgetRender.visible(views, rowId(i), false);
            }
            WidgetRender.click(views, R.id.widget_root, ctx, 44, "astnum://open?tab=habits");
            return views;
        }
        WidgetRender.visible(views, R.id.hab_empty, false);

        JSONObject habits = WidgetState.obj(state, "habits");
        WidgetRender.text(views, R.id.hab_count, WidgetState.str(habits, "label", ""));
        JSONObject bar = WidgetState.obj(habits, "bar");
        WidgetRender.bar(views, R.id.hab_bar, WidgetState.barDone(bar), WidgetState.barTotal(bar));

        JSONArray items = WidgetState.arr(habits, "items");
        int count = items == null ? 0 : Math.min(items.length(), ROWS);

        int[] nameIds = {R.id.hab_name_1, R.id.hab_name_2, R.id.hab_name_3, R.id.hab_name_4};
        int[] checkIds = {R.id.hab_check_1, R.id.hab_check_2, R.id.hab_check_3, R.id.hab_check_4};
        int[] streakIds = {R.id.hab_streak_1, R.id.hab_streak_2, R.id.hab_streak_3, R.id.hab_streak_4};

        for (int i = 0; i < ROWS; i++) {
            int row = rowId(i);
            if (i >= count) {
                WidgetRender.visible(views, row, false);
                continue;
            }
            WidgetRender.visible(views, row, true);
            JSONObject item = WidgetState.at(items, i);
            boolean done = WidgetState.bool(item, "done", false);
            boolean hasStreak = WidgetState.bool(item, "hasStreak", false);
            String id = WidgetState.str(item, "id", "");

            WidgetRender.text(views, nameIds[i], WidgetState.str(item, "name", ""));
            // check icon: mint when done, muted outline when not (theme-aware)
            WidgetRender.tint(views, checkIds[i], done ? WidgetRender.doneMint(ctx) : WidgetRender.checkMuted(ctx));
            WidgetRender.tint(views, streakIds[i], WidgetRender.streakAmber(ctx));
            WidgetRender.text(views, streakIds[i], WidgetState.str(item, "streakLabel", ""));
            WidgetRender.visible(views, streakIds[i], hasStreak);

            // one-tap logging: the row itself deep-links the toggle
            WidgetRender.click(views, row, ctx, 40 + i,
                    id.isEmpty() ? "astnum://open?tab=habits" : "astnum://open?tab=habits&toggle=" + id);
        }

        // header + root open the habits tab (not a toggle)
        WidgetRender.click(views, R.id.hab_header, ctx, 44, "astnum://open?tab=habits");
        WidgetRender.click(views, R.id.widget_root, ctx, 44, "astnum://open?tab=habits");
        return views;
    }

    private static int rowId(int i) {
        switch (i) {
            case 0: return R.id.hab_row_1;
            case 1: return R.id.hab_row_2;
            case 2: return R.id.hab_row_3;
            default: return R.id.hab_row_4;
        }
    }
}
