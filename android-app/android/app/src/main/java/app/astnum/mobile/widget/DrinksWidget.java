package app.astnum.mobile.widget;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONObject;

import app.astnum.mobile.R;

/**
 * «المشروبات» (2×1, v2.4) — hydration quick-add: a glass header with today's
 * ml progress + three one-tap columns (water / juice / other). A column tap
 * opens the native QuickAdd DIALOG in its water mode over the home screen;
 * the committed amount lands in the app's real database (live bridge or the
 * headless same-origin bundle) and every widget refreshes — the app never
 * opens. The card itself deep-links into the food screen.
 *
 * All strings arrive pre-formatted in the app's language (water + quickAdd
 * snapshot sections); the native layer only mirrors them.
 */
public class DrinksWidget extends BaseAstnumWidget {

    @Override
    RemoteViews build(Context ctx, JSONObject state) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_drinks);

        JSONObject water = WidgetState.obj(state, "water");
        JSONObject qa = WidgetState.obj(state, "quickAdd");
        JSONObject t = WidgetState.obj(state, "t");
        boolean empty = WidgetState.bool(state, "empty", true);
        boolean en = state != null && "en".equals(WidgetState.str(state, "lang", "ar"));

        // header: the goal-reached line once done, else today's ml total
        if (!empty && water != null) {
            String header = WidgetState.bool(water, "goalDone", false)
                    ? WidgetState.str(water, "headerDone", "")
                    : WidgetState.str(water, "headerLabel", "");
            if (header.isEmpty()) {
                header = WidgetState.str(qa, "waterLabel", en ? "Water" : "الماء");
            }
            WidgetRender.text(views, R.id.drinks_header, header);
        } else {
            // branded placeholder — app never opened / no hydration data yet
            WidgetRender.text(views, R.id.drinks_header,
                    WidgetState.str(t, "openApp", "Open ASTNUM"));
        }

        // hydration progress (bar() hides it when there is no goal)
        JSONObject bar = WidgetState.obj(water, "bar");
        WidgetRender.bar(views, R.id.drinks_bar,
                WidgetState.barDone(bar), WidgetState.barTotal(bar));

        // the three one-tap columns — labels + pre-formatted plus captions
        WidgetRender.text(views, R.id.drinks_water_label,
                WidgetState.str(qa, "waterLabel", en ? "Water" : "الماء"));
        WidgetRender.text(views, R.id.drinks_water_plus,
                WidgetState.str(water, "plusWater", en ? "+250 ml" : "+٢٥٠ مل"));
        WidgetRender.text(views, R.id.drinks_juice_label,
                WidgetState.str(qa, "juiceLabel", en ? "Juice" : "عصير"));
        WidgetRender.text(views, R.id.drinks_juice_plus,
                WidgetState.str(water, "plusJuice", en ? "+200 ml" : "+٢٠٠ مل"));
        WidgetRender.text(views, R.id.drinks_other_label,
                WidgetState.str(qa, "otherLabel", en ? "Drink" : "مشروب"));
        WidgetRender.text(views, R.id.drinks_other_plus,
                WidgetState.str(water, "plusOther", en ? "+250 ml" : "+٢٥٠ مل"));

        // one tap each → the native capture dialog in water mode (the app
        // stays closed); the card itself still deep-links into the app
        WidgetRender.clickDialog(views, R.id.drinks_water, ctx, 87,
                "astnum://quickadd?type=water&drink=water");
        WidgetRender.clickDialog(views, R.id.drinks_juice, ctx, 88,
                "astnum://quickadd?type=water&drink=juice");
        WidgetRender.clickDialog(views, R.id.drinks_other, ctx, 89,
                "astnum://quickadd?type=water&drink=other");
        // NOTE: 95, not 90 — UpcomingWidget already owns 90..94.
        WidgetRender.click(views, R.id.widget_root, ctx, 95,
                "astnum://open?tab=body&sub=food");
        return views;
    }
}
