package app.astnum.mobile.widget;

import app.astnum.mobile.R;

/** «سعرات اليوم» — 1×1 calories ring (brand cyan, flame glyph). */
public class CaloriesWidget extends MacroRingWidget {
    @Override String macroKey() { return "calories"; }
    @Override int accentRes() { return R.color.widget_accent; }
    @Override int glyph() { return R.drawable.widget_ic_flame; }
    @Override int requestCode() { return 21; }
}
