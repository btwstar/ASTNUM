package app.astnum.mobile.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.drawable.Drawable;

import org.json.JSONObject;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

import app.astnum.mobile.R;

/**
 * Shared RemoteViews plumbing for the 19 ASTNUM widgets: maps widget kinds
 * to providers, renders + pushes RemoteViews to every placed instance
 * (all ids or one), builds the astnum:// open-app PendingIntents, drives
 * progress bars and paints the 1×1 macro RING bitmaps (Canvas arcs with
 * rounded caps — pixel-perfect on every density, theme-aware track).
 *
 * v2.1 theme system: every widget surface is PURE WHITE in light mode and
 * PURE BLACK in dark mode (values/values-night), and ALL accent colors are
 * resolved per-theme at render time through themed() — the static palette
 * below is only the fallback for a broken resource table.
 *
 * RemoteViews discipline (a widget must never crash the launcher):
 *   • only RemoteViews-supported view classes appear in the layouts;
 *   • every runtime call is an annotated setter (setTextViewText,
 *     setViewVisibility, setTextColor, setInt "setColorFilter",
 *     setProgressBar, setChronometer, setImageViewBitmap,
 *     setOnClickPendingIntent);
 *   • all rendering is wrapped — one bad payload renders a placeholder,
 *     never an exception in the launcher process.
 */
public final class WidgetRender {

    private WidgetRender() {}

    /* ── provider map (19 kinds — mirrors WidgetKind in bridge.ts) ─────── */

    static Class<?> providerFor(String kind) {
        if ("calories".equals(kind)) return CaloriesWidget.class;
        if ("carb".equals(kind)) return CarbWidget.class;
        if ("protein".equals(kind)) return ProteinWidget.class;
        if ("fat".equals(kind)) return FatWidget.class;
        if ("water".equals(kind)) return WaterWidget.class;
        if ("meals".equals(kind)) return MealsWidget.class;
        if ("tasks".equals(kind)) return TasksWidget.class;
        if ("taskFlip".equals(kind)) return TaskFlipWidget.class;
        if ("habits".equals(kind)) return HabitsWidget.class;
        if ("habitFlip".equals(kind)) return HabitFlipWidget.class;
        if ("muscles".equals(kind)) return MusclesWidget.class;
        if ("sessions".equals(kind)) return SessionsWidget.class;
        if ("active".equals(kind)) return ActiveWidget.class;
        if ("percent".equals(kind)) return PercentWidget.class;
        if ("quickAdd".equals(kind)) return QuickAddWidget.class;
        if ("drinks".equals(kind)) return DrinksWidget.class;
        if ("pin".equals(kind)) return PinWidget.class;
        if ("events".equals(kind)) return UpcomingWidget.class;
        if ("calendar".equals(kind)) return CalendarWidget.class;
        return null;
    }

    /** All 19 providers (update pushes every placed widget). */
    @SuppressWarnings("unchecked")
    static final Class<? extends BaseAstnumWidget>[] ALL = new Class[] {
            CaloriesWidget.class, CarbWidget.class, ProteinWidget.class, FatWidget.class,
            WaterWidget.class,
            MealsWidget.class, TasksWidget.class, TaskFlipWidget.class, HabitsWidget.class,
            HabitFlipWidget.class, MusclesWidget.class, SessionsWidget.class,
            ActiveWidget.class, PercentWidget.class, QuickAddWidget.class, DrinksWidget.class,
            PinWidget.class,
            UpcomingWidget.class, CalendarWidget.class,
    };

    /* ── push helpers ──────────────────────────────────────────────────── */

    /** Re-render + push every placed widget of every kind (after a data update). */
    static void pushAll(Context ctx) {
        for (Class<?> provider : ALL) push(ctx, provider);
    }

    /** Re-render + push every placed instance of one provider. */
    static void push(Context ctx, Class<?> provider) {
        try {
            AppWidgetManager awm = AppWidgetManager.getInstance(ctx);
            if (awm == null) return;
            int[] ids = awm.getAppWidgetIds(new ComponentName(ctx, provider));
            if (ids == null || ids.length == 0) return;
            JSONObject state = WidgetState.load(ctx);
            BaseAstnumWidget w = newInstance(provider);
            if (w != null && (w.flipEnabled() || w.perIdEnabled())) {
                // flip + pin widgets: each placed id renders its OWN content
                for (int id : ids) {
                    RemoteViews views = w.build(ctx, state, id);
                    if (views != null) awm.updateAppWidget(id, views);
                }
                return;
            }
            RemoteViews views = render(ctx, provider);
            if (views != null) awm.updateAppWidget(ids, views);
        } catch (Exception ignored) {
            // never take the app (or the launcher) down over a widget refresh
        }
    }

    /** Re-render + push ONE widget id (flip actions re-render just the tapped widget). */
    static void pushId(Context ctx, Class<?> provider, int appWidgetId) {
        try {
            AppWidgetManager awm = AppWidgetManager.getInstance(ctx);
            if (awm == null) return;
            JSONObject state = WidgetState.load(ctx);
            BaseAstnumWidget w = newInstance(provider);
            RemoteViews views = w != null
                    ? w.build(ctx, state, appWidgetId)
                    : render(ctx, provider);
            if (views != null) awm.updateAppWidget(appWidgetId, views);
        } catch (Exception ignored) {
        }
    }

    /** Reflection-free-ish instantiation (providers have the default ctor). */
    private static BaseAstnumWidget newInstance(Class<?> provider) {
        try {
            return (BaseAstnumWidget) provider.getDeclaredConstructor().newInstance();
        } catch (Exception e) {
            return null;
        }
    }

    static RemoteViews render(Context ctx, Class<?> provider) {
        JSONObject state = WidgetState.load(ctx);
        BaseAstnumWidget w = newInstance(provider);
        return w == null ? null : w.build(ctx, state);
    }

    /* ── intents ────────────────────────────────────────────────────────── */

    /** Launch MainActivity via an astnum:// deep link (singleTask → onNewIntent). */
    static PendingIntent openApp(Context ctx, int requestCode, String uri) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
        i.setPackage(ctx.getPackageName());
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(
                ctx,
                requestCode,
                i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /**
     * Launch the native quick-add DIALOG (v1.22) — a tap on the quick-add
     * widget types a habit/note over the home screen; the app never opens.
     * uri: astnum://quickadd?type=habit|note
     */
    static PendingIntent openDialog(Context ctx, int requestCode, String uri) {
        Intent i = new Intent(ctx, QuickAddActivity.class);
        i.setData(Uri.parse(uri));
        return PendingIntent.getActivity(
                ctx,
                requestCode,
                i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Attach a dialog-launching click to a view (quick-add widget buttons). */
    static void clickDialog(RemoteViews views, int viewId, Context ctx, int requestCode, String uri) {
        try {
            views.setOnClickPendingIntent(viewId, openDialog(ctx, requestCode, uri));
        } catch (Exception ignored) {
        }
    }

    /** Broadcast to one of OUR providers (flip / quick actions) with the widget id. */
    static PendingIntent broadcast(Context ctx, int requestCode, Class<?> provider,
                                   String action, int appWidgetId, String extra, String value) {
        Intent i = new Intent(ctx, provider);
        i.setAction(action);
        i.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        if (extra != null) i.putExtra(extra, value);
        return PendingIntent.getBroadcast(
                ctx,
                requestCode,
                i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /* ── runtime setters (all wrapped) ──────────────────────────────────── */

    /** Drive a horizontal ProgressBar — GONE when there is nothing to show. */
    static void bar(RemoteViews views, int viewId, int done, int total) {
        try {
            if (total > 0) {
                views.setViewVisibility(viewId, View.VISIBLE);
                views.setProgressBar(viewId, total, Math.max(0, Math.min(done, total)), false);
            } else {
                views.setViewVisibility(viewId, View.GONE);
            }
        } catch (Exception ignored) {
        }
    }

    /** Set text (null-tolerant). */
    static void text(RemoteViews views, int viewId, String value) {
        try {
            views.setTextViewText(viewId, value == null ? "" : value);
        } catch (Exception ignored) {
        }
    }

    /** Set text color. */
    static void color(RemoteViews views, int viewId, int color) {
        try {
            views.setTextColor(viewId, color);
        } catch (Exception ignored) {
        }
    }

    /** Show/hide a view. */
    static void visible(RemoteViews views, int viewId, boolean show) {
        try {
            views.setViewVisibility(viewId, show ? View.VISIBLE : View.GONE);
        } catch (Exception ignored) {
        }
    }

    /** Tint an ImageView via setColorFilter (annotated @RemotableViewMethod). */
    static void tint(RemoteViews views, int viewId, int color) {
        try {
            views.setInt(viewId, "setColorFilter", color);
        } catch (Exception ignored) {
        }
    }

    /** Attach a deep-link click to a view. */
    static void click(RemoteViews views, int viewId, Context ctx, int requestCode, String uri) {
        try {
            views.setOnClickPendingIntent(viewId, openApp(ctx, requestCode, uri));
        } catch (Exception ignored) {
        }
    }

    /** Live session timer — a ticking Chronometer base from the epoch-ms start. */
    static void chronometer(RemoteViews views, int viewId, long startedAtMs) {
        try {
            long base = android.os.SystemClock.elapsedRealtime()
                    - (java.lang.System.currentTimeMillis() - startedAtMs);
            views.setChronometer(viewId, base, null, true);
        } catch (Exception ignored) {
        }
    }

    /* ── theme-aware color resolution (values/values-night auto-switch) ── */

    /** Resolve a themed color resource; fall back to the static palette. */
    static int themed(Context ctx, int resId, int fallback) {
        try {
            return ctx.getColor(resId);
        } catch (Exception e) {
            return fallback;
        }
    }

    static int accentCyan(Context ctx)  { return themed(ctx, R.color.widget_accent, ACCENT_CYAN); }
    static int accentLime(Context ctx)  { return themed(ctx, R.color.widget_accent_lime, ACCENT_LIME); }
    static int amber(Context ctx)       { return themed(ctx, R.color.widget_amber, STREAK_AMBER); }
    static int rose(Context ctx)        { return themed(ctx, R.color.widget_rose, PROTEIN_CORAL); }
    static int violet(Context ctx)       { return themed(ctx, R.color.widget_violet, FAT_VIOLET); }
    static int doneMint(Context ctx)    { return themed(ctx, R.color.widget_done, DONE_MINT); }
    static int checkMuted(Context ctx)  { return themed(ctx, R.color.widget_check_muted, CHECK_MUTED); }
    static int danger(Context ctx)      { return themed(ctx, R.color.widget_rose, DANGER); }
    static int streakAmber(Context ctx) { return themed(ctx, R.color.widget_amber, STREAK_AMBER); }
    static int textMuted(Context ctx)   { return themed(ctx, R.color.widget_text_secondary, TEXT_MUTED); }
    static int textDim(Context ctx)      { return themed(ctx, R.color.widget_text_tertiary, TEXT_DIM); }
    static int btnText(Context ctx)     { return themed(ctx, R.color.widget_btn_text, TEXT_MAIN); }

    /* ── the 1×1 macro ring painter (Canvas → Bitmap → setImageViewBitmap) ── */

    /**
     * Paints the macro ring: neutral track circle + accent progress arc
     * with rounded caps + the tinted glyph in the center. Track color is
     * theme-aware (values/values-night via the app context). Returns a
     * 256×256 bitmap; null only on a hard graphics failure.
     */
    static Bitmap ringBitmap(Context ctx, int pct, int accent, int glyphRes) {
        try {
            final int S = 256;
            final float STROKE = 26f;
            Bitmap bmp = Bitmap.createBitmap(S, S, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bmp);

            int track;
            try {
                track = ctx.getColor(R.color.widget_track);
            } catch (Exception e) {
                track = 0xFF293460;
            }

            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(STROKE);
            paint.setStrokeCap(Paint.Cap.ROUND);

            RectF box = new RectF(STROKE / 2f + 4f, STROKE / 2f + 4f,
                    S - STROKE / 2f - 4f, S - STROKE / 2f - 4f);

            // track
            paint.setColor(track);
            canvas.drawArc(box, 0f, 360f, false, paint);

            // progress (from 12 o'clock, clockwise)
            int p = Math.max(0, Math.min(100, pct));
            if (p > 0) {
                paint.setColor(accent);
                canvas.drawArc(box, -90f, 360f * p / 100f, false, paint);
            }

            // glyph in the center
            try {
                Drawable d = ctx.getResources().getDrawable(glyphRes, null);
                if (d != null) {
                    d = d.mutate();
                    d.setTint(accent);
                    int g = (int) (S * 0.34f);
                    int off = (S - g) / 2;
                    d.setBounds(off, off, off + g, off + g);
                    d.draw(canvas);
                }
            } catch (Exception ignored) {
            }
            return bmp;
        } catch (Exception e) {
            return null;
        }
    }

    /* palette (constant accents — theme surfaces live in values/values-night) */
    static final int TEXT_MAIN = 0xFFF2F7FF;
    static final int TEXT_MUTED = 0xFFA7B4D8;
    static final int TEXT_DIM = 0xFF7683A8;
    static final int ACCENT_CYAN = 0xFF22D3EE;
    static final int ACCENT_LIME = 0xFFA3E635;
    static final int DONE_MINT = 0xFF34D399;
    static final int CHECK_MUTED = 0xFF4C5980;
    static final int STREAK_AMBER = 0xFFFFB86B;
    static final int DANGER = 0xFFFB7185;
    static final int CARB_AMBER = 0xFFFFB86B;
    static final int PROTEIN_CORAL = 0xFFFB7185;
    static final int FAT_VIOLET = 0xFFA78BFA;
}
