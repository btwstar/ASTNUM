package app.astnum.mobile.widget;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONObject;

import app.astnum.mobile.R;

/**
 * Shared engine for the 1×1 ring widgets (calories / carb / protein /
 * fat + water): the ring bitmap (track + accent arc + tinted glyph) is
 * painted by WidgetRender, the percentage sits under it and the whole
 * widget opens the nutrition screen.
 */
abstract class MacroRingWidget extends BaseAstnumWidget {

    /** The snapshot object inside "macros" — "calories" | "carb" | "protein" | "fat". */
    abstract String macroKey();

    /** Themed accent resource for the arc + glyph (values/values-night). */
    abstract int accentRes();

    /** Center glyph drawable. */
    abstract int glyph();

    /** Unique PendingIntent request code (avoid collisions across widgets). */
    abstract int requestCode();

    /** The section object rendered by this ring (macros.<key> by default;
     *  the water ring overrides to the top-level "water" section). */
    protected org.json.JSONObject resolveSection(org.json.JSONObject state) {
        return WidgetState.obj(WidgetState.obj(state, "macros"), macroKey());
    }

    /** Display-name fallback when the section has no name (macro key by
     *  default; the water ring overrides with its translated word). */
    protected String nameFallback(boolean en) {
        return en ? macroKey() : "—";
    }

    @Override
    RemoteViews build(Context ctx, JSONObject state) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_macro);

        boolean empty = WidgetState.bool(state, "empty", true);
        boolean en = state != null && "en".equals(WidgetState.str(state, "lang", "ar"));
        JSONObject t = WidgetState.obj(state, "t");
        String openHint = WidgetState.str(t, "openApp", "Open ASTNUM");

        JSONObject macro = resolveSection(state);
        String pctLabel = WidgetState.str(macro, "pctLabel", "");
        String name = WidgetState.str(macro, "name", nameFallback(en));
        String value = WidgetState.str(macro, "valueLabel", "");
        int pct = WidgetState.num(macro, "pct", 0);

        if (!empty && macro != null && !pctLabel.isEmpty()) {
            try {
                int accent = WidgetRender.themed(ctx, accentRes(), WidgetRender.ACCENT_CYAN);
                android.graphics.Bitmap ring = WidgetRender.ringBitmap(ctx, pct, accent, glyph());
                if (ring != null) views.setImageViewBitmap(R.id.macro_ring, ring);
            } catch (Exception ignored) {
            }
            WidgetRender.text(views, R.id.macro_pct, pctLabel);
            WidgetRender.text(views, R.id.macro_name, name);
            WidgetRender.text(views, R.id.macro_value, value);
        } else {
            // branded placeholder — app never opened / no goals yet
            try {
                int accent = WidgetRender.themed(ctx, accentRes(), WidgetRender.ACCENT_CYAN);
                android.graphics.Bitmap ring = WidgetRender.ringBitmap(ctx, 0, accent, glyph());
                if (ring != null) views.setImageViewBitmap(R.id.macro_ring, ring);
            } catch (Exception ignored) {
            }
            WidgetRender.text(views, R.id.macro_pct, empty ? openHint : "—");
            WidgetRender.text(views, R.id.macro_name, name);
            WidgetRender.text(views, R.id.macro_value, "");
        }

        WidgetRender.click(views, R.id.widget_root, ctx, requestCode(), "astnum://open?tab=body&sub=food");
        return views;
    }
}
