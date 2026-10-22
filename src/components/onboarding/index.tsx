"use client";

import React, { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAppStore, type OnboardingGoal } from "@/lib/store/app-store";
import { haptic } from "@/lib/haptics";
import { AstnumLogo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { LanguageSheet } from "@/components/settings/language-sheet";
import { getLangMeta } from "@/lib/i18n/languages";
import { Bell, Check, CheckCircle2, Dumbbell, Languages, Repeat2, Scale } from "lucide-react";

const GOALS: Array<{ id: OnboardingGoal; icon: React.ElementType; titleKey: string; descKey: string }> = [
  { id: "habits", icon: Repeat2, titleKey: "onboarding.goal.habits", descKey: "onboarding.goal.habitsDesc" },
  { id: "fitness", icon: Dumbbell, titleKey: "onboarding.goal.fitness", descKey: "onboarding.goal.fitnessDesc" },
  { id: "both", icon: Scale, titleKey: "onboarding.goal.both", descKey: "onboarding.goal.bothDesc" },
];

export default function Onboarding() {
  const { t } = useI18n();
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const lang = useAppStore((s) => s.lang);
  const [step, setStep] = useState(0); // 0 = goal, 1 = notifications
  const [goal, setGoal] = useState<OnboardingGoal | null>(null);
  const [notifDone, setNotifDone] = useState(false); // brief success beat before finishing
  const [langSheet, setLangSheet] = useState(false);
  const total = 2;

  const requestNotifications = async () => {
    if (notifDone) return; // guard double-tap during the success beat
    haptic("medium");
    let granted = false;
    try {
      if (typeof Notification !== "undefined") {
        if (Notification.permission === "default") {
          const res = await Notification.requestPermission();
          granted = res === "granted";
        } else {
          granted = Notification.permission === "granted";
        }
      }
    } catch {
      /* native builds use @capacitor/local-notifications instead */
    }
    if (granted) {
      setNotifDone(true);
      window.setTimeout(finish, 900);
    } else {
      finish();
    }
  };

  const finish = () => {
    haptic("success");
    completeOnboarding(goal ?? "both");
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      {/* ambient glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 start-1/3 h-72 w-72 rounded-full bg-grad-from/15 blur-3xl" />
        <div className="absolute bottom-0 end-0 h-64 w-64 rounded-full bg-grad-to/15 blur-3xl" />
      </div>

      {/* language switch — any of the 160 registered languages */}
      <div className="mx-auto w-full max-w-md px-6 pt-6">
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 rounded-full px-4"
            onClick={() => {
              haptic("light");
              setLangSheet(true);
            }}
          >
            <Languages className="h-4 w-4" aria-hidden />
            <span dir="auto">{getLangMeta(lang)?.native ?? lang}</span>
          </Button>
        </div>
      </div>

      <LanguageSheet open={langSheet} onOpenChange={setLangSheet} />

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 pb-8">
        {/* v1.12: instant step swap — the wait-mode slide left an EMPTY frame
            between steps (dark "black screen" flash, doubled on the success
            beat); plain atomic conditional swap = no empty frame at all */}
          {step === 0 && (
            <div className="w-full">
              <div className="mb-6 flex flex-col items-center text-center">
                <AstnumLogo size={96} className="mb-3 drop-shadow-[0_0_28px_color-mix(in_oklab,var(--grad-from)_38%,transparent)]" />
                <p className="mb-1 text-sm font-extrabold uppercase tracking-[0.35em] text-muted-foreground/90">ASTNUM</p>
                <h1 className="text-2xl font-bold">{t("onboarding.goal.title")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("onboarding.goal.subtitle")}</p>
              </div>
              <div className="flex flex-col gap-3" role="radiogroup" aria-label={t("onboarding.goal.title")}>
                {GOALS.map(({ id, icon: Icon, titleKey, descKey }) => {
                  const selected = goal === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        haptic("light");
                        setGoal(id);
                      }}
                      className={`flex min-h-16 items-center gap-4 rounded-2xl border p-4 text-start transition-all duration-200 ${
                        selected
                          ? "border-primary/70 bg-primary/10 shadow-[0_0_0_1px_var(--primary)]"
                          : "border-border bg-card hover:bg-accent"
                      }`}
                    >
                      <span
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                          selected ? "bg-gradient-accent text-primary-foreground" : "bg-muted text-foreground"
                        }`}
                      >
                        <Icon className="h-6 w-6" aria-hidden />
                      </span>
                      <span className="flex-1">
                        <span className="block font-semibold">{t(titleKey)}</span>
                        <span className="block text-sm text-muted-foreground">{t(descKey)}</span>
                      </span>
                      {selected && <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col items-center text-center">
              <span
                className={`mb-6 flex h-20 w-20 items-center justify-center rounded-full ${
                  notifDone ? "bg-success/12 text-success" : "bg-primary/12 text-primary"
                }`}
              >
                {notifDone ? <CheckCircle2 className="h-9 w-9" aria-hidden /> : <Bell className="h-9 w-9" aria-hidden />}
              </span>
              <h2 className="text-2xl font-bold">
                {notifDone ? t("onboarding.notif.enabled") : t("onboarding.notif.title")}
              </h2>
              {!notifDone && (
                <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  {t("onboarding.notif.subtitle")}
                </p>
              )}
            </div>
          )}
      </div>

      {/* footer actions */}
      <div className="mx-auto w-full max-w-md px-6 pb-safe">
        {/* progress dots */}
        <div className="mb-5 flex justify-center gap-1.5" aria-hidden>
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? "w-6 bg-gradient-accent" : i < step ? "w-1.5 bg-primary/60" : "w-1.5 bg-muted"
              }`}
            />
          ))}
        </div>

        <div className="flex gap-3">
          {step > 0 && (
            <Button variant="ghost" className="rounded-2xl px-6 text-muted-foreground" onClick={() => setStep((s) => s - 1)}>
              {t("action.back")}
            </Button>
          )}
          <Button
            className="h-12 flex-1 rounded-2xl bg-gradient-accent text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25"
            disabled={step === 0 && goal === null}
            onClick={step === 1 ? requestNotifications : () => { haptic("light"); setStep(1); }}
          >
            {step === 1 ? t("onboarding.notif.enable") : t("action.continue")}
          </Button>
        </div>

        {step === 0 ? (
          <Button
            variant="ghost"
            className="mt-2 w-full rounded-2xl text-muted-foreground"
            onClick={finish}
          >
            {t("action.skip")}
          </Button>
        ) : (
          <Button
            variant="ghost"
            className="mt-2 w-full rounded-2xl text-muted-foreground"
            disabled={notifDone}
            onClick={finish}
          >
            {t("onboarding.notif.later")}
          </Button>
        )}
      </div>
    </div>
  );
}
