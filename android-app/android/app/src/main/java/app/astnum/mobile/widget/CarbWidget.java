package app.astnum.mobile.widget;

import app.astnum.mobile.R;

/** «كارب اليوم» — 1×1 carbs ring (amber, wheat glyph). */
public class CarbWidget extends MacroRingWidget {
    @Override String macroKey() { return "carb"; }
    @Override int accentRes() { return R.color.widget_amber; }
    @Override int glyph() { return R.drawable.widget_ic_wheat; }
    @Override int requestCode() { return 22; }
}
