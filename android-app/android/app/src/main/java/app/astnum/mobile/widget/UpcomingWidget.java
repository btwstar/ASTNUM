package app.astnum.mobile.widget;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import app.astnum.mobile.R;

/**
 * «الأحداث القادمة» (2×2, v2.3) — the next ≤4 things ahead across the coming
 * week: scheduled workout sessions + dated pending tasks, sorted by day.
 *
 * Every row shows its kind glyph (session = accent dumbbell / task = rose
 * checklist), a when-chip («اليوم» / «غدًا» / weekday — accent-tinted for
 * today) and the item title; the row deep-links into its own home in the
 * app. All strings arrive pre-formatted in the app's language through the
 * snapshot's t + events sections — the native layer renders no literals.
 */
public class UpcomingWidget extends BaseAstnumWidget {

    private static final int ROWS = 4;

    @Override
    RemoteViews build(Context ctx, JSONObject state) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_upcoming);

        JSONObject t = WidgetState.obj(state, "t");
        JSONObject events = WidgetState.obj(state, "events");

        String title = WidgetState.str(events, "title",
                WidgetState.str(t, "eventsTitle", "Upcoming"));
        WidgetRender.text(views, R.id.ev_title, title);

        JSONArray items = WidgetState.arr(events, "items");
        int count = items == null ? 0 : Math.min(items.length(), ROWS);

        if (count == 0) {
            String hint = WidgetState.str(events, "emptyHint",
                    WidgetState.str(t, "eventsEmpty", ""));
            WidgetRender.text(views, R.id.ev_empty, hint);
            WidgetRender.visible(views, R.id.ev_empty, true);
            for (int i = 0; i < ROWS; i++) WidgetRender.visible(views, rowId(i), false);
            WidgetRender.click(views, R.id.widget_root, ctx, 90, "astnum://open?tab=today");
            return views;
        }
        WidgetRender.visible(views, R.id.ev_empty, false);

        int[] iconIds = {R.id.ev_icon_1, R.id.ev_icon_2, R.id.ev_icon_3, R.id.ev_icon_4};
        int[] whenIds = {R.id.ev_when_1, R.id.ev_when_2, R.id.ev_when_3, R.id.ev_when_4};
        int[] nameIds = {R.id.ev_name_1, R.id.ev_name_2, R.id.ev_name_3, R.id.ev_name_4};

        for (int i = 0; i < ROWS; i++) {
            int row = rowId(i);
            if (i >= count) {
                WidgetRender.visible(views, row, false);
                continue;
            }
            WidgetRender.visible(views, row, true);
            JSONObject item = WidgetState.at(items, i);

            boolean isTask = "task".equals(WidgetState.str(item, "kind", "session"));
            boolean today = WidgetState.bool(item, "isToday", false);

            // kind glyph: session = accent dumbbell / task = rose checklist
            try {
                views.setImageViewResource(iconIds[i],
                        isTask ? R.drawable.widget_ic_tasks : R.drawable.widget_ic_dumbbell);
            } catch (Exception ignored) {
            }
            WidgetRender.tint(views, iconIds[i],
                    isTask ? WidgetRender.rose(ctx) : WidgetRender.accentCyan(ctx));

            WidgetRender.text(views, whenIds[i], WidgetState.str(item, "whenLabel", ""));
            WidgetRender.color(views, whenIds[i], today
                    ? WidgetRender.accentCyan(ctx)
                    : WidgetRender.textMuted(ctx));

            WidgetRender.text(views, nameIds[i], WidgetState.str(item, "title", ""));

            // the row opens its own home in the app (session start / tasks list)
            WidgetRender.click(views, row, ctx, 91 + i,
                    WidgetState.str(item, "openUri", "astnum://open?tab=today"));
        }

        WidgetRender.click(views, R.id.ev_header, ctx, 90, "astnum://open?tab=today");
        WidgetRender.click(views, R.id.widget_root, ctx, 90, "astnum://open?tab=today");
        return views;
    }

    private static int rowId(int i) {
        switch (i) {
            case 0: return R.id.ev_row_1;
            case 1: return R.id.ev_row_2;
            case 2: return R.id.ev_row_3;
            default: return R.id.ev_row_4;
        }
    }
}
