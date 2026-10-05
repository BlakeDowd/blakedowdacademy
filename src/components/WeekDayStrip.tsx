"use client";

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export type WeekDayStatus = { count: number; allDone: boolean };

type WeekDayStripProps = {
  weekMonday: Date;
  todayIndex: number;
  selectedDay: number;
  onSelect: (dayIndex: number) => void;
  days: WeekDayStatus[];
  className?: string;
};

export function WeekDayStrip({
  weekMonday,
  todayIndex,
  selectedDay,
  onSelect,
  days,
  className = "mb-4",
}: WeekDayStripProps) {
  return (
    <div className={`grid grid-cols-7 gap-1.5 ${className}`}>
      {DAY_LETTERS.map((letter, idx) => {
        const date = new Date(weekMonday);
        date.setDate(weekMonday.getDate() + idx);
        const { count = 0, allDone = false } = days[idx] ?? {};
        const isSelected = idx === selectedDay;
        const isToday = idx === todayIndex;
        return (
          <button
            key={idx}
            type="button"
            onClick={() => onSelect(idx)}
            aria-label={`${DAY_NAMES[idx]}${count ? `, ${count} planned` : ""}`}
            aria-pressed={isSelected}
            className={`flex flex-col items-center rounded-xl py-2 transition-colors ${
              isSelected
                ? "bg-[#014421] text-white"
                : isToday
                  ? "bg-orange-50 text-gray-900 ring-1 ring-[#FFA500]"
                  : "bg-gray-50 text-gray-700 hover:bg-gray-100"
            }`}
          >
            <span className={`text-[10px] font-semibold ${isSelected ? "text-white/80" : "text-gray-400"}`}>
              {letter}
            </span>
            <span className="text-sm font-bold tabular-nums">{date.getDate()}</span>
            <span
              className={`mt-1 h-1.5 w-1.5 rounded-full ${
                count === 0
                  ? "bg-transparent"
                  : allDone
                    ? isSelected
                      ? "bg-green-300"
                      : "bg-green-500"
                    : "bg-[#FFA500]"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
