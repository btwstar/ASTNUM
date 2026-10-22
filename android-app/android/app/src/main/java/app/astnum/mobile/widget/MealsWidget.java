package app.astnum.mobile.widget;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import app.astnum.mobile.R;

/**
 * «وجبات اليوم» (4×2) — the four meals in a list: glyph + name + kcal on
 * one line, protein detail + a share-of-consumed bar under it, and the
 * day total in the footer. Rows open the nutrition screen.
 */
public class MealsWidget extends BaseAstnumWidget {

    private static final String[] KEYS = {"breakfast", "lunch", "dinner", "snack"};
    private static final int[] ICONS = {
            R.drawable.widget_ic_sun, R.drawable.widget_ic_utensils,
            R.drawable.widget_ic_moon, R.drawable.widget_ic_cookie,
    };
    private static final int[] ROWS = {
            R.id.meal_row_1, R.id.meal_row_2, R.id.meal_row_3, R.id.meal_row_4,
    };
    private static final int[] ICON_VIEWS = {
            R.id.meal_icon_1, R.id.meal_icon_2, R.id.meal_icon_3, R.id.meal_icon_4,
    };
    private static final int[] NAME_VIEWS = {
            R.id.meal_name_1, R.id.meal_name_2, R.id.meal_name_3, R.id.meal_name_4,
    };
    private static final int[] KCAL_VIEWS = {
            R.id.meal_kcal_1, R.id.meal_kcal_2, R.id.meal_kcal_3, R.id.meal_kcal_4,
    };
    private static final int[] DETAIL_VIEWS = {
            R.id.meal_detail_1, R.id.meal_detail_2, R.id.meal_detail_3, R.id.meal_detail_4,
    };
    private static final int[] BAR_VIEWS = {
            R.id.meal_bar_1, R.id.meal_bar_2, R.id.meal_bar_3, R.id.meal_bar_4,
    };
    private static final int[] DETAIL_SLOT_VIEWS = {
            R.id.meal_detail_slot_1, R.id.meal_detail_slot_2,
            R.id.meal_detail_slot_3, R.id.meal_detail_slot_4,
    };

    @Override
    RemoteViews build(Context ctx, org.json.JSONObject state) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_meals);

        boolean empty = WidgetState.bool(state, "empty", true);
        boolean en = state != null && "en".equals(WidgetState.str(state, "lang", "ar"));
        JSONObject t = WidgetState.obj(state, "t");
        String title = WidgetState.str(t, "mealsTitle", "Today's meals");
        String openHint = WidgetState.str(t, "openApp", "Open ASTNUM");

        WidgetRender.text(views, R.id.meal_title, title);
        WidgetRender.text(views, R.id.meal_updated, WidgetState.str(state, "updatedAt", ""));

        JSONObject meals = WidgetState.obj(state, "meals");
        JSONArray items = WidgetState.arr(meals, "items");

        // empty → placeholder line, rows hidden
        WidgetRender.visible(views, R.id.meal_empty, empty || items == null || items.length() == 0);
        WidgetRender.text(views, R.id.meal_empty,
                empty ? openHint : WidgetState.str(meals, "emptyHint", openHint));
        if (items == null) {
            WidgetRender.click(views, R.id.widget_root, ctx, 31, "astnum://open?tab=body&sub=food");
            return views;
        }

        for (int i = 0; i < 4; i++) {
            JSONObject m = WidgetState.at(items, i);
            boolean has = m != null;
            WidgetRender.visible(views, ROWS[i], has);
            if (!has) continue;
            boolean logged = WidgetState.num(m, "kcal", 0) > 0;

            WidgetRender.tint(views, ICON_VIEWS[i],
                    logged ? WidgetRender.accentCyan(ctx) : WidgetRender.textDim(ctx));
            WidgetRender.text(views, NAME_VIEWS[i], WidgetState.str(m, "name", ""));
            WidgetRender.text(views, KCAL_VIEWS[i], WidgetState.str(m, "kcalLabel", ""));
            String detail = WidgetState.str(m, "detailLabel", "");
            WidgetRender.text(views, DETAIL_VIEWS[i], detail);
            WidgetRender.visible(views, DETAIL_SLOT_VIEWS[i], !detail.isEmpty());
            int pct = WidgetState.num(m, "pct", 0);
            WidgetRender.bar(views, BAR_VIEWS[i], pct, 100);
        }

        // footer: consumed / goal
        String total = WidgetState.str(meals, "totalLabel", "");
        WidgetRender.text(views, R.id.meal_total, total);
        JSONObject bar = WidgetState.obj(meals, "bar");
        WidgetRender.bar(views, R.id.meal_total_bar,
                WidgetState.barDone(bar), WidgetState.barTotal(bar));
        WidgetRender.visible(views, R.id.meal_footer, !total.isEmpty());

        WidgetRender.click(views, R.id.widget_root, ctx, 31, "astnum://open?tab=body&sub=food");
        return views;
    }
}
