"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CloudRain,
  Flag,
  Mountain,
  RotateCcw,
  Shuffle,
  Sprout,
  Thermometer,
  Undo2,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { BreakdownBar, BreakdownCard, EveryShotList, FocusCard, RateRow } from "@/components/combine/CombineBreakdown";
import {
  ENVIRONMENTAL_SHOTS,
  FINISH_LABELS,
  WIND_LABELS,
  environmentalReport,
  pinLabel,
  planShot,
  randomScenarios,
  type EnvironmentalDetails,
  type EnvironmentalShot,
  type Finish,
  type Scenario,
} from "@/lib/environmentalDrill";

const WIND_ARROWS: Record<string, LucideIcon> = {
  into: ArrowDown,
  helping: ArrowUp,
  leftToRight: ArrowRight,
  rightToLeft: ArrowLeft,
};

function conditionChips(s: Scenario): { icon: LucideIcon; text: string; tone?: string }[] {
  const chips: { icon: LucideIcon; text: string; tone?: string }[] = [];
  chips.push(
    s.wind
      ? { icon: WIND_ARROWS[s.wind.dir] ?? Wind, text: `${s.wind.kmh} km/h ${WIND_LABELS[s.wind.dir]}`, tone: "bg-sky-50 text-sky-800" }
      : { icon: Wind, text: "No wind" },
  );
  chips.push({
    icon: Thermometer,
    text: `${s.tempC}°C${s.tempC <= 10 ? " · cold" : s.tempC >= 30 ? " · hot" : ""}`,
    tone: s.tempC <= 10 ? "bg-blue-50 text-blue-800" : s.tempC >= 30 ? "bg-orange-50 text-orange-800" : undefined,
  });
  if (s.rain) chips.push({ icon: CloudRain, text: "Raining", tone: "bg-slate-100 text-slate-800" });
  chips.push({
    icon: Flag,
    text: s.greens === "firm" ? "Firm, fast greens" : s.greens === "soft" ? "Soft greens" : "Normal greens",
    tone: s.greens === "firm" ? "bg-amber-50 text-amber-800" : s.greens === "soft" ? "bg-green-50 text-green-800" : undefined,
  });
  chips.push({ icon: Sprout, text: s.lie === "flyer" ? "Light rough (flyer)" : s.lie === "tight" ? "Tight lie" : "Fairway lie" });
  if (s.elevation) chips.push({ icon: Mountain, text: `${Math.abs(s.elevation)} m ${s.elevation > 0 ? "uphill" : "downhill"}` });
  chips.push({ icon: Flag, text: pinLabel(s), tone: s.trouble ? "bg-red-50 text-red-800" : undefined });
  return chips;
}

const FINISH_TONES: Record<Finish, string> = {
  green: "bg-[#014421] text-white",
  short: "bg-amber-200 text-amber-900",
  long: "bg-sky-200 text-sky-900",
  left: "bg-red-200 text-red-900",
  right: "bg-red-200 text-red-900",
};

/** 10 range shots with random conditions. Plan it, hit it, log where it finished. Ends with a report. */
export default function EnvironmentalDrill({
  saving,
  onSave,
}: {
  saving: boolean;
  onSave: (score: number, reps: number, details: EnvironmentalDetails) => Promise<boolean>;
}) {
  const [phase, setPhase] = useState<"intro" | "shot" | "done">("intro");
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [shots, setShots] = useState<EnvironmentalShot[]>([]);
  const [showPlan, setShowPlan] = useState(false);
  const [saved, setSaved] = useState(false);

  const start = () => {
    setScenarios(randomScenarios());
    setShots([]);
    setShowPlan(false);
    setSaved(false);
    setPhase("shot");
  };

  const log = (finish: Finish) => {
    const scenario = scenarios[shots.length];
    if (!scenario) return;
    const all = [...shots, { scenario, finish }];
    setShots(all);
    setShowPlan(false);
    if (all.length >= scenarios.length) setPhase("done");
  };

  const undo = () => {
    if (!shots.length) return;
    setShots(shots.slice(0, -1));
    setShowPlan(false);
  };

  const reroll = () => {
    const [fresh] = randomScenarios(1);
    if (!fresh) return;
    setScenarios(scenarios.map((s, i) => (i === shots.length ? fresh : s)));
    setShowPlan(false);
  };

  const shell = (body: React.ReactNode) => (
    <div className="space-y-3 rounded-xl bg-white p-3 ring-1 ring-gray-200" onClick={(e) => e.stopPropagation()}>
      {body}
    </div>
  );

  if (phase === "intro") {
    return shell(
      <>
        <p className="text-sm font-semibold text-gray-900">Environmental · {ENVIRONMENTAL_SHOTS} shots</p>
        <ol className="list-decimal space-y-1 pl-4 text-xs leading-snug text-gray-600">
          <li>Each shot gets random conditions: wind, temperature, rain, firm or soft greens, lie, slope and pin.</li>
          <li>Work out your plays-like number, club and shot before you look at the plan.</li>
          <li>Pick a target on the range at that distance and hit it.</li>
          <li>Log where it finished. At the end you get a report on what to practise.</li>
        </ol>
        <p className="text-[11px] text-gray-500">Scored on greens hit out of {ENVIRONMENTAL_SHOTS}.</p>
        <button
          type="button"
          onClick={start}
          className="w-full rounded-lg bg-[#014421] py-2.5 text-sm font-bold text-white hover:bg-[#013320]"
        >
          Start {ENVIRONMENTAL_SHOTS} shots
        </button>
      </>,
    );
  }

  if (phase === "shot") {
    const scenario = scenarios[shots.length]!;
    const plan = planShot(scenario);
    const greens = shots.filter((s) => s.finish === "green").length;
    return shell(
      <>
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Shot {shots.length + 1} of {scenarios.length}
          </p>
          <p className="text-xs font-semibold tabular-nums text-gray-500">
            {greens} green{greens === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex gap-1">
          {scenarios.map((_, i) => {
            const s = shots[i];
            return (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full ${s ? (s.finish === "green" ? "bg-[#014421]" : "bg-red-400") : i === shots.length ? "bg-[#FFA500]" : "bg-gray-200"}`}
              />
            );
          })}
        </div>

        <div className="rounded-xl bg-gray-50 p-3 ring-1 ring-gray-200">
          <div className="flex items-baseline justify-between">
            <p className="text-3xl font-extrabold tabular-nums text-gray-900">
              {scenario.distance}
              <span className="ml-1 text-base font-bold text-gray-400">m to the pin</span>
            </p>
            <button
              type="button"
              onClick={reroll}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-gray-500 hover:bg-gray-200"
            >
              <Shuffle className="h-3.5 w-3.5" aria-hidden />
              New conditions
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {conditionChips(scenario).map((c) => (
              <span
                key={c.text}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${c.tone ?? "bg-white text-gray-700 ring-1 ring-gray-200"}`}
              >
                <c.icon className="h-3.5 w-3.5" aria-hidden />
                {c.text}
              </span>
            ))}
          </div>
        </div>

        {showPlan ? (
          <div className="space-y-2 rounded-xl bg-[#014421]/5 p-3 ring-1 ring-[#014421]/20">
            <div className="grid grid-cols-3 gap-1.5 text-center">
              {[
                { label: "Plays like", value: `${plan.playsLike} m` },
                { label: "Carry it", value: `${plan.carry} m` },
                {
                  label: "Aim",
                  value: plan.aim
                    ? `${plan.aim.metres} m ${plan.aim.side}`
                    : scenario.trouble && scenario.pin !== "middle"
                      ? "Centre"
                      : "At the pin",
                },
              ].map((s) => (
                <div key={s.label} className="rounded-lg bg-white py-1.5 ring-1 ring-gray-200">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{s.label}</p>
                  <p className="text-sm font-bold tabular-nums text-gray-900">{s.value}</p>
                </div>
              ))}
            </div>
            <ul className="list-disc space-y-1 pl-4 text-xs leading-snug text-gray-700">
              {plan.calls.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowPlan(true)}
            className="w-full rounded-lg border-2 border-dashed border-[#014421]/30 py-2 text-xs font-bold text-[#014421] hover:bg-[#014421]/5"
          >
            Worked it out? Check the plan
          </button>
        )}

        <div>
          <p className="mb-1.5 text-xs font-semibold text-gray-700">Where did it finish?</p>
          <button
            type="button"
            onClick={() => log("green")}
            className="mb-1.5 w-full rounded-lg bg-[#014421] py-2.5 text-sm font-bold text-white hover:bg-[#013320]"
          >
            On the green
          </button>
          <div className="grid grid-cols-4 gap-1.5">
            {(["short", "long", "left", "right"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => log(f)}
                className="rounded-lg bg-gray-100 py-2 text-xs font-bold text-gray-800 hover:bg-gray-200"
              >
                {FINISH_LABELS[f]}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={undo}
          disabled={!shots.length}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-200 disabled:opacity-30"
        >
          <Undo2 className="h-3.5 w-3.5" aria-hidden />
          Back
        </button>
      </>,
    );
  }

  const report = environmentalReport(shots);
  return shell(
    <>
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Environmental</p>
        <p className="text-3xl font-extrabold tabular-nums text-[#014421]">
          {report.greens}
          <span className="text-base font-bold text-gray-400">/{shots.length} greens</span>
        </p>
        <span className="mt-1 inline-flex rounded-full bg-[#014421]/10 px-3 py-1 text-xs font-bold text-[#014421]">
          GIR {Math.round((report.greens / (shots.length || 1)) * 100)}%
        </span>
      </div>

      <FocusCard title={report.focus.title} lines={report.focus.lines} />

      <BreakdownCard title="Where it finished">
        <BreakdownBar
          segments={[
            { label: "Green", value: report.greens, tone: "bg-[#014421]" },
            { label: "Short", value: report.misses.short, tone: "bg-amber-500" },
            { label: "Long", value: report.misses.long, tone: "bg-sky-400" },
            { label: "Left", value: report.misses.left, tone: "bg-red-400" },
            { label: "Right", value: report.misses.right, tone: "bg-rose-600" },
          ]}
        />
      </BreakdownCard>

      <BreakdownCard title="By condition" aside="Greens">
        <div className="space-y-3">
          {report.conditions.map((c) => (
            <RateRow
              key={c.tag}
              label={c.tag}
              made={c.made}
              total={c.total}
              flag={c.tag === report.weakest ? "Work on" : null}
            />
          ))}
        </div>
      </BreakdownCard>

      <EveryShotList>
        {shots.map((s, i) => {
          const plan = planShot(s.scenario);
          return (
            <li key={i} className="flex items-start gap-3 py-2">
              <span className="w-8 shrink-0 rounded-lg bg-gray-100 py-1 text-center text-xs font-bold text-gray-800">{i + 1}</span>
              <span className="min-w-0 flex-1 text-xs leading-snug text-gray-700">
                <span className="font-semibold text-gray-900">
                  {s.scenario.distance} m, plays {plan.playsLike} m
                </span>
                <br />
                {conditionChips(s.scenario)
                  .map((c) => c.text)
                  .join(" · ")}
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${FINISH_TONES[s.finish]}`}>
                {s.finish === "green" ? "Green" : FINISH_LABELS[s.finish]}
              </span>
            </li>
          );
        })}
      </EveryShotList>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={start}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-200 disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          {saved ? "New conditions" : "Restart"}
        </button>
        {!saved && (
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              if (await onSave(report.greens, shots.length, { kind: "environmental", shots })) setSaved(true);
            }}
            className="flex-1 rounded-lg bg-[#014421] py-2.5 text-sm font-bold text-white hover:bg-[#013320] disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save score"}
          </button>
        )}
      </div>
    </>,
  );
}
