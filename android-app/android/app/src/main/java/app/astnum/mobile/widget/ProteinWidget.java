package app.astnum.mobile.widget;

import app.astnum.mobile.R;

/** «بروتين اليوم» — 1×1 protein ring (coral, egg glyph). */
public class ProteinWidget extends MacroRingWidget {
    @Override String macroKey() { return "protein"; }
    @Override int accentRes() { return R.color.widget_rose; }
    @Override int glyph() { return R.drawable.widget_ic_egg; }
    @Override int requestCode() { return 23; }
}
