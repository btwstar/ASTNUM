package app.astnum.mobile.widget;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import app.astnum.mobile.R;

/**
 * «مهام اليوم» (2×2 list) — up to 5 of today's pending tasks with a live
 * check state; overdue rows carry the danger tint. Tapping a row opens the
 * tasks screen (toggling from the widget is a habit-widget privilege).
 */
public class TasksWidget extends BaseAstnumWidget {

    private static final int ROWS = 5;
    private static final int[] ROW_IDS = {
            R.id.task_row_1, R.id.task_row_2, R.id.task_row_3, R.id.task_row_4, R.id.task_row_5,
    };
    private static final int[] CHECK_IDS = {
            R.id.task_check_1, R.id.task_check_2, R.id.task_check_3, R.id.task_check_4, R.id.task_check_5,
    };
    private static final int[] TITLE_IDS = {
            R.id.task_title_1, R.id.task_title_2, R.id.task_title_3, R.id.task_title_4, R.id.task_title_5,
    };

    @Override
    RemoteViews build(Context ctx, JSONObject state) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_tasks);

        boolean empty = WidgetState.bool(state, "empty", true);
        boolean en = state != null && "en".equals(WidgetState.str(state, "lang", "ar"));
        JSONObject t = WidgetState.obj(state, "t");
        String title = WidgetState.str(t, "tasksTitle", "Today's tasks");
        String openHint = WidgetState.str(t, "openApp", "Open ASTNUM");

        WidgetRender.text(views, R.id.task_header, title);
        WidgetRender.text(views, R.id.task_updated, WidgetState.str(state, "updatedAt", ""));

        JSONObject tasks = WidgetState.obj(state, "tasks");
        JSONArray items = WidgetState.arr(tasks, "items");
        int count = items == null ? 0 : Math.min(items.length(), ROWS);

        // empty → hint + open, rows hidden
        if (empty || count == 0) {
            String hint = WidgetState.str(tasks, "emptyHint",
                    WidgetState.str(t, "tasksEmpty", "No tasks today — enjoy"));
            WidgetRender.text(views, R.id.task_count, "");
            WidgetRender.text(views, R.id.task_empty, empty ? openHint : hint);
            WidgetRender.visible(views, R.id.task_empty, true);
            for (int row : ROW_IDS) WidgetRender.visible(views, row, false);
            WidgetRender.click(views, R.id.widget_root, ctx, 41, "astnum://open?tab=notes&sub=tasks");
            return views;
        }
        WidgetRender.visible(views, R.id.task_empty, false);
        WidgetRender.text(views, R.id.task_count, WidgetState.str(tasks, "label", ""));

        for (int i = 0; i < ROWS; i++) {
            int row = ROW_IDS[i];
            if (i >= count) {
                WidgetRender.visible(views, row, false);
                continue;
            }
            WidgetRender.visible(views, row, true);
            JSONObject item = WidgetState.at(items, i);
            boolean done = WidgetState.bool(item, "done", false);
            boolean overdue = WidgetState.bool(item, "overdue", false);

            WidgetRender.text(views, TITLE_IDS[i], WidgetState.str(item, "title", ""));
            WidgetRender.tint(views, CHECK_IDS[i],
                    done ? WidgetRender.doneMint(ctx)
                            : overdue ? WidgetRender.danger(ctx) : WidgetRender.checkMuted(ctx));
        }

        WidgetRender.click(views, R.id.widget_root, ctx, 41, "astnum://open?tab=notes&sub=tasks");
        return views;
    }
}
