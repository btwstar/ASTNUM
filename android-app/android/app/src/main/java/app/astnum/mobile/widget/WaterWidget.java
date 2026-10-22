package app.astnum.mobile.widget;

import org.json.JSONObject;

import app.astnum.mobile.R;

/**
 * «ماء اليوم» — 1×1 hydration ring (cyan-600, glass glyph). Same engine as
 * the macro rings, but the section is the top-level "water" object of the
 * snapshot (v2.4) instead of macros.<key>; the placeholder branch covers a
 * missing section exactly like the macros (open-app hint under an empty ring).
 */
public class WaterWidget extends MacroRingWidget {
    @Override String macroKey() { return "water"; }
    @Override int accentRes() { return R.color.widget_accent; }
    @Override int glyph() { return R.drawable.widget_ic_glass; }
    @Override int requestCode() { return 27; }

    @Override
    protected JSONObject resolveSection(JSONObject state) {
        return WidgetState.obj(state, "water");
    }

    @Override
    protected String nameFallback(boolean en) {
        return en ? "Water" : "الماء";
    }
}
