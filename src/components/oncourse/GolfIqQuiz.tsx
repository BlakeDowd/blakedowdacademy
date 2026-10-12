"use client";

import { useEffect, useState } from "react";
import { Brain, Check, ChevronRight, RotateCcw, Trophy, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { GolfIqPicture, hasGolfIqPicture } from "@/components/oncourse/GolfIqPictures";
import { GOLF_IQ_LEVEL_1, GOLF_IQ_TOPIC_LABEL, type GolfIqLevel, type GolfIqQuestion, type GolfIqTopic } from "@/lib/golfIqQuiz";

type ShuffledQuestion = GolfIqQuestion & { choices: string[]; answer: string };
type Answer = { questionId: string; picked: string; correct: boolean };

function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function buildRound(level: GolfIqLevel): ShuffledQuestion[] {
  return shuffle(level.questions).map((q) => ({ ...q, choices: shuffle(q.options), answer: q.options[0] }));
}

function bestKey(level: number, userId: string | undefined) {
  return `golfIqBest:${level}:${userId ?? "guest"}`;
}

function readBest(key: string): number | null {
  try {
    const n = Number(window.localStorage.getItem(key));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function writeBest(key: string, score: number) {
  try {
    window.localStorage.setItem(key, String(score));
  } catch {
    /* storage full or blocked */
  }
}

export function GolfIqQuiz({ level = GOLF_IQ_LEVEL_1 }: { level?: GolfIqLevel }) {
  const { user } = useAuth();
  const storageKey = bestKey(level.level, user?.id);
  const total = level.questions.length;
  const [status, setStatus] = useState<"intro" | "active" | "complete">("intro");
  const [round, setRound] = useState<ShuffledQuestion[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [best, setBest] = useState<number | null>(null);

  useEffect(() => {
    const stored = readBest(storageKey);
    queueMicrotask(() => setBest(stored));
  }, [storageKey]);

  const start = () => {
    setRound(buildRound(level));
    setAnswers([]);
    setPicked(null);
    setSubmitted(false);
    setStatus("active");
  };

  const index = answers.length;
  const current = round[index];
  const score = answers.filter((a) => a.correct).length + (submitted && picked === current?.answer ? 1 : 0);

  const pick = (choice: string) => {
    if (submitted || !current) return;
    setPicked(choice);
  };

  const submit = () => {
    if (picked) setSubmitted(true);
  };

  const next = () => {
    if (!current || !picked || !submitted) return;
    const nextAnswers = [...answers, { questionId: current.id, picked, correct: picked === current.answer }];
    setAnswers(nextAnswers);
    setPicked(null);
    setSubmitted(false);
    if (nextAnswers.length >= total) {
      const finalScore = nextAnswers.filter((a) => a.correct).length;
      if (best == null || finalScore > best) {
        writeBest(storageKey, finalScore);
        setBest(finalScore);
      }
      setStatus("complete");
    }
  };

  if (status === "intro") {
    const topics = [...new Set(level.questions.map((q) => q.topic))];
    return (
      <div className="w-full space-y-4">
        <section className="relative overflow-hidden rounded-2xl bg-[#014421] p-5 text-white shadow-sm">
          <Brain className="absolute -right-4 -top-4 h-28 w-28 text-white/10" aria-hidden />
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#FFA500]">Level {level.level} · Basics</p>
          <h3 className="mt-1 text-xl font-extrabold">How well do you know the game?</h3>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[`${total} questions`, "~5 min", `Pass: ${level.passMark}/${total}`].map((chip) => (
              <span key={chip} className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold">
                {chip}
              </span>
            ))}
          </div>
          {best != null && (
            <p className="mt-3 text-xs text-white/80">
              Your best: <span className="font-bold text-white">{best}/{total}</span>
              {best >= level.passMark ? " · Passed" : ""}
            </p>
          )}
        </section>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 text-sm text-gray-700">
          <p className="font-bold text-gray-900">What&apos;s covered</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {topics.map((t) => (
              <span key={t} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
                {GOLF_IQ_TOPIC_LABEL[t]}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Pick your answer and press Submit to see why it&apos;s right or wrong.
          </p>
        </div>

        <button
          type="button"
          onClick={start}
          className="w-full rounded-2xl bg-[#014421] py-4 text-base font-bold text-white shadow-sm transition-colors hover:bg-[#01331a]"
        >
          Start the quiz
        </button>
      </div>
    );
  }

  if (status === "complete") {
    const passed = score >= level.passMark;
    const byTopic = new Map<GolfIqTopic, { right: number; total: number }>();
    for (const q of round) {
      const row = byTopic.get(q.topic) ?? { right: 0, total: 0 };
      row.total += 1;
      if (answers.find((a) => a.questionId === q.id)?.correct) row.right += 1;
      byTopic.set(q.topic, row);
    }
    const missed = round.filter((q) => !answers.find((a) => a.questionId === q.id)?.correct);
    return (
      <div className="w-full space-y-4">
        <section className={`rounded-2xl p-5 text-center shadow-sm ${passed ? "bg-[#014421] text-white" : "border border-gray-100 bg-white"}`}>
          {passed && (
            <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#FFA500]">
              <Trophy className="h-5 w-5 text-white" aria-hidden />
            </span>
          )}
          <p className={`text-xs font-bold uppercase tracking-wider ${passed ? "text-[#FFA500]" : "text-gray-400"}`}>
            {passed ? `Level ${level.level} passed` : "Not quite"}
          </p>
          <p className={`mt-1 text-5xl font-extrabold tabular-nums ${passed ? "text-white" : "text-[#014421]"}`}>
            {score}/{total}
          </p>
          <p className={`mt-1 text-sm ${passed ? "text-white/80" : "text-gray-500"}`}>
            {passed ? "Solid golf brain. Level 2 is next." : `You need ${level.passMark} to pass. Go through the ones you missed and try again.`}
          </p>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-500">By topic</p>
          <ul className="space-y-2.5">
            {[...byTopic.entries()].map(([topic, row]) => {
              const pct = Math.round((row.right / row.total) * 100);
              return (
                <li key={topic}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-semibold text-gray-800">{GOLF_IQ_TOPIC_LABEL[topic]}</span>
                    <span className="tabular-nums text-gray-500">
                      {row.right}/{row.total}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full ${pct >= 80 ? "bg-[#014421]" : pct >= 50 ? "bg-[#FFA500]" : "bg-red-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {missed.length > 0 && (
          <section className="space-y-2">
            <p className="px-1 text-xs font-bold uppercase tracking-wide text-gray-500">Ones you missed</p>
            {missed.map((q) => (
              <div key={q.id} className="rounded-2xl border border-gray-100 bg-white p-4 text-sm">
                <p className="font-semibold text-gray-900">{q.question}</p>
                <p className="mt-2 flex items-start gap-1.5 text-[#014421]">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span className="font-semibold">{q.answer}</span>
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-gray-600">{q.explanation}</p>
              </div>
            ))}
          </section>
        )}

        <button
          type="button"
          onClick={start}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#014421] py-4 text-base font-bold text-white shadow-sm transition-colors hover:bg-[#01331a]"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          Try again
        </button>
      </div>
    );
  }

  if (!current) return null;
  const isCorrect = picked === current.answer;
  const hasPicture = hasGolfIqPicture(current.id);

  return (
    <div className="w-full space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-gray-500">
          <span>
            Question {index + 1} of {total}
          </span>
          <span className="tabular-nums text-[#014421]">{score} correct</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-[#014421] transition-[width] duration-300" style={{ width: `${(index / total) * 100}%` }} />
        </div>
      </div>

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <span className="inline-block rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#FFA500]">
          {GOLF_IQ_TOPIC_LABEL[current.topic]}
        </span>
        <p className="mt-2 text-lg font-bold leading-snug text-gray-900">{current.question}</p>
        {hasPicture && (
          <div className="mt-3">
            <GolfIqPicture questionId={current.id} />
          </div>
        )}
      </section>

      <div className="space-y-2" role="radiogroup" aria-label="Answers">
        {current.choices.map((choice) => {
          const isAnswer = choice === current.answer;
          const isPicked = choice === picked;
          const tone = !submitted
            ? isPicked
              ? "border-[#014421] bg-[#014421]/5 text-[#014421]"
              : "border-gray-200 bg-white text-gray-800 hover:border-gray-300"
            : isAnswer
              ? "border-[#014421] bg-[#014421] text-white"
              : isPicked
                ? "border-red-500 bg-red-50 text-red-700"
                : "border-gray-100 bg-white text-gray-400";
          return (
            <button
              key={choice}
              type="button"
              role="radio"
              aria-checked={isPicked}
              onClick={() => pick(choice)}
              disabled={submitted}
              className={`flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-sm font-semibold transition-colors ${tone}`}
            >
              {!submitted && (
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    isPicked ? "border-[#014421]" : "border-gray-300"
                  }`}
                  aria-hidden
                >
                  {isPicked && <span className="h-2.5 w-2.5 rounded-full bg-[#014421]" />}
                </span>
              )}
              <span className="flex-1">{choice}</span>
              {submitted && isAnswer && <Check className="h-5 w-5 shrink-0" aria-hidden />}
              {submitted && isPicked && !isAnswer && <X className="h-5 w-5 shrink-0" aria-hidden />}
            </button>
          );
        })}
      </div>

      {submitted && (
        <div
          aria-live="polite"
          className={`rounded-2xl p-4 text-sm ${isCorrect ? "bg-green-50 text-[#014421]" : "bg-red-50 text-red-800"}`}
        >
          <p className="font-bold">{isCorrect ? "Correct" : "Not quite"}</p>
          <p className="mt-1 leading-relaxed text-gray-700">{current.explanation}</p>
        </div>
      )}

      {submitted ? (
        <button
          type="button"
          onClick={next}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-[#014421] py-4 text-base font-bold text-white shadow-sm transition-colors hover:bg-[#01331a]"
        >
          {index + 1 >= total ? "See my score" : "Next question"}
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          onClick={submit}
          disabled={!picked}
          className="w-full rounded-2xl bg-[#FFA500] py-4 text-base font-bold text-white shadow-sm transition-colors hover:bg-[#e69500] disabled:bg-gray-200 disabled:text-gray-500"
        >
          {picked ? "Submit answer" : "Pick an answer"}
        </button>
      )}
    </div>
  );
}

export default GolfIqQuiz;
