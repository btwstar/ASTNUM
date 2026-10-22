package app.astnum.mobile.widget;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import app.astnum.mobile.R;

/**
 * «نِسَب اليوم» (4×2) — every percentage in ONE list, two columns:
 * habits, calories, protein, carbs | fat, workout, tasks. Each row: label +
 * percentage + a thin gradient bar. The whole widget opens today's screen.
 */
public class PercentWidget extends BaseAstnumWidget {

    private static final int[] LABEL_IDS = {
            R.id.pct_label_1, R.id.pct_label_2, R.id.pct_label_3, R.id.pct_label_4,
            R.id.pct_label_5, R.id.pct_label_6, R.id.pct_label_7,
    };
    private static final int[] VALUE_IDS = {
            R.id.pct_value_1, R.id.pct_value_2, R.id.pct_value_3, R.id.pct_value_4,
            R.id.pct_value_5, R.id.pct_value_6, R.id.pct_value_7,
    };
    private static final int[] BAR_IDS = {
            R.id.pct_bar_1, R.id.pct_bar_2, R.id.pct_bar_3, R.id.pct_bar_4,
            R.id.pct_bar_5, R.id.pct_bar_6, R.id.pct_bar_7,
    };

    @Override
    RemoteViews build(Context ctx, JSONObject state) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_percent);

        boolean empty = WidgetState.bool(state, "empty", true);
        boolean en = state != null && "en".equals(WidgetState.str(state, "lang", "ar"));
        JSONObject t = WidgetState.obj(state, "t");
        String title = WidgetState.str(t, "percentTitle", "Today's ratios");
        String openHint = WidgetState.str(t, "openApp", "Open ASTNUM");

        WidgetRender.text(views, R.id.pct_title, title);
        WidgetRender.text(views, R.id.pct_updated, WidgetState.str(state, "updatedAt", ""));

        JSONObject percent = WidgetState.obj(state, "percent");
        JSONArray rows = WidgetState.arr(percent, "rows");

        if (empty || rows == null || rows.length() == 0) {
            WidgetRender.text(views, R.id.pct_empty, openHint);
            WidgetRender.visible(views, R.id.pct_empty, true);
            for (int v : LABEL_IDS) WidgetRender.visible(views, v, false);
            for (int v : VALUE_IDS) WidgetRender.visible(views, v, false);
            for (int v : BAR_IDS) WidgetRender.visible(views, v, false);
            WidgetRender.click(views, R.id.widget_root, ctx, 71, "astnum://open?tab=today");
            return views;
        }
        WidgetRender.visible(views, R.id.pct_empty, false);

        for (int i = 0; i < 7; i++) {
            JSONObject row = WidgetState.at(rows, i);
            boolean has = row != null && !WidgetState.str(row, "label", "").isEmpty();
            WidgetRender.visible(views, LABEL_IDS[i], has);
            WidgetRender.visible(views, VALUE_IDS[i], has);
            if (!has) {
                WidgetRender.visible(views, BAR_IDS[i], false);
                continue;
            }
            WidgetRender.text(views, LABEL_IDS[i], WidgetState.str(row, "label", ""));
            WidgetRender.text(views, VALUE_IDS[i], WidgetState.str(row, "pctLabel", ""));
            JSONObject bar = WidgetState.obj(row, "bar");
            WidgetRender.bar(views, BAR_IDS[i], WidgetState.barDone(bar), WidgetState.barTotal(bar));
        }

        WidgetRender.click(views, R.id.widget_root, ctx, 71, "astnum://open?tab=today");
        return views;
    }
}
