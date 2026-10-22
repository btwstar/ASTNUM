package app.astnum.mobile.widget;

import android.content.Context;
import android.graphics.Bitmap;
import android.util.Base64;
import android.widget.RemoteViews;

import org.json.JSONObject;

import app.astnum.mobile.R;

/**
 * «حرارة العضلات» (2×3) — the app's REAL muscle heat map: the web side
 * renders its own anatomy figure (front+back, 5-level brand palette) to a
 * PNG and ships it base64 inside the snapshot; here it is decoded and
 * shown, with the period + top-muscle caption. Tap opens the muscles tab.
 */
public class MusclesWidget extends BaseAstnumWidget {

    @Override
    RemoteViews build(Context ctx, JSONObject state) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_muscles);

        boolean empty = WidgetState.bool(state, "empty", true);
        boolean en = state != null && "en".equals(WidgetState.str(state, "lang", "ar"));
        JSONObject t = WidgetState.obj(state, "t");
        String title = WidgetState.str(t, "heatTitle", "Muscle heat");
        String openHint = WidgetState.str(t, "openApp", "Open ASTNUM");
        String regenHint = WidgetState.str(t, "heatRegen", "Open the app to generate the map");

        WidgetRender.text(views, R.id.heat_title, title);

        JSONObject heat = WidgetState.obj(state, "heat");
        boolean has = heat != null && WidgetState.bool(heat, "has", false);
        String image = WidgetState.str(heat, "image", "");

        WidgetRender.text(views, R.id.heat_period, WidgetState.str(heat, "periodLabel", ""));
        WidgetRender.text(views, R.id.heat_top, WidgetState.str(heat, "topLabel", ""));

        if (empty || !has || image.isEmpty()) {
            WidgetRender.visible(views, R.id.heat_image, false);
            WidgetRender.visible(views, R.id.heat_empty, true);
            WidgetRender.text(views, R.id.heat_empty, empty ? openHint : regenHint);
            WidgetRender.visible(views, R.id.heat_period, false);
            WidgetRender.click(views, R.id.widget_root, ctx, 51, "astnum://open?tab=body&sub=muscles");
            return views;
        }

        try {
            byte[] png = Base64.decode(image, Base64.NO_WRAP);
            Bitmap bmp = android.graphics.BitmapFactory.decodeByteArray(png, 0, png.length);
            if (bmp != null) {
                views.setImageViewBitmap(R.id.heat_image, bmp);
                WidgetRender.visible(views, R.id.heat_image, true);
                WidgetRender.visible(views, R.id.heat_empty, false);
            } else {
                WidgetRender.visible(views, R.id.heat_image, false);
                WidgetRender.visible(views, R.id.heat_empty, true);
                WidgetRender.text(views, R.id.heat_empty, regenHint);
            }
        } catch (Exception e) {
            WidgetRender.visible(views, R.id.heat_image, false);
            WidgetRender.visible(views, R.id.heat_empty, true);
            WidgetRender.text(views, R.id.heat_empty, regenHint);
        }
        WidgetRender.visible(views, R.id.heat_period, true);

        WidgetRender.click(views, R.id.widget_root, ctx, 51, "astnum://open?tab=body&sub=muscles");
        return views;
    }
}
