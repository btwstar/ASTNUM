package app.astnum.mobile.widget;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONObject;

import app.astnum.mobile.R;

/**
 * «إضافة سريعة» (2×1) — REAL add-from-widget (v1.22): a tap opens the
 * native QuickAdd DIALOG over the home screen; the typed title is committed
 * into the app's actual database through the live bridge (process alive)
 * or the headless same-origin bundle (process dead), and every home-screen
 * widget refreshes immediately. The app itself never opens.
 *
 * All labels arrive pre-formatted (language-aware) in the snapshot's
 * quickAdd section — including the dialog's own strings.
 */
public class QuickAddWidget extends BaseAstnumWidget {

    @Override
    RemoteViews build(Context ctx, JSONObject state) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_quick_add);

        JSONObject qa = WidgetState.obj(state, "quickAdd");
        boolean en = state != null && "en".equals(WidgetState.str(state, "lang", "ar"));

        // habit button
        WidgetRender.text(views, R.id.qa_habit_label,
                WidgetState.str(qa, "habitLabel", en ? "Habit" : "عادة"));
        WidgetRender.text(views, R.id.qa_habit_hint,
                WidgetState.str(qa, "habitHint", en ? "Type & save without opening" : "اكتب واحفظ بدون فتح التطبيق"));
        // note button
        WidgetRender.text(views, R.id.qa_note_label,
                WidgetState.str(qa, "noteLabel", en ? "Note" : "ملاحظة"));
        WidgetRender.text(views, R.id.qa_note_hint,
                WidgetState.str(qa, "noteHint", en ? "Type & save without opening" : "اكتب واحفظ بدون فتح التطبيق"));

        // one tap each → the native capture dialog opens over the home screen
        WidgetRender.clickDialog(views, R.id.qa_habit, ctx, 85, "astnum://quickadd?type=habit");
        WidgetRender.clickDialog(views, R.id.qa_note, ctx, 86, "astnum://quickadd?type=note");
        // the card itself still deep-links into the app
        WidgetRender.click(views, R.id.widget_root, ctx, 84, "astnum://open?tab=today");
        return views;
    }
}
