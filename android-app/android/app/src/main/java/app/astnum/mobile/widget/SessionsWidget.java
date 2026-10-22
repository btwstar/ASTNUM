package app.astnum.mobile.widget;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import app.astnum.mobile.R;

/**
 * «جلسات التمرين» (2×2) — the user's own day-assigned plans: today's first
 * (highlighted day chip), then the next upcoming days. Each row starts its
 * template with one tap (astnum://open?tab=gym&start=<id>).
 */
public class SessionsWidget extends BaseAstnumWidget {

    private static final int ROWS = 4;
    private static final int[] ROW_IDS = {
            R.id.ses_row_1, R.id.ses_row_2, R.id.ses_row_3, R.id.ses_row_4,
    };
    private static final int[] DAY_IDS = {
            R.id.ses_day_1, R.id.ses_day_2, R.id.ses_day_3, R.id.ses_day_4,
    };
    private static final int[] NAME_IDS = {
            R.id.ses_name_1, R.id.ses_name_2, R.id.ses_name_3, R.id.ses_name_4,
    };
    private static final int[] DETAIL_IDS = {
            R.id.ses_detail_1, R.id.ses_detail_2, R.id.ses_detail_3, R.id.ses_detail_4,
    };

    @Override
    RemoteViews build(Context ctx, JSONObject state) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_sessions);

        boolean empty = WidgetState.bool(state, "empty", true);
        boolean en = state != null && "en".equals(WidgetState.str(state, "lang", "ar"));
        JSONObject t = WidgetState.obj(state, "t");
        String title = WidgetState.str(t, "sessionsTitle", "Workout sessions");
        String openHint = WidgetState.str(t, "openApp", "Open ASTNUM");

        WidgetRender.text(views, R.id.ses_title, title);

        JSONObject sessions = WidgetState.obj(state, "sessions");
        JSONArray items = WidgetState.arr(sessions, "items");
        int count = items == null ? 0 : Math.min(items.length(), ROWS);

        if (empty || count == 0) {
            String hint = WidgetState.str(sessions, "emptyHint",
                    WidgetState.str(t, "sessionsEmpty", "No plans yet — build one in the gym"));
            WidgetRender.text(views, R.id.ses_empty, empty ? openHint : hint);
            WidgetRender.visible(views, R.id.ses_empty, true);
            for (int row : ROW_IDS) WidgetRender.visible(views, row, false);
            WidgetRender.click(views, R.id.widget_root, ctx, 52, "astnum://open?tab=gym");
            return views;
        }
        WidgetRender.visible(views, R.id.ses_empty, false);

        for (int i = 0; i < ROWS; i++) {
            int row = ROW_IDS[i];
            if (i >= count) {
                WidgetRender.visible(views, row, false);
                continue;
            }
            WidgetRender.visible(views, row, true);
            JSONObject item = WidgetState.at(items, i);
            boolean today = WidgetState.bool(item, "isToday", false);
            String templateId = WidgetState.str(item, "templateId", "");

            WidgetRender.text(views, DAY_IDS[i], WidgetState.str(item, "dayLabel", ""));
            // today rows get the brand-cyan highlight (theme-aware accent)
            WidgetRender.color(views, DAY_IDS[i],
                    today ? WidgetRender.accentCyan(ctx) : WidgetRender.textMuted(ctx));
            WidgetRender.text(views, NAME_IDS[i], WidgetState.str(item, "name", ""));
            WidgetRender.text(views, DETAIL_IDS[i], WidgetState.str(item, "detail", ""));

            WidgetRender.click(views, row, ctx, 53 + i,
                    templateId.isEmpty()
                            ? "astnum://open?tab=gym"
                            : "astnum://open?tab=gym&start=" + templateId);
        }

        WidgetRender.click(views, R.id.widget_root, ctx, 52, "astnum://open?tab=gym");
        return views;
    }
}
