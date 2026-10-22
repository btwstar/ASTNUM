package app.astnum.mobile.widget;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import app.astnum.mobile.R;

/**
 * «عنصر مثبّت» (2×2) — ONE item (habit / workout session / note) shown
 * permanently, chosen by the user PER WIDGET INSTANCE:
 *
 *   • unconfigured → the tap-to-choose placeholder; the tap deep-links
 *     astnum://open?tab=today&pickpin=&lt;id&gt; and the app opens its picker
 *     sheet already scoped to this widget id;
 *   • configured   → title + preview lines + a one-tap action (habit:
 *     log now — the same instant toggle as the habits list rows; session:
 *     start it; note: none). The header sliders glyph re-opens the picker,
 *     the card body opens the item inside the app.
 *
 * Configs live in the app's settings DB (key widget_pins: {widgetId:
 * {type,id}}) and flow into the snapshot's pins.items[] — the native layer
 * only mirrors the strings and picks the row matching ITS OWN widget id
 * (perIdEnabled → every instance renders its own RemoteViews).
 */
public class PinWidget extends BaseAstnumWidget {

    @Override
    boolean perIdEnabled() {
        return true;
    }

    @Override
    RemoteViews build(Context ctx, JSONObject state, int appWidgetId) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_pin);

        boolean en = state != null && "en".equals(WidgetState.str(state, "lang", "ar"));
        JSONObject pins = WidgetState.obj(state, "pins");
        JSONArray items = WidgetState.arr(pins, "items");

        // this instance's config row (widgetId matches the Android id)
        JSONObject item = null;
        if (items != null) {
            for (int i = 0; i < items.length(); i++) {
                JSONObject cand = WidgetState.at(items, i);
                if (cand != null && WidgetState.num(cand, "widgetId", -1) == appWidgetId) {
                    item = cand;
                    break;
                }
            }
        }

        String pickUri = "astnum://open?tab=today&pickpin=" + appWidgetId;

        if (item == null) {
            // unconfigured → the chooser placeholder (whole card = choose)
            WidgetRender.visible(views, R.id.pin_header, false);
            WidgetRender.visible(views, R.id.pin_title, false);
            WidgetRender.visible(views, R.id.pin_line1, false);
            WidgetRender.visible(views, R.id.pin_line2, false);
            WidgetRender.visible(views, R.id.pin_action, false);
            WidgetRender.visible(views, R.id.pin_empty_block, true);
            WidgetRender.text(views, R.id.pin_empty_cta,
                    WidgetState.str(pins, "chooseCta", en ? "Pick an item for this widget" : "اختر عنصرًا لهذه الودجة"));
            WidgetRender.text(views, R.id.pin_empty_hint,
                    WidgetState.str(pins, "chooseHint", en ? "Tap to choose" : "اضغط للاختيار"));
            WidgetRender.click(views, R.id.widget_root, ctx, 82, pickUri);
            return views;
        }

        WidgetRender.visible(views, R.id.pin_empty_block, false);

        // header: type glyph + type chip
        String type = WidgetState.str(item, "type", "habit");
        int iconRes;
        String typeLabel;
        if ("session".equals(type)) {
            iconRes = R.drawable.widget_ic_dumbbell;
            typeLabel = WidgetState.str(pins, "labelSession", en ? "Session" : "جلسة");
        } else if ("note".equals(type)) {
            iconRes = R.drawable.widget_ic_note;
            typeLabel = WidgetState.str(pins, "labelNote", en ? "Note" : "ملاحظة");
        } else {
            iconRes = R.drawable.widget_ic_repeat;
            typeLabel = WidgetState.str(pins, "labelHabit", en ? "Habit" : "عادة");
        }
        try {
            views.setImageViewResource(R.id.pin_type_icon, iconRes);
        } catch (Exception ignored) {
        }
        WidgetRender.text(views, R.id.pin_type_label, typeLabel);
        WidgetRender.visible(views, R.id.pin_header, true);

        // body
        WidgetRender.text(views, R.id.pin_title, WidgetState.str(item, "title", "—"));
        String line1 = WidgetState.str(item, "line1", "");
        String line2 = WidgetState.str(item, "line2", "");
        WidgetRender.text(views, R.id.pin_line1, line1);
        WidgetRender.text(views, R.id.pin_line2, line2);
        WidgetRender.visible(views, R.id.pin_line1, !line1.isEmpty());
        WidgetRender.visible(views, R.id.pin_line2, !line2.isEmpty());

        // one-tap action (habit: log now / session: start)
        String buttonLabel = WidgetState.str(item, "buttonLabel", "");
        boolean hasAction = WidgetState.bool(item, "hasAction", false) && !buttonLabel.isEmpty();
        WidgetRender.text(views, R.id.pin_action, buttonLabel);
        WidgetRender.visible(views, R.id.pin_action, hasAction);
        if (hasAction) {
            WidgetRender.click(views, R.id.pin_action, ctx, 81,
                    WidgetState.str(item, "actionUri", pickUri));
        }

        // card body → open the item; sliders → re-open the picker
        WidgetRender.click(views, R.id.widget_root, ctx, 80,
                WidgetState.str(item, "openUri", pickUri));
        WidgetRender.click(views, R.id.pin_gear, ctx, 82, pickUri);
        return views;
    }

    @Override
    RemoteViews build(Context ctx, JSONObject state) {
        return build(ctx, state, android.appwidget.AppWidgetManager.INVALID_APPWIDGET_ID);
    }
}
