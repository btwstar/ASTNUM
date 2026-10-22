package app.astnum.mobile.widget;

import app.astnum.mobile.R;

/** «دهون اليوم» — 1×1 fat ring (violet, droplet glyph). */
public class FatWidget extends MacroRingWidget {
    @Override String macroKey() { return "fat"; }
    @Override int accentRes() { return R.color.widget_violet; }
    @Override int glyph() { return R.drawable.widget_ic_drop; }
    @Override int requestCode() { return 24; }
}
