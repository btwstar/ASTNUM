package app.astnum.mobile.widget;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

import app.astnum.mobile.R;

/**
 * «إضافة سريعة» DIALOG — the REAL add-from-widget (v1.22, water mode v2.4).
 *
 * A tap on the quick-add / drinks widget opens this small floating dialog
 * OVER the home screen (the app never opens). Three modes share the card:
 *
 *   habit / note — the user types a title;
 *   water        — one-tap drink logging: drink chips (water / juice /
 *                 other) + preset amount chips + a custom ml field. The
 *                 text input is hidden, so the keyboard never pops.
 *
 * Save then commits through the most direct safe path:
 *
 *   A. process ALIVE — the plugin forwards the capture into the live app
 *      WebView, which creates the habit/note (or logs the drink) via the
 *      app's own routes, refreshes every widget and acks. Dialog closes
 *      instantly.
 *
 *   B. process DEAD — an offscreen same-origin WebView (public/quickadd —
 *      the quickadd bundle) boots against the app's SHARED localStorage
 *      database, creates the row, rebuilds the widget snapshot and hands
 *      it back. Native stores it, pushes all widgets, acks, closes.
 *
 * Both paths are backed by the persistent QuickAddStore queue + the
 * web-side idempotency ledger: a kill anywhere can neither lose nor
 * duplicate the capture.
 *
 * Theme: pure white / pure black surface (values/values-night) matching
 * the widget surfaces; every label arrives pre-formatted per the app's
 * language in the snapshot's quickAdd section (no native l10n layer).
 */
public class QuickAddActivity extends Activity {

    /** Safety net: the whole headless path must complete within this. */
    private static final long HEADLESS_TIMEOUT_MS = 12_000;

    /** Preset amount chips carry pre-formatted locale strings — the RAW ml
     *  values ride in parallel (mirrors WATER_AMOUNTS in snapshot.ts) so a
     *  chip tap knows its ml directly; only the CUSTOM input needs the
     *  digit-sanitizing parse. */
    private static final int[] RAW_ML = {100, 250, 330, 500, 750};

    private String type = "habit";
    /** Water mode's drink category — "water" | "juice" | "other". */
    private String drink = "water";
    /** Optional ?ml= preset from the widget URI (-1 → the 250 default). */
    private int presetMl = -1;
    /** Selected preset chip (-1 = none → the custom input decides). */
    private int amountIndex = -1;
    /** Guards the chip-deselect watcher while code clears the custom input. */
    private boolean suppressAmountWatcher = false;

    private JSONObject qaSection;
    private WebView headlessWeb;
    private final AtomicBoolean committed = new AtomicBoolean(false);
    private final AtomicBoolean dispatchedToPage = new AtomicBoolean(false);
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable headlessTimeout = new Runnable() {
        @Override
        public void run() {
            // whatever is still queued stays queued — consumed (and
            // ledger-deduped) the next time any path can commit
            if (!committed.getAndSet(true)) finish();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Uri data = getIntent() != null ? getIntent().getData() : null;
        if (data != null) {
            String qType = data.getQueryParameter("type");
            if ("note".equals(qType)) type = "note";
            else if ("water".equals(qType)) type = "water";
            String qDrink = data.getQueryParameter("drink");
            if ("juice".equals(qDrink)) drink = "juice";
            else if ("other".equals(qDrink)) drink = "other";
            presetMl = parseMl(data.getQueryParameter("ml"));
        }

        setContentView(R.layout.dialog_quick_add);

        JSONObject state = WidgetState.load(this);
        qaSection = WidgetState.obj(state, "quickAdd");

        TextView title = findViewById(R.id.qa_dialog_title);
        EditText input = findViewById(R.id.qa_dialog_input);
        TextView save = findViewById(R.id.qa_dialog_save);
        TextView cancel = findViewById(R.id.qa_dialog_cancel);
        View card = findViewById(R.id.qa_dialog_card);

        if (card != null) {
            card.setLayoutDirection(Boolean.parseBoolean(
                    WidgetState.str(qaSection, "rtl", "false"))
                    ? View.LAYOUT_DIRECTION_RTL : View.LAYOUT_DIRECTION_LOCALE);
        }

        // v2.3/v2.4: the segmented type switcher — labels shared with the widget
        TextView segHabitLabel = findViewById(R.id.qa_seg_habit_label);
        TextView segNoteLabel = findViewById(R.id.qa_seg_note_label);
        TextView segWaterLabel = findViewById(R.id.qa_seg_water_label);
        if (segHabitLabel != null) {
            segHabitLabel.setText(WidgetState.str(qaSection,
                    "habitLabel", "Habit"));
        }
        if (segNoteLabel != null) {
            segNoteLabel.setText(WidgetState.str(qaSection,
                    "noteLabel", "Note"));
        }
        if (segWaterLabel != null) {
            segWaterLabel.setText(WidgetState.str(qaSection,
                    "waterLabel", "Water"));
        }
        View segHabit = findViewById(R.id.qa_seg_habit);
        View segNote = findViewById(R.id.qa_seg_note);
        View segWater = findViewById(R.id.qa_seg_water);
        if (segHabit != null) {
            segHabit.setOnClickListener(v -> {
                if (committed.get()) return;
                setType("habit");
            });
        }
        if (segNote != null) {
            segNote.setOnClickListener(v -> {
                if (committed.get()) return;
                setType("note");
            });
        }
        if (segWater != null) {
            segWater.setOnClickListener(v -> {
                if (committed.get()) return;
                setType("water");
            });
        }

        // v2.4 — the water-mode block: drink chips + amount chips + custom ml
        wireWaterBlock();

        save.setText(WidgetState.str(qaSection, "save", "Save"));
        cancel.setText(WidgetState.str(qaSection, "cancel", "Cancel"));
        save.setEnabled(true);
        save.setAlpha(1f);

        cancel.setOnClickListener(v -> finish());
        save.setOnClickListener(v -> onSave(qaSection));

        // apply the CURRENT type (title/hint/segment state) and focus the field
        setType(type);

        // focus + keyboard: the habit/note dialog IS a text field, make typing
        // instant. Water mode is chip-driven — never steal focus, never pop
        // the keyboard (the text input is GONE there anyway).
        if (!"water".equals(type)) {
            input.requestFocus();
            input.postDelayed(() -> {
                try {
                    InputMethodManager imm =
                            (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
                    if (imm != null) imm.showSoftInput(input, InputMethodManager.SHOW_IMPLICIT);
                } catch (Exception ignored) {
                }
            }, 120);
        }
    }

    /** v2.4 — labels, preset texts and single-select handlers of the
     *  one-tap drinks block (drink chips + amount chips + custom ml). */
    private void wireWaterBlock() {
        TextView drinkWaterLabel = findViewById(R.id.qa_drink_water_label);
        TextView drinkJuiceLabel = findViewById(R.id.qa_drink_juice_label);
        TextView drinkOtherLabel = findViewById(R.id.qa_drink_other_label);
        if (drinkWaterLabel != null) {
            drinkWaterLabel.setText(WidgetState.str(qaSection, "waterLabel", "Water"));
        }
        if (drinkJuiceLabel != null) {
            drinkJuiceLabel.setText(WidgetState.str(qaSection, "juiceLabel", "Juice"));
        }
        if (drinkOtherLabel != null) {
            drinkOtherLabel.setText(WidgetState.str(qaSection, "otherLabel", "Drink"));
        }

        TextView amountLabel = findViewById(R.id.qa_amount_label);
        if (amountLabel != null) {
            amountLabel.setText(WidgetState.str(qaSection, "amountLabel", "Amount"));
        }
        TextView amountUnit = findViewById(R.id.qa_amount_unit);
        if (amountUnit != null) {
            amountUnit.setText(WidgetState.str(qaSection, "unitMl", "ml"));
        }

        // preset chips: values arrive pre-formatted in the app's digits
        JSONArray amounts = WidgetState.arr(qaSection, "amounts");
        int[] chipIds = amountChipIds();
        for (int i = 0; i < chipIds.length; i++) {
            TextView chip = findViewById(chipIds[i]);
            if (chip == null) continue;
            String label = "";
            if (amounts != null) {
                try {
                    label = amounts.optString(i, "");
                } catch (Exception ignored) {
                }
            }
            chip.setText(label == null || label.isEmpty()
                    ? String.valueOf(RAW_ML[i]) : label);
            final int index = i;
            chip.setOnClickListener(v -> {
                if (committed.get()) return;
                selectAmount(index);
            });
        }

        View drinkWater = findViewById(R.id.qa_drink_water);
        View drinkJuice = findViewById(R.id.qa_drink_juice);
        View drinkOther = findViewById(R.id.qa_drink_other);
        if (drinkWater != null) {
            drinkWater.setOnClickListener(v -> {
                if (committed.get()) return;
                selectDrink("water");
            });
        }
        if (drinkJuice != null) {
            drinkJuice.setOnClickListener(v -> {
                if (committed.get()) return;
                selectDrink("juice");
            });
        }
        if (drinkOther != null) {
            drinkOther.setOnClickListener(v -> {
                if (committed.get()) return;
                selectDrink("other");
            });
        }

        // typing a custom amount deselects the preset chips
        EditText amountInput = findViewById(R.id.qa_amount_input);
        if (amountInput != null) {
            amountInput.setHint(WidgetState.str(qaSection,
                    "amountHint", "Custom amount (ml)"));
            amountInput.addTextChangedListener(new TextWatcher() {
                @Override
                public void beforeTextChanged(CharSequence s, int a, int b, int c) {
                }

                @Override
                public void onTextChanged(CharSequence s, int a, int b, int c) {
                }

                @Override
                public void afterTextChanged(Editable s) {
                    if (suppressAmountWatcher) return;
                    if (s != null && s.length() > 0 && amountIndex >= 0) {
                        selectAmount(-1);
                    }
                }
            });
        }
    }

    /** v2.3/v2.4 — flip the capture type INSIDE the dialog (habit ⇄ note ⇄
     *  water): retitles the card, re-hints the input, restyles the segments
     *  and swaps the text input for the one-tap drinks block (or back).
     *  The widget buttons still pre-select the type via ?type=. */
    private void setType(String next) {
        this.type = next;
        boolean note = "note".equals(type);
        boolean water = "water".equals(type);

        TextView title = findViewById(R.id.qa_dialog_title);
        EditText input = findViewById(R.id.qa_dialog_input);
        View waterBlock = findViewById(R.id.qa_water_block);
        View segHabit = findViewById(R.id.qa_seg_habit);
        View segNote = findViewById(R.id.qa_seg_note);
        View segWater = findViewById(R.id.qa_seg_water);
        ImageView segHabitIcon = findViewById(R.id.qa_seg_habit_icon);
        ImageView segNoteIcon = findViewById(R.id.qa_seg_note_icon);
        ImageView segWaterIcon = findViewById(R.id.qa_seg_water_icon);
        TextView segHabitLabel = findViewById(R.id.qa_seg_habit_label);
        TextView segNoteLabel = findViewById(R.id.qa_seg_note_label);
        TextView segWaterLabel = findViewById(R.id.qa_seg_water_label);

        if (title != null) {
            title.setText(WidgetState.str(qaSection,
                    water ? "titleWater" : note ? "titleNote" : "titleHabit",
                    water ? "Log a drink" : note ? "New note" : "New habit"));
        }
        if (input != null) {
            input.setHint(WidgetState.str(qaSection,
                    note ? "inputHintNote" : "inputHintHabit",
                    note ? "Note title…" : "Habit name…"));
            input.setVisibility(water ? View.GONE : View.VISIBLE);
        }
        if (waterBlock != null) {
            waterBlock.setVisibility(water ? View.VISIBLE : View.GONE);
        }

        if (segHabit != null) {
            segHabit.setBackgroundResource(note || water
                    ? R.drawable.qa_seg_inactive : R.drawable.qa_seg_active);
        }
        if (segNote != null) {
            segNote.setBackgroundResource(note
                    ? R.drawable.qa_seg_active : R.drawable.qa_seg_inactive);
        }
        if (segWater != null) {
            segWater.setBackgroundResource(water
                    ? R.drawable.qa_seg_active : R.drawable.qa_seg_inactive);
        }
        int activeInk = WidgetRender.themed(this, R.color.widget_text_primary, 0xFF000000);
        int inactiveInk = WidgetRender.textMuted(this);
        int lime = WidgetRender.accentLime(this);
        int violet = WidgetRender.violet(this);
        int cyan = WidgetRender.accentCyan(this);
        if (segHabitIcon != null) {
            segHabitIcon.setColorFilter(note || water ? inactiveInk : lime);
        }
        if (segNoteIcon != null) {
            segNoteIcon.setColorFilter(note ? violet : inactiveInk);
        }
        if (segWaterIcon != null) {
            segWaterIcon.setColorFilter(water ? cyan : inactiveInk);
        }
        if (segHabitLabel != null) {
            segHabitLabel.setTextColor(note || water ? inactiveInk : activeInk);
        }
        if (segNoteLabel != null) {
            segNoteLabel.setTextColor(note ? activeInk : inactiveInk);
        }
        if (segWaterLabel != null) {
            segWaterLabel.setTextColor(water ? activeInk : inactiveInk);
        }

        if (water) {
            // the intent's drink (default water) + the intent's ml preset,
            // else the 250 chip — exactly what the drinks widget promises
            selectDrink(drink);
            if (presetMl > 0) {
                int idx = indexOfAmount(presetMl);
                if (idx >= 0) {
                    selectAmount(idx);
                } else {
                    selectAmount(-1);
                    EditText amountInput = findViewById(R.id.qa_amount_input);
                    if (amountInput != null) {
                        suppressAmountWatcher = true;
                        try {
                            amountInput.setText(String.valueOf(presetMl));
                        } finally {
                            suppressAmountWatcher = false;
                        }
                    }
                }
            } else {
                selectAmount(indexOfAmount(250));
            }
        }
    }

    /** Single-select the drink category (water | juice | other). */
    private void selectDrink(String next) {
        this.drink = next == null || next.isEmpty() ? "water" : next;
        String[] keys = {"water", "juice", "other"};
        int[] chipIds = {R.id.qa_drink_water, R.id.qa_drink_juice, R.id.qa_drink_other};
        int[] iconIds = {R.id.qa_drink_water_icon, R.id.qa_drink_juice_icon,
                R.id.qa_drink_other_icon};
        int[] labelIds = {R.id.qa_drink_water_label, R.id.qa_drink_juice_label,
                R.id.qa_drink_other_label};
        int activeInk = WidgetRender.themed(this, R.color.widget_text_primary, 0xFF000000);
        int inactiveInk = WidgetRender.textDim(this);
        int cyan = WidgetRender.accentCyan(this);
        for (int i = 0; i < keys.length; i++) {
            boolean on = keys[i].equals(this.drink);
            View chip = findViewById(chipIds[i]);
            if (chip != null) {
                chip.setBackgroundResource(on
                        ? R.drawable.qa_seg_active : R.drawable.qa_seg_inactive);
            }
            ImageView icon = findViewById(iconIds[i]);
            if (icon != null) icon.setColorFilter(on ? cyan : inactiveInk);
            TextView label = findViewById(labelIds[i]);
            if (label != null) label.setTextColor(on ? activeInk : inactiveInk);
        }
    }

    /** Single-select a preset amount chip (-1 deselects all). */
    private void selectAmount(int index) {
        this.amountIndex = index;
        int activeInk = WidgetRender.themed(this, R.color.widget_text_primary, 0xFF000000);
        int inactiveInk = WidgetRender.textMuted(this);
        int[] chipIds = amountChipIds();
        for (int i = 0; i < chipIds.length; i++) {
            TextView chip = findViewById(chipIds[i]);
            if (chip == null) continue;
            chip.setBackgroundResource(i == index
                    ? R.drawable.qa_seg_active : R.drawable.qa_seg_inactive);
            chip.setTextColor(i == index ? activeInk : inactiveInk);
        }
        // a chip choice replaces any typed custom amount
        if (index >= 0) {
            EditText amountInput = findViewById(R.id.qa_amount_input);
            if (amountInput != null) {
                amountInput.setError(null);
                suppressAmountWatcher = true;
                try {
                    amountInput.setText("");
                } finally {
                    suppressAmountWatcher = false;
                }
            }
        }
    }

    /** The ml the user chose: the RAW chip value, or the sanitized custom
     *  input. -1 when nothing usable is selected/typed. */
    private int selectedMl() {
        if (amountIndex >= 0 && amountIndex < RAW_ML.length) return RAW_ML[amountIndex];
        EditText amountInput = findViewById(R.id.qa_amount_input);
        return amountInput == null ? -1 : parseMl(amountInput.getText().toString());
    }

    /**
     * Locale-safe ml parse: amounts arrive as PRE-FORMATTED strings in the
     * app's digits (Arabic-Indic ٠-٩, Extended ۰-۹…) — map every digit to
     * Western, normalize decimal separators and drop everything else
     * (thousands separators, spaces, units). -1 when not a usable number.
     */
    private static int parseMl(String raw) {
        if (raw == null || raw.isEmpty()) return -1;
        StringBuilder sb = new StringBuilder(raw.length());
        boolean dotted = false;
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (c >= '0' && c <= '9') {
                sb.append(c);
            } else if (c >= '\u0660' && c <= '\u0669') {        // ٠..٩
                sb.append((char) ('0' + (c - '\u0660')));
            } else if (c >= '\u06F0' && c <= '\u06F9') {        // ۰..۹
                sb.append((char) ('0' + (c - '\u06F0')));
            } else if (!dotted && (c == '.' || c == ',' || c == '\u066B')) {
                sb.append('.');                                  // decimal sep
                dotted = true;
            }
            // everything else (٬ thousands sep, spaces, "ml"…) is dropped
        }
        if (sb.length() == 0 || sb.charAt(sb.length() - 1) == '.') return -1;
        try {
            double v = Double.parseDouble(sb.toString());
            if (Double.isNaN(v) || Double.isInfinite(v)) return -1;
            return (int) Math.round(v);
        } catch (Exception e) {
            return -1;
        }
    }

    private static int indexOfAmount(int ml) {
        for (int i = 0; i < RAW_ML.length; i++) {
            if (RAW_ML[i] == ml) return i;
        }
        return -1;
    }

    private int[] amountChipIds() {
        return new int[]{R.id.qa_amount_0, R.id.qa_amount_1, R.id.qa_amount_2,
                R.id.qa_amount_3, R.id.qa_amount_4};
    }

    /* ── Save: queue first, then commit via the fastest safe path ─────── */

    private void onSave(JSONObject qa) {
        if (committed.get()) return;

        String text;
        String captureDrink = null;
        if ("water".equals(type)) {
            // one-tap hydration: amount chips carry the RAW ml directly; only
            // the custom input needs the locale-safe digit parse
            int ml = selectedMl();
            if (ml < 50 || ml > 3000) {
                EditText amountInput = findViewById(R.id.qa_amount_input);
                if (amountInput != null) {
                    amountInput.setError(WidgetState.str(qa,
                            "errorEmpty", "Check your input and try again."));
                }
                return;
            }
            text = String.valueOf(ml);
            captureDrink = drink;
        } else {
            EditText input = findViewById(R.id.qa_dialog_input);
            text = input.getText().toString().trim();
            if (text.isEmpty()) {
                input.setError(WidgetState.str(qa, "errorEmpty",
                        "Check your input and try again."));
                return;
            }
        }

        String entryId = QuickAddStore.enqueue(this, type, text, captureDrink);
        if (entryId == null) {
            // storage failure is the only unrecoverable case — be honest
            try {
                Toast.makeText(this, WidgetState.str(qa, "errorEmpty",
                        "Check your input and try again."), Toast.LENGTH_SHORT).show();
            } catch (Exception ignored) {
            }
            return;
        }

        // Path A — live bridge: the running app commits through its own code
        if (AstnumWidgetsPlugin.dispatchQuickCapture(entryId, type, text, captureDrink)) {
            committed.set(true);
            try {
                Toast.makeText(this, WidgetState.str(qa, "saved", "Saved"),
                        Toast.LENGTH_SHORT).show();
            } catch (Exception ignored) {
            }
            finish();
            return;
        }

        // Path B — dead process: headless same-origin commit
        TextView save = findViewById(R.id.qa_dialog_save);
        save.setEnabled(false);
        save.setAlpha(0.55f);
        startHeadlessCommit();
    }

    /* ── Path B: the offscreen same-origin WebView ───────────────────── */

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void startHeadlessCommit() {
        try {
            WebView web = new WebView(this);
            headlessWeb = web;

            WebSettings s = web.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);     // ← the SHARED localStorage database
            s.setAllowFileAccess(false);
            s.setAllowContentAccess(false);
            s.setCacheMode(WebSettings.LOAD_NO_CACHE);
            web.setBackgroundColor(Color.TRANSPARENT);

            web.setWebViewClient(new WebViewClient() {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    return serveSameOrigin(request.getUrl());
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    dispatchQueueToPage();
                }
            });
            web.addJavascriptInterface(new NativeBridge(), "AstnumQuickBridge");
            web.loadUrl("https://localhost/quickadd/quickadd.html");

            main.postDelayed(headlessTimeout, HEADLESS_TIMEOUT_MS);
        } catch (Exception e) {
            // no WebView → the queued entry waits for the next app open
            if (!committed.getAndSet(true)) finish();
        }
    }

    /** Hand the whole pending queue to the page (idempotent single shot). */
    private void dispatchQueueToPage() {
        if (dispatchedToPage.getAndSet(true) || headlessWeb == null) return;
        final String entries = QuickAddStore.peek(this);
        final String js = "window.__astnumProcessCapture && window.__astnumProcessCapture("
                + JSONObject.quote(entries) + ")";
        // onPageFinished/pageReady both land here; the page itself dedupes via
        // the ledger, but the flag keeps the double dispatch from even happening
        main.post(() -> {
            try {
                headlessWeb.evaluateJavascript(js, null);
            } catch (Exception ignored) {
            }
        });
    }

    /** Serve https://localhost/** from the APK's public web assets — the
     *  SAME files the Capacitor WebView serves, so the origin (and with it
     *  the localStorage database) is identical. */
    private WebResourceResponse serveSameOrigin(Uri url) {
        try {
            if (url == null || !"localhost".equals(url.getHost())) return null;
            String path = url.getPath();
            if (path == null || path.isEmpty() || "/".equals(path)) path = "/index.html";

            String asset = "public" + path;
            InputStream in = getAssets().open(asset);

            Map<String, String> headers = new HashMap<>();
            headers.put("Access-Control-Allow-Origin", "https://localhost");
            headers.put("Cache-Control", "no-store");

            return new WebResourceResponse(mimeFor(path), "utf-8", 200, "OK", headers, in);
        } catch (Exception e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                    new HashMap<String, String>(),
                    new ByteArrayInputStream(new byte[0]));
        }
    }

    private static String mimeFor(String path) {
        String p = path.toLowerCase(Locale.ROOT);
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".woff")) return "font/woff";
        if (p.endsWith(".ttf")) return "font/ttf";
        if (p.endsWith(".webp")) return "image/webp";
        return "application/octet-stream";
    }

    /** JS → native bridge (the quickadd bundle drives from the inside). */
    private class NativeBridge {
        @JavascriptInterface
        public void pageReady() {
            runOnUiThread(QuickAddActivity.this::dispatchQueueToPage);
        }

        @JavascriptInterface
        public void captureDone(final String resultJson) {
            runOnUiThread(() -> handleCaptureDone(resultJson));
        }

        @JavascriptInterface
        public void log(String message) {
            // lightweight diagnostics channel (bundle-side trace points)
        }
    }

    /** The headless page finished: store its fresh snapshot + ack + close. */
    private void handleCaptureDone(String resultJson) {
        main.removeCallbacks(headlessTimeout);
        if (committed.getAndSet(true)) return;
        try {
            JSONObject res = new JSONObject(resultJson == null ? "{}" : resultJson);
            JSONObject qa = WidgetState.obj(WidgetState.load(this), "quickAdd");

            if (res.optBoolean("ok")) {
                // ack exactly what the page committed — the rest stays queued
                JSONArray acked = res.optJSONArray("acked");
                if (acked != null) {
                    List<String> ids = new ArrayList<>(acked.length());
                    for (int i = 0; i < acked.length(); i++) {
                        String id = acked.optString(i, "");
                        if (!id.isEmpty()) ids.add(id);
                    }
                    QuickAddStore.remove(this, ids);
                }

                // fresh labels + the new row → every home-screen widget now
                // shows it, immediately, without the app ever opening
                JSONObject snapshot = res.optJSONObject("snapshot");
                if (snapshot != null) {
                    WidgetState.store(this, snapshot.toString());
                    WidgetRender.pushAll(this);
                }

                try {
                    Toast.makeText(this, WidgetState.str(qa, "saved", "Saved"),
                            Toast.LENGTH_SHORT).show();
                } catch (Exception ignored) {
                }
            } else {
                // commit failed → the entry stays queued and lands the next
                // time any path can commit (typically the next app open).
                // Show nothing — never claim a save that didn't happen.
            }
        } catch (Exception ignored) {
        }
        finish();
    }

    @Override
    protected void onDestroy() {
        main.removeCallbacks(headlessTimeout);
        if (headlessWeb != null) {
            try {
                headlessWeb.removeJavascriptInterface("AstnumQuickBridge");
                headlessWeb.setWebViewClient(null);
                headlessWeb.destroy();
            } catch (Exception ignored) {
            }
            headlessWeb = null;
        }
        super.onDestroy();
    }
}
