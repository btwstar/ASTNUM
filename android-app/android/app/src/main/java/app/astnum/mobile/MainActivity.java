package app.astnum.mobile;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import app.astnum.mobile.widget.AstnumWidgetsPlugin;

/**
 * ASTNUM launcher activity (Capacitor 7).
 * Registers the inline AstnumWidgets plugin BEFORE the bridge loads so the
 * home-screen-widget bridge (update / requestPin / deep links) is available
 * from the first JS frame.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AstnumWidgetsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
