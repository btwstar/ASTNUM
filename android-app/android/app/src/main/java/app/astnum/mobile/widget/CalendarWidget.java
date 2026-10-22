package app.astnum.mobile.widget;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import app.astnum.mobile.R;

/**
 * «التقويم» (4×3, v2.3) — the current month exactly like the stock Android
 * calendar: a 6×7 Sunday-first grid, TODAY on a filled accent circle, and
 * up to three day-mark dots per day:
 *
 *   • session dot (accent) — a workout template is assigned to that weekday
 *   • task dot (rose) — a dated pending task is due that day
 *   • habit dot (lime) — at least one habit was completed that day
 *
 * Every in-month day deep-links astnum://open?tab=today&cal=YYYY-MM-DD which
 * opens the app's calendar sheet focused on that day (its tasks, sessions
 * and habit completions + «add a task for this day»). All labels arrive
 * pre-formatted in the app's language via the snapshot's calendar section —
 * month name, weekday headers and day numbers use the app's own locale
 * digits. RemoteViews discipline: every runtime call is an annotated setter.
 */
public class CalendarWidget extends BaseAstnumWidget {

    private static int dayId(int i) {
        switch (i) {
            case 1: return R.id.cal_day_1;
            case 2: return R.id.cal_day_2;
            case 3: return R.id.cal_day_3;
            case 4: return R.id.cal_day_4;
            case 5: return R.id.cal_day_5;
            case 6: return R.id.cal_day_6;
            case 7: return R.id.cal_day_7;
            case 8: return R.id.cal_day_8;
            case 9: return R.id.cal_day_9;
            case 10: return R.id.cal_day_10;
            case 11: return R.id.cal_day_11;
            case 12: return R.id.cal_day_12;
            case 13: return R.id.cal_day_13;
            case 14: return R.id.cal_day_14;
            case 15: return R.id.cal_day_15;
            case 16: return R.id.cal_day_16;
            case 17: return R.id.cal_day_17;
            case 18: return R.id.cal_day_18;
            case 19: return R.id.cal_day_19;
            case 20: return R.id.cal_day_20;
            case 21: return R.id.cal_day_21;
            case 22: return R.id.cal_day_22;
            case 23: return R.id.cal_day_23;
            case 24: return R.id.cal_day_24;
            case 25: return R.id.cal_day_25;
            case 26: return R.id.cal_day_26;
            case 27: return R.id.cal_day_27;
            case 28: return R.id.cal_day_28;
            case 29: return R.id.cal_day_29;
            case 30: return R.id.cal_day_30;
            case 31: return R.id.cal_day_31;
            case 32: return R.id.cal_day_32;
            case 33: return R.id.cal_day_33;
            case 34: return R.id.cal_day_34;
            case 35: return R.id.cal_day_35;
            case 36: return R.id.cal_day_36;
            case 37: return R.id.cal_day_37;
            case 38: return R.id.cal_day_38;
            case 39: return R.id.cal_day_39;
            case 40: return R.id.cal_day_40;
            case 41: return R.id.cal_day_41;
            case 42: return R.id.cal_day_42;
            default: return 0;
        }
    }

    private static int todayId(int i) {
        switch (i) {
            case 1: return R.id.cal_today_1;
            case 2: return R.id.cal_today_2;
            case 3: return R.id.cal_today_3;
            case 4: return R.id.cal_today_4;
            case 5: return R.id.cal_today_5;
            case 6: return R.id.cal_today_6;
            case 7: return R.id.cal_today_7;
            case 8: return R.id.cal_today_8;
            case 9: return R.id.cal_today_9;
            case 10: return R.id.cal_today_10;
            case 11: return R.id.cal_today_11;
            case 12: return R.id.cal_today_12;
            case 13: return R.id.cal_today_13;
            case 14: return R.id.cal_today_14;
            case 15: return R.id.cal_today_15;
            case 16: return R.id.cal_today_16;
            case 17: return R.id.cal_today_17;
            case 18: return R.id.cal_today_18;
            case 19: return R.id.cal_today_19;
            case 20: return R.id.cal_today_20;
            case 21: return R.id.cal_today_21;
            case 22: return R.id.cal_today_22;
            case 23: return R.id.cal_today_23;
            case 24: return R.id.cal_today_24;
            case 25: return R.id.cal_today_25;
            case 26: return R.id.cal_today_26;
            case 27: return R.id.cal_today_27;
            case 28: return R.id.cal_today_28;
            case 29: return R.id.cal_today_29;
            case 30: return R.id.cal_today_30;
            case 31: return R.id.cal_today_31;
            case 32: return R.id.cal_today_32;
            case 33: return R.id.cal_today_33;
            case 34: return R.id.cal_today_34;
            case 35: return R.id.cal_today_35;
            case 36: return R.id.cal_today_36;
            case 37: return R.id.cal_today_37;
            case 38: return R.id.cal_today_38;
            case 39: return R.id.cal_today_39;
            case 40: return R.id.cal_today_40;
            case 41: return R.id.cal_today_41;
            case 42: return R.id.cal_today_42;
            default: return 0;
        }
    }

    private static int cellId(int i) {
        switch (i) {
            case 1: return R.id.cal_cell_1;
            case 2: return R.id.cal_cell_2;
            case 3: return R.id.cal_cell_3;
            case 4: return R.id.cal_cell_4;
            case 5: return R.id.cal_cell_5;
            case 6: return R.id.cal_cell_6;
            case 7: return R.id.cal_cell_7;
            case 8: return R.id.cal_cell_8;
            case 9: return R.id.cal_cell_9;
            case 10: return R.id.cal_cell_10;
            case 11: return R.id.cal_cell_11;
            case 12: return R.id.cal_cell_12;
            case 13: return R.id.cal_cell_13;
            case 14: return R.id.cal_cell_14;
            case 15: return R.id.cal_cell_15;
            case 16: return R.id.cal_cell_16;
            case 17: return R.id.cal_cell_17;
            case 18: return R.id.cal_cell_18;
            case 19: return R.id.cal_cell_19;
            case 20: return R.id.cal_cell_20;
            case 21: return R.id.cal_cell_21;
            case 22: return R.id.cal_cell_22;
            case 23: return R.id.cal_cell_23;
            case 24: return R.id.cal_cell_24;
            case 25: return R.id.cal_cell_25;
            case 26: return R.id.cal_cell_26;
            case 27: return R.id.cal_cell_27;
            case 28: return R.id.cal_cell_28;
            case 29: return R.id.cal_cell_29;
            case 30: return R.id.cal_cell_30;
            case 31: return R.id.cal_cell_31;
            case 32: return R.id.cal_cell_32;
            case 33: return R.id.cal_cell_33;
            case 34: return R.id.cal_cell_34;
            case 35: return R.id.cal_cell_35;
            case 36: return R.id.cal_cell_36;
            case 37: return R.id.cal_cell_37;
            case 38: return R.id.cal_cell_38;
            case 39: return R.id.cal_cell_39;
            case 40: return R.id.cal_cell_40;
            case 41: return R.id.cal_cell_41;
            case 42: return R.id.cal_cell_42;
            default: return 0;
        }
    }

    private static int dotSId(int i) {
        switch (i) {
            case 1: return R.id.cal_dot_s_1;
            case 2: return R.id.cal_dot_s_2;
            case 3: return R.id.cal_dot_s_3;
            case 4: return R.id.cal_dot_s_4;
            case 5: return R.id.cal_dot_s_5;
            case 6: return R.id.cal_dot_s_6;
            case 7: return R.id.cal_dot_s_7;
            case 8: return R.id.cal_dot_s_8;
            case 9: return R.id.cal_dot_s_9;
            case 10: return R.id.cal_dot_s_10;
            case 11: return R.id.cal_dot_s_11;
            case 12: return R.id.cal_dot_s_12;
            case 13: return R.id.cal_dot_s_13;
            case 14: return R.id.cal_dot_s_14;
            case 15: return R.id.cal_dot_s_15;
            case 16: return R.id.cal_dot_s_16;
            case 17: return R.id.cal_dot_s_17;
            case 18: return R.id.cal_dot_s_18;
            case 19: return R.id.cal_dot_s_19;
            case 20: return R.id.cal_dot_s_20;
            case 21: return R.id.cal_dot_s_21;
            case 22: return R.id.cal_dot_s_22;
            case 23: return R.id.cal_dot_s_23;
            case 24: return R.id.cal_dot_s_24;
            case 25: return R.id.cal_dot_s_25;
            case 26: return R.id.cal_dot_s_26;
            case 27: return R.id.cal_dot_s_27;
            case 28: return R.id.cal_dot_s_28;
            case 29: return R.id.cal_dot_s_29;
            case 30: return R.id.cal_dot_s_30;
            case 31: return R.id.cal_dot_s_31;
            case 32: return R.id.cal_dot_s_32;
            case 33: return R.id.cal_dot_s_33;
            case 34: return R.id.cal_dot_s_34;
            case 35: return R.id.cal_dot_s_35;
            case 36: return R.id.cal_dot_s_36;
            case 37: return R.id.cal_dot_s_37;
            case 38: return R.id.cal_dot_s_38;
            case 39: return R.id.cal_dot_s_39;
            case 40: return R.id.cal_dot_s_40;
            case 41: return R.id.cal_dot_s_41;
            case 42: return R.id.cal_dot_s_42;
            default: return 0;
        }
    }

    private static int dotTId(int i) {
        switch (i) {
            case 1: return R.id.cal_dot_t_1;
            case 2: return R.id.cal_dot_t_2;
            case 3: return R.id.cal_dot_t_3;
            case 4: return R.id.cal_dot_t_4;
            case 5: return R.id.cal_dot_t_5;
            case 6: return R.id.cal_dot_t_6;
            case 7: return R.id.cal_dot_t_7;
            case 8: return R.id.cal_dot_t_8;
            case 9: return R.id.cal_dot_t_9;
            case 10: return R.id.cal_dot_t_10;
            case 11: return R.id.cal_dot_t_11;
            case 12: return R.id.cal_dot_t_12;
            case 13: return R.id.cal_dot_t_13;
            case 14: return R.id.cal_dot_t_14;
            case 15: return R.id.cal_dot_t_15;
            case 16: return R.id.cal_dot_t_16;
            case 17: return R.id.cal_dot_t_17;
            case 18: return R.id.cal_dot_t_18;
            case 19: return R.id.cal_dot_t_19;
            case 20: return R.id.cal_dot_t_20;
            case 21: return R.id.cal_dot_t_21;
            case 22: return R.id.cal_dot_t_22;
            case 23: return R.id.cal_dot_t_23;
            case 24: return R.id.cal_dot_t_24;
            case 25: return R.id.cal_dot_t_25;
            case 26: return R.id.cal_dot_t_26;
            case 27: return R.id.cal_dot_t_27;
            case 28: return R.id.cal_dot_t_28;
            case 29: return R.id.cal_dot_t_29;
            case 30: return R.id.cal_dot_t_30;
            case 31: return R.id.cal_dot_t_31;
            case 32: return R.id.cal_dot_t_32;
            case 33: return R.id.cal_dot_t_33;
            case 34: return R.id.cal_dot_t_34;
            case 35: return R.id.cal_dot_t_35;
            case 36: return R.id.cal_dot_t_36;
            case 37: return R.id.cal_dot_t_37;
            case 38: return R.id.cal_dot_t_38;
            case 39: return R.id.cal_dot_t_39;
            case 40: return R.id.cal_dot_t_40;
            case 41: return R.id.cal_dot_t_41;
            case 42: return R.id.cal_dot_t_42;
            default: return 0;
        }
    }

    private static int dotHId(int i) {
        switch (i) {
            case 1: return R.id.cal_dot_h_1;
            case 2: return R.id.cal_dot_h_2;
            case 3: return R.id.cal_dot_h_3;
            case 4: return R.id.cal_dot_h_4;
            case 5: return R.id.cal_dot_h_5;
            case 6: return R.id.cal_dot_h_6;
            case 7: return R.id.cal_dot_h_7;
            case 8: return R.id.cal_dot_h_8;
            case 9: return R.id.cal_dot_h_9;
            case 10: return R.id.cal_dot_h_10;
            case 11: return R.id.cal_dot_h_11;
            case 12: return R.id.cal_dot_h_12;
            case 13: return R.id.cal_dot_h_13;
            case 14: return R.id.cal_dot_h_14;
            case 15: return R.id.cal_dot_h_15;
            case 16: return R.id.cal_dot_h_16;
            case 17: return R.id.cal_dot_h_17;
            case 18: return R.id.cal_dot_h_18;
            case 19: return R.id.cal_dot_h_19;
            case 20: return R.id.cal_dot_h_20;
            case 21: return R.id.cal_dot_h_21;
            case 22: return R.id.cal_dot_h_22;
            case 23: return R.id.cal_dot_h_23;
            case 24: return R.id.cal_dot_h_24;
            case 25: return R.id.cal_dot_h_25;
            case 26: return R.id.cal_dot_h_26;
            case 27: return R.id.cal_dot_h_27;
            case 28: return R.id.cal_dot_h_28;
            case 29: return R.id.cal_dot_h_29;
            case 30: return R.id.cal_dot_h_30;
            case 31: return R.id.cal_dot_h_31;
            case 32: return R.id.cal_dot_h_32;
            case 33: return R.id.cal_dot_h_33;
            case 34: return R.id.cal_dot_h_34;
            case 35: return R.id.cal_dot_h_35;
            case 36: return R.id.cal_dot_h_36;
            case 37: return R.id.cal_dot_h_37;
            case 38: return R.id.cal_dot_h_38;
            case 39: return R.id.cal_dot_h_39;
            case 40: return R.id.cal_dot_h_40;
            case 41: return R.id.cal_dot_h_41;
            case 42: return R.id.cal_dot_h_42;
            default: return 0;
        }
    }

    @Override
    RemoteViews build(Context ctx, JSONObject state) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_calendar);

        JSONObject cal = WidgetState.obj(state, "calendar");
        String todayUri = WidgetState.str(cal, "todayUri", "astnum://open?tab=today");

        // header — the month name in the app's language
        WidgetRender.text(views, R.id.cal_month, WidgetState.str(cal, "monthLabel", ""));
        WidgetRender.click(views, R.id.cal_header, ctx, 302, todayUri);
        WidgetRender.click(views, R.id.widget_root, ctx, 302, todayUri);

        // weekday headers (Sunday-first, app language)
        JSONArray dow = WidgetState.arr(cal, "dow");
        int[] dowIds = {R.id.cal_dow_0, R.id.cal_dow_1, R.id.cal_dow_2, R.id.cal_dow_3,
                R.id.cal_dow_4, R.id.cal_dow_5, R.id.cal_dow_6};
        for (int d = 0; d < 7; d++) {
            String label = "";
            try {
                if (dow != null && d < dow.length()) label = dow.optString(d, "");
            } catch (Exception ignored) {
            }
            WidgetRender.text(views, dowIds[d], label);
        }

        // the 42 grid cells
        JSONArray cells = WidgetState.arr(cal, "cells");
        int cyan = WidgetRender.accentCyan(ctx);
        int rose = WidgetRender.rose(ctx);
        int lime = WidgetRender.accentLime(ctx);

        for (int i = 1; i <= 42; i++) {
            JSONObject cell = WidgetState.at(cells, i - 1);
            boolean inMonth = cell != null && WidgetState.bool(cell, "inMonth", false);
            boolean isToday = inMonth && WidgetState.bool(cell, "isToday", false);
            String dayLabel = inMonth ? WidgetState.str(cell, "dayLabel", "") : "";

            // day number: plain text, or the filled accent circle when today
            WidgetRender.text(views, dayId(i), dayLabel);
            WidgetRender.text(views, todayId(i), dayLabel);
            WidgetRender.visible(views, dayId(i), inMonth && !isToday);
            WidgetRender.visible(views, todayId(i), isToday);

            // day marks (hidden for out-of-month cells)
            boolean hasS = inMonth && WidgetState.bool(cell, "hasSession", false);
            boolean hasT = inMonth && WidgetState.bool(cell, "hasTask", false);
            boolean hasH = inMonth && WidgetState.bool(cell, "hasHabit", false);
            WidgetRender.visible(views, dotSId(i), hasS);
            WidgetRender.visible(views, dotTId(i), hasT);
            WidgetRender.visible(views, dotHId(i), hasH);
            WidgetRender.tint(views, dotSId(i), cyan);
            WidgetRender.tint(views, dotTId(i), rose);
            WidgetRender.tint(views, dotHId(i), lime);

            // day tap → the app's calendar sheet focused on that day
            String uri = inMonth ? WidgetState.str(cell, "openUri", "") : "";
            if (!uri.isEmpty()) {
                WidgetRender.click(views, cellId(i), ctx, 300 + i, uri);
            }
        }
        return views;
    }
}
