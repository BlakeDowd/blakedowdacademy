"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  Circle,
  CircleDot,
  Target,
  X,
  Play,
  FileText,
  Video,
  HelpCircle,
  Search,
  BookOpen,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useAuth } from "@/contexts/AuthContext";
import { logActivity } from "@/lib/activity";
import { fetchDrillsCatalogRows } from "@/lib/fetchDrillsCatalog";
// Drills / video authoring field guide: `src/lib/academyContentSchema.ts`

type LessonType = "video" | "text" | "pdf" | "quiz" | "drill";

interface Lesson {
  id: string;
  title: string;
  type: LessonType;
  description: string;
  source: string;
  chapter_name: string;
  module_name: string;
  category: string;
  sort_order: number;
  duration?: string;
  xpValue: number;
}

interface Chapter {
  name: string;
  lessons: Lesson[];
  completedCount: number;
}

interface Module {
  name: string;
  chapters: Chapter[];
  lessons: Lesson[]; // flat for backward compat
  completedCount: number;
}

const FALLBACK_LESSONS: Lesson[] = [
  { id: "1", title: "Mastering Your Short Game", type: "video", description: "Learn chipping and putting.", source: "", chapter_name: "Putting Foundations", module_name: "The Full Game Masterclass", category: "Short Game", sort_order: 1, duration: "8:42", xpValue: 50 },
  { id: "2", title: "The Pendulum Stroke", type: "video", description: "The pendulum stroke technique.", source: "", chapter_name: "Putting Foundations", module_name: "The Full Game Masterclass", category: "Short Game", sort_order: 2, duration: "5:20", xpValue: 30 },
  { id: "3", title: "Putting Practice Routine", type: "drill", description: "A 30-day putting routine.", source: `Focus on stance and grip.`, chapter_name: "Chipping Basics", module_name: "The Full Game Masterclass", category: "Short Game", sort_order: 3, xpValue: 75 },
  { id: "4", title: "Short Game Quiz", type: "quiz", description: "Test your knowledge.", source: "", chapter_name: "Chipping Basics", module_name: "The Full Game Masterclass", category: "Short Game", sort_order: 4, xpValue: 100 },
];

/** Placeholder YouTube IDs (e.g. joke embeds) — show “coming soon” instead. */
const PLACEHOLDER_YOUTUBE_VIDEO_IDS = new Set(["dQw4w9WgXcQ"]);

function extractYoutubeVideoId(source: string): string | null {
  if (!source) return null;
  if (source.includes("youtube.com/embed/")) {
    return source.split("youtube.com/embed/")[1]?.split("?")[0] || null;
  }
  if (source.includes("youtu.be/")) {
    return source.split("youtu.be/")[1]?.split("?")[0] || null;
  }
  if (source.includes("youtube.com/watch")) {
    const m = source.match(/[?&]v=([^&]+)/);
    return m?.[1] ?? null;
  }
  return null;
}

function isPlayableVideoSource(source: string | undefined | null): boolean {
  const id = source ? extractYoutubeVideoId(source) : null;
  if (!id) return false;
  return !PLACEHOLDER_YOUTUBE_VIDEO_IDS.has(id);
}

function resolveYoutubeEmbedUrl(source: string): string | null {
  if (!isPlayableVideoSource(source)) return null;
  const id = extractYoutubeVideoId(source);
  return id ? `https://www.youtube.com/embed/${id}` : null;
}

function getThumbnailUrl(source: string) {
  if (!isPlayableVideoSource(source)) return null;
  const id = extractYoutubeVideoId(source);
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
}

function VideoComingSoon() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-b from-gray-900 to-black px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
        <Video className="h-7 w-7 text-gray-400" aria-hidden />
      </div>
      <p className="text-lg font-semibold text-white">Video Coming Soon</p>
      <p className="max-w-xs text-sm text-gray-400">
        This lesson video is being prepared. You can still read the notes below.
      </p>
    </div>
  );
}

/** Shown in the header on the main library screen and in lesson breadcrumbs. */
const ONLINE_LEARNING_LIBRARY = "Online Learning Library";
const COURSE_TITLE = "Golf Fundamentals Course";
const CATEGORIES = ["All", "Driving", "Short Game", "Putting", "Irons", "Mental"];
const HERO_IMAGE = "https://images.unsplash.com/photo-1535131749006-b7f58c99034b?q=80&w=1200&auto=format&fit=crop";

function getLessonTypeTag(type: LessonType) {
  if (type === "video") return { label: "Video", icon: Video };
  if (type === "quiz") return { label: "Quiz", icon: HelpCircle };
  if (type === "drill") return { label: "Drill", icon: Target };
  return { label: "Text", icon: FileText };
}

interface LibraryCategoryScrollerProps {
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
}

function LibraryCategoryScroller({
  selectedCategory,
  onCategoryChange,
}: LibraryCategoryScrollerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(maxScroll > 4 && el.scrollLeft < maxScroll - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateScrollState();

    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", updateScrollState);

    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);

    return () => {
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", updateScrollState);
      observer.disconnect();
    };
  }, [updateScrollState]);

  const scrollByAmount = (direction: -1 | 1) => {
    scrollRef.current?.scrollBy({ left: direction * 140, behavior: "smooth" });
  };

  return (
    <div className="relative -mx-4 px-4">
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollByAmount(-1)}
          className="absolute left-1 top-1/2 z-10 -translate-y-1/2 rounded-full border border-gray-200 bg-white p-1.5 text-gray-600 shadow-md hover:bg-gray-50"
          aria-label="Scroll categories left"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
      )}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollByAmount(1)}
          className="absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded-full border border-gray-200 bg-white p-1.5 text-gray-600 shadow-md hover:bg-gray-50"
          aria-label="Scroll categories right"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      )}
      <div
        ref={scrollRef}
        role="tablist"
        aria-label="Filter by focus area"
        onScroll={updateScrollState}
        className={`library-category-scroll flex w-full max-w-full flex-nowrap gap-2 overflow-x-auto pb-2 ${
          canScrollLeft ? "pl-8" : ""
        } ${canScrollRight ? "pr-8" : ""}`}
      >
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            role="tab"
            aria-selected={selectedCategory === cat}
            onClick={() => onCategoryChange(cat)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
              selectedCategory === cat
                ? "bg-[#014421] text-white shadow-sm"
                : "bg-white text-gray-600 border border-gray-200 hover:border-gray-300"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>
    </div>
  );
}

interface LibrarySearchFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  showHint?: boolean;
  onBrowseAll?: () => void;
  className?: string;
}

function LibrarySearchFilters({
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  showHint = false,
  onBrowseAll,
  className = "",
}: LibrarySearchFiltersProps) {
  return (
    <div className={`min-w-0 ${className}`}>
      {showHint && (
        <p className="mb-2 text-xs text-gray-500">Search lessons or filter by focus area.</p>
      )}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden />
        <input
          type="search"
          placeholder="Search lessons…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-9 pr-9 py-2.5 bg-white border border-gray-200 rounded-xl text-sm shadow-sm focus:ring-2 focus:ring-[#FFA500] focus:border-[#FFA500] outline-none"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <LibraryCategoryScroller
        selectedCategory={selectedCategory}
        onCategoryChange={onCategoryChange}
      />
      {onBrowseAll && (
        <button
          type="button"
          onClick={onBrowseAll}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#014421]/20 bg-white px-3 py-2.5 text-sm font-semibold text-[#014421] shadow-sm transition-colors hover:bg-green-50"
        >
          <BookOpen className="h-4 w-4 shrink-0" aria-hidden />
          Browse full lesson list
        </button>
      )}
    </div>
  );
}

function LibraryPageContent() {
  const { user } = useAuth();
  
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [isViewingLesson, setIsViewingLesson] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(() => new Set());
  const sidebarOpenPrev = useRef(false);
  const modulesCountPrev = useRef(0);
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(() => new Set());
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("libraryCompletedLessons");
    if (saved) {
      try {
        const arr = JSON.parse(saved) as string[];
        setCompletedIds(new Set(arr));
      } catch {
        // ignore
      }
    }
  }, []);

  // Fetch Lessons
  useEffect(() => {
    let cancelled = false;
    async function fetchLessons() {
      try {
        const raw = await fetchDrillsCatalogRows();
        const data = [...raw].sort(
          (a, b) =>
            Number((a as any).sort_order ?? (a as any).estimated_minutes ?? 0) -
            Number((b as any).sort_order ?? (b as any).estimated_minutes ?? 0)
        );

        if (cancelled) return;
        if (data.length === 0) {
          setLessons(FALLBACK_LESSONS);
        } else {
          const mapped: Lesson[] = data.map((row: any) => {
            const videoUrl = row.video_url || row.source || row.youtube_link || "";
            const type = (row.type as string) || (videoUrl ? "video" : "text");
            return {
              id: String(row.id),
              title: String(row.drill_name || row.title || "Untitled"),
              type: (type === "quiz" ? "quiz" : type === "drill" ? "drill" : type === "pdf" ? "pdf" : type === "video" ? "video" : "text") as LessonType,
              description: String(row.description || ""),
              source: videoUrl || String(row.description || ""),
              chapter_name: String(row.chapter_name || row.category || "Uncategorized"),
              module_name: String(row.module_name || row.category || "General"),
              category: String(row.category || "General"),
              sort_order: Number(row.sort_order ?? row.estimated_minutes ?? 0),
              duration: row.duration ? String(row.duration) : undefined,
              xpValue: Number(row.xp_value ?? row.xp ?? 50),
            };
          });
          setLessons(mapped);
        }
      } catch (e) {
        if (!cancelled) setLessons(FALLBACK_LESSONS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchLessons();
    return () => { cancelled = true; };
  }, []);

  // Filter lessons
  const filteredLessons = useMemo(() => {
    return lessons.filter(l => {
      const matchesSearch = l.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            l.module_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCat = selectedCategory === "All" || l.category === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [lessons, searchQuery, selectedCategory]);

  // Group flat drills into Module -> Chapter -> Lesson hierarchy using Array.reduce
  const modules = useMemo(() => {
    type Acc = Record<string, Record<string, Lesson[]>>;
    const nested = filteredLessons.reduce<Acc>((acc, lesson) => {
      const mod = lesson.module_name || "General";
      const ch = lesson.chapter_name || "Uncategorized";
      if (!acc[mod]) acc[mod] = {};
      if (!acc[mod][ch]) acc[mod][ch] = [];
      acc[mod][ch].push(lesson);
      return acc;
    }, {});

    return Object.entries(nested).map(([modName, chaptersMap]) => {
      const chapterList = Object.entries(chaptersMap).map(([chName, chLessons]) => {
        chLessons.sort((a, b) => a.sort_order - b.sort_order);
        return {
          name: chName,
          lessons: chLessons,
          completedCount: chLessons.filter(l => completedIds.has(l.id)).length,
          minSort: Math.min(...chLessons.map(l => l.sort_order)),
        };
      });
      const chapters: Chapter[] = chapterList
        .sort((a, b) => a.minSort - b.minSort)
        .map(({ minSort: _, ...ch }) => ch);
      const lessons = chapters.flatMap(c => c.lessons);
      const completedCount = lessons.filter(l => completedIds.has(l.id)).length;
      return { name: modName, chapters, lessons, completedCount };
    });
  }, [filteredLessons, completedIds]);

  // Flat list of lessons for Prev/Next
  const flatLessons = useMemo(() => modules.flatMap(m => m.lessons), [modules]);
  const activeLessonIndex = activeLesson ? flatLessons.findIndex(l => l.id === activeLesson.id) : -1;

  // If URL has ?drill=id, open lesson view and select that lesson
  useEffect(() => {
    if (flatLessons.length === 0 || typeof window === "undefined") return;
    const drillId = new URLSearchParams(window.location.search).get("drill");
    if (drillId) {
      const found = flatLessons.find(l => l.id === drillId);
      if (found) {
        setSelectedModule(found.module_name);
        setActiveLesson(found);
        setIsViewingLesson(true);
        const initialCollapsed = new Set<string>();
        modules.forEach(m => {
          if (m.name !== found.module_name) initialCollapsed.add(m.name);
        });
        setCollapsedModules(initialCollapsed);
      }
    }
  }, [flatLessons, modules]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("libraryCompletedLessons", JSON.stringify(Array.from(completedIds)));
    }
  }, [completedIds]);

  /** When Search lessons opens, every module starts collapsed until expanded. */
  useEffect(() => {
    const justOpened = sidebarOpen && !sidebarOpenPrev.current;
    sidebarOpenPrev.current = sidebarOpen;

    const n = modules.length;
    if (n === 0) {
      modulesCountPrev.current = 0;
      return;
    }
    const becameReadyWhileOpen = sidebarOpen && modulesCountPrev.current === 0;
    modulesCountPrev.current = n;

    if (justOpened || becameReadyWhileOpen) {
      setCollapsedModules(new Set(modules.map((m) => m.name)));
    }
  }, [sidebarOpen, modules]);

  const toggleModule = useCallback((name: string) => {
    setCollapsedModules(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const selectLesson = useCallback((lesson: Lesson) => {
    setActiveLesson(lesson);
    setIsViewingLesson(true);
    setSidebarOpen(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("libraryLastWatchedLessonId", lesson.id);
    }
    const mainEl = document.querySelector('main');
    if (mainEl) mainEl.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const backToDashboard = useCallback(() => {
    setIsViewingLesson(false);
  }, []);

  const backToModules = useCallback(() => {
    setSelectedModule(null);
    setExpandedChapters(new Set());
  }, []);

  const selectModule = useCallback(
    (modName: string) => {
      setSelectedModule(modName);
      const mod = modules.find((m) => m.name === modName);
      if (!mod) {
        setExpandedChapters(new Set());
        return;
      }
      const withIncomplete = mod.chapters
        .filter((ch) => ch.lessons.some((l) => !completedIds.has(l.id)))
        .map((ch) => `${mod.name}::${ch.name}`);
      const keys =
        withIncomplete.length > 0
          ? withIncomplete
          : mod.chapters.map((ch) => `${mod.name}::${ch.name}`);
      setExpandedChapters(new Set(keys));
    },
    [modules, completedIds],
  );

  const toggleChapter = useCallback((key: string) => {
    setExpandedChapters(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const goPrev = useCallback(() => {
    if (activeLessonIndex > 0) selectLesson(flatLessons[activeLessonIndex - 1]);
  }, [activeLessonIndex, flatLessons, selectLesson]);

  const goNext = useCallback(() => {
    if (activeLesson) setCompletedIds(prev => new Set(prev).add(activeLesson.id));
    if (activeLessonIndex < flatLessons.length - 1) {
      selectLesson(flatLessons[activeLessonIndex + 1]);
    }
    if (activeLesson && user?.id) {
      logActivity(user.id, "video", `Completed ${activeLesson.title}`);
    }
  }, [activeLesson, activeLessonIndex, flatLessons, user?.id, selectLesson]);

  const progressPercent =
    flatLessons.length > 0
      ? Math.round((completedIds.size / flatLessons.length) * 100)
      : 0;

  const progressRingCirc = 2 * Math.PI * 15.9;

  const getStatusIcon = (lesson: Lesson) => {
    const done = completedIds.has(lesson.id);
    const active = activeLesson?.id === lesson.id;
    if (done) return <Check className="w-4 h-4 text-[#014421]" />;
    if (active) return <CircleDot className="w-4 h-4 text-[#FFA500]" aria-hidden="true" />;
    return <Circle className="w-4 h-4 text-gray-300" aria-hidden="true" />;
  };

  const videoUrl =
    activeLesson && activeLesson.type === "video"
      ? resolveYoutubeEmbedUrl(activeLesson.source || "")
      : null;

  const totalXP = useMemo(() => {
    return flatLessons
      .filter(l => completedIds.has(l.id))
      .reduce((sum, l) => sum + l.xpValue, 0);
  }, [flatLessons, completedIds]);

  /** Next lesson in path order, preferring first incomplete (e-learning “resume”). */
  const continueLesson = useMemo(() => {
    if (flatLessons.length === 0) return null;
    const firstIncomplete = flatLessons.find((l) => !completedIds.has(l.id));
    if (firstIncomplete) return firstIncomplete;
    if (typeof window !== "undefined") {
      const id = localStorage.getItem("libraryLastWatchedLessonId");
      const last = id ? flatLessons.find((l) => l.id === id) : null;
      if (last) return last;
    }
    return flatLessons[0];
  }, [flatLessons, completedIds]);

  const downloadPlayerReport = useCallback(() => {
    window.print();
  }, []);

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedCategory("All");
  }, []);

  const searchFilterProps = {
    searchQuery,
    onSearchChange: setSearchQuery,
    selectedCategory,
    onCategoryChange: setSelectedCategory,
  };

  const sidebarContent = (
    <div className="flex flex-col h-full w-full">
      <div className="px-4 py-3 border-b border-gray-100 bg-white shrink-0">
        <LibrarySearchFilters {...searchFilterProps} showHint />
      </div>

      {/* Lesson List: Module -> Chapter -> Lesson */}
      <div className="flex-1 overflow-y-auto custom-scrollbar w-full py-4">
        {modules.map((mod) => (
          <div key={mod.name} className="mb-2">
            <button
              onClick={() => toggleModule(mod.name)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-left bg-white rounded-lg border border-gray-100 shadow-sm hover:border-gray-200 transition-colors"
            >
              <div className="flex flex-col gap-1 min-w-0 pr-2">
                <span className="text-sm font-bold text-gray-900 truncate">{mod.name}</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#FFA500]"
                      style={{ width: `${mod.lessons.length ? Math.round((mod.completedCount / mod.lessons.length) * 100) : 0}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-500 font-medium">{mod.completedCount}/{mod.lessons.length}</span>
                </div>
              </div>
              {collapsedModules.has(mod.name) ? (
                <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              )}
            </button>
            {!collapsedModules.has(mod.name) && (
              <div className="pl-2 space-y-1">
                {mod.chapters.map((ch) => (
                  <div key={`${mod.name}::${ch.name}`}>
                    <div className="px-2 py-1 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{ch.name}</div>
                    {ch.lessons.map((lesson) => {
                      const tag = getLessonTypeTag(lesson.type);
                      const TagIcon = tag.icon;
                      const isActive = activeLesson?.id === lesson.id;
                      return (
                        <button
                          key={lesson.id}
                          onClick={() => { setSelectedModule(mod.name); selectLesson(lesson); }}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-r-lg text-left transition-colors border-l-4 ${
                            isActive ? "bg-amber-50/50 border-[#FFA500] pl-2" : "hover:bg-gray-50 border-transparent"
                          }`}
                        >
                          <span className="shrink-0 flex items-center justify-center w-5">{getStatusIcon(lesson)}</span>
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm truncate ${isActive ? "font-bold text-gray-900" : "font-medium text-gray-700"}`}>{lesson.title}</div>
                            <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] text-gray-500">
                              <TagIcon className="w-3 h-3" />
                              {tag.label} +{lesson.xpValue} XP {lesson.duration && `• ${lesson.duration}`}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col w-full h-full bg-gray-50 relative">
      {loading && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-gray-50">
          <div className="text-[#014421] font-semibold">Loading course...</div>
        </div>
      )}
      {/* Header - Sticky */}
      <header className="library-no-print sticky top-0 z-40 flex min-h-16 w-full shrink-0 items-center justify-between gap-2 bg-[#014421] px-3 py-2 text-white shadow-md sm:min-h-[4.25rem] sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          {isViewingLesson ? (
            <button
              onClick={backToDashboard}
              className="flex items-center justify-center p-1.5 -ml-1 rounded-lg hover:bg-white/10 text-white"
              aria-label="Back to Library"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : selectedModule ? (
            <button
              onClick={backToModules}
              className="flex items-center justify-center p-1.5 -ml-1 rounded-lg hover:bg-white/10 text-white"
              aria-label="Back to Modules"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : (
            <div className="w-9" />
          )}
          <h1 className="truncate text-sm font-bold leading-snug sm:text-base">
            {isViewingLesson
              ? COURSE_TITLE
              : selectedModule
                ? selectedModule
                : ONLINE_LEARNING_LIBRARY}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="flex items-center justify-center rounded-xl bg-white/15 p-2 text-white ring-1 ring-white/30 hover:bg-white/25"
            aria-label={`Browse lessons — ${ONLINE_LEARNING_LIBRARY}`}
          >
            <BookOpen className="h-5 w-5 shrink-0" aria-hidden />
          </button>
          <div className="flex flex-col items-end gap-0.5">
            <div className="flex items-baseline gap-0.5 text-white">
              <span className="text-2xl font-extrabold tabular-nums leading-none sm:text-3xl">{progressPercent}</span>
              <span className="text-lg font-bold leading-none text-white/90 sm:text-xl">%</span>
            </div>
            <span className="text-xs font-semibold text-white/80">Complete</span>
            <div className="mt-0.5 h-2 w-[4.75rem] overflow-hidden rounded-full bg-black/30 sm:w-28">
              <div
                className="h-full rounded-full bg-[#FFA500] transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Drawer Curriculum */}
      {sidebarOpen && (
        <>
          <div
            className="library-no-print fixed inset-0 z-[60] bg-black/60"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <aside className="sidebar library-no-print fixed inset-y-0 left-1/2 -translate-x-1/2 w-full max-w-md z-[70] bg-white flex flex-col shadow-2xl transition-transform duration-300 ease-out">
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 bg-gray-50 shrink-0">
              <div className="min-w-0 pr-2">
                <span className="block text-lg font-bold leading-tight text-gray-900">
                  {ONLINE_LEARNING_LIBRARY}
                </span>
                <span className="text-xs text-gray-500">{COURSE_TITLE}</span>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-2 rounded-full hover:bg-gray-200 text-gray-600 bg-white shadow-sm"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {sidebarContent}
            </div>
          </aside>
        </>
      )}

      {/* Main Content Area */}
      <main className="scrollable-content flex-1 flex flex-col w-full max-w-md mx-auto relative min-w-0 overflow-y-auto overflow-x-clip">
        {!selectedModule && !isViewingLesson ? (
          /* === LIBRARY DASHBOARD === */
          <div className="w-full flex flex-col pb-24">
            {/* Hero */}
            <div className="relative mx-4 mt-4 overflow-hidden rounded-2xl shadow-md">
              <img
                src={HERO_IMAGE}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#014421]/95 via-[#014421]/55 to-[#014421]/25" />
              <div className="relative flex flex-col items-center gap-4 px-5 py-8 text-center">
                <img
                  src="/logo.png"
                  alt={COURSE_TITLE}
                  className="h-16 w-auto max-w-[260px] object-contain drop-shadow-lg sm:h-20"
                />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#FFA500]">
                    {ONLINE_LEARNING_LIBRARY}
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-white sm:text-xl">{COURSE_TITLE}</h2>
                  <p className="mt-1 text-xs text-white/80">
                    {flatLessons.length} lessons · {modules.length} module{modules.length !== 1 ? "s" : ""}
                  </p>
                </div>
                {continueLesson && (
                  <div className="w-full max-w-sm space-y-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedModule(continueLesson.module_name);
                        selectLesson(continueLesson);
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FFA500] px-4 py-3 text-sm font-bold text-black shadow-lg transition-colors hover:bg-amber-400"
                    >
                      <Play className="h-5 w-5 fill-current" aria-hidden />
                      {completedIds.has(continueLesson.id) ? "Review lesson" : "Continue learning"}
                    </button>
                    <p className="line-clamp-2 px-1 text-center text-[11px] text-white/85">
                      <span className="font-medium text-white">{continueLesson.module_name}</span>
                      <span className="text-white/50"> · </span>
                      {continueLesson.title}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Course Stats */}
            <div className="px-4 py-4 grid grid-cols-3 gap-3">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col items-center">
                <div className="relative h-[4.5rem] w-[4.5rem] sm:h-20 sm:w-20">
                  <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36" aria-hidden>
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="2.5" />
                    <circle
                      cx="18"
                      cy="18"
                      r="15.9"
                      fill="none"
                      stroke="#FFA500"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeDasharray={progressRingCirc}
                      strokeDashoffset={progressRingCirc * (1 - progressPercent / 100)}
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-base font-extrabold tabular-nums text-gray-900 sm:text-lg">
                    {progressPercent}%
                  </span>
                </div>
                <span className="mt-1.5 text-xs font-medium text-gray-500">Complete</span>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-gray-900">{completedIds.size}</span>
                <span className="text-[10px] font-medium text-gray-500">/ {flatLessons.length}</span>
                <span className="text-[10px] font-medium text-gray-500 mt-0.5">Lessons Watched</span>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-[#014421]">{totalXP}</span>
                <span className="text-[10px] font-medium text-gray-500 mt-0.5">XP Earned</span>
              </div>
            </div>

            {/* Search & filters */}
            <div className="px-4 pb-2">
              <LibrarySearchFilters
                {...searchFilterProps}
                onBrowseAll={() => setSidebarOpen(true)}
              />
            </div>

            {/* Module Cards */}
            <div className="px-4 pb-8">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-gray-900">Modules</h3>
                {(searchQuery || selectedCategory !== "All") && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="text-sm font-medium text-[#014421] hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </div>
              {modules.length === 0 ? (
                <div className="py-12 text-center bg-white rounded-xl border border-gray-100">
                  <Search className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-600 text-sm font-medium">No lessons match your search</p>
                  <p className="text-gray-500 text-xs mt-1">Try different keywords or clear filters to see all modules</p>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-3 px-4 py-2 rounded-lg bg-[#014421] text-white text-sm font-semibold hover:opacity-90"
                  >
                    Show all
                  </button>
                </div>
              ) : (
              <div className="flex flex-col gap-4">
                {modules.map((mod) => {
                  const firstLesson = mod.lessons.find((l) => l.type === "video") || mod.lessons[0];
                  const thumbUrl =
                    firstLesson &&
                    firstLesson.type === "video" &&
                    isPlayableVideoSource(firstLesson.source)
                      ? getThumbnailUrl(firstLesson.source)
                      : HERO_IMAGE;
                  const chapterCount = mod.chapters.length;
                  const modProgress = mod.lessons.length
                    ? Math.round((mod.completedCount / mod.lessons.length) * 100)
                    : 0;
                  return (
                    <button
                      key={mod.name}
                      type="button"
                      onClick={() => selectModule(mod.name)}
                      className="group w-full overflow-hidden rounded-2xl border border-gray-100 bg-white text-left shadow-sm transition-all hover:border-[#014421]/25 hover:shadow-md"
                    >
                      <div className="relative aspect-[2.2/1] overflow-hidden bg-gray-200">
                        <img
                          src={thumbUrl ?? HERO_IMAGE}
                          alt=""
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-3">
                          <span className="line-clamp-2 text-base font-bold leading-snug text-white">
                            {mod.name}
                          </span>
                          <span className="mt-0.5 block text-xs text-white/80">
                            {mod.lessons.length} lessons · {chapterCount} chapter{chapterCount !== 1 ? "s" : ""}
                          </span>
                        </div>
                        {modProgress === 100 && (
                          <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-[#014421] px-2 py-1 text-[10px] font-bold text-white shadow">
                            <Check className="h-3 w-3" aria-hidden />
                            Done
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 px-3 py-3">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#FFA500] rounded-full transition-all"
                            style={{ width: `${modProgress}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-gray-600">
                          {mod.completedCount}/{mod.lessons.length}
                        </span>
                        <ChevronRight className="h-5 w-5 shrink-0 text-gray-400 group-hover:text-[#014421]" />
                      </div>
                    </button>
                  );
                })}
              </div>
              )}
            </div>
          </div>
        ) : selectedModule && !isViewingLesson ? (
          /* === DEEP-DIVE: Chapters & Lessons === */
          (() => {
            const mod = modules.find(m => m.name === selectedModule);
            if (!mod) return null;
            return (
              <div className="w-full flex flex-col pb-24">
                <div className="px-4 py-4 bg-white border-b border-gray-100 shrink-0">
                  <h2 className="text-lg font-bold text-gray-900">{mod.name}</h2>
                  <p className="text-sm text-gray-500 mt-0.5">{mod.lessons.length} lessons in {mod.chapters.length} chapter{mod.chapters.length !== 1 ? "s" : ""}</p>
                  <div className="mt-3">
                    <LibrarySearchFilters {...searchFilterProps} />
                  </div>
                </div>
                <div className="flex-1 px-4 py-4">
                  {mod.chapters.map(ch => {
                    const chKey = `${mod.name}::${ch.name}`;
                    const isExpanded = expandedChapters.has(chKey);
                    return (
                      <div key={chKey} className="mb-4 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => toggleChapter(chKey)}
                          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50/50 transition-colors"
                        >
                          <span className="text-sm font-bold text-gray-900">{ch.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-500">{ch.completedCount}/{ch.lessons.length}</span>
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="border-t border-gray-100 pl-4">
                            {ch.lessons.map((lesson, idx) => {
                              const tag = getLessonTypeTag(lesson.type);
                              const TagIcon = tag.icon;
                              const done = completedIds.has(lesson.id);
                              const isActive = activeLesson?.id === lesson.id;
                              const isLast = idx === ch.lessons.length - 1;
                              return (
                                <div key={lesson.id} className="relative flex">
                                  <div className="relative flex flex-col items-center pr-3">
                                    <div className={`absolute top-5 left-[9px] w-0.5 bg-gray-200 ${isLast ? "h-0" : "h-[calc(100%+8px)]"}`} aria-hidden />
                                    <span className="relative z-10 shrink-0 w-5 h-5 flex items-center justify-center mt-2.5">
                                      {done ? <Check className="w-4 h-4 text-[#014421]" /> : <Circle className="w-4 h-4 text-gray-300" />}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => selectLesson(lesson)}
                                    className={`flex-1 flex flex-col sm:flex-row sm:items-center gap-2 py-3 pr-4 text-left border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50 transition-colors ${isActive ? "bg-amber-50/50" : ""}`}
                                  >
                                    <div className="flex-1 min-w-0">
                                      <span className={`text-sm block truncate ${isActive ? "font-bold text-gray-900" : "font-medium text-gray-700"}`}>{lesson.title}</span>
                                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 text-[10px] font-medium text-gray-600">
                                          <TagIcon className="w-3 h-3" />
                                          {tag.label}
                                        </span>
                                        <span className="text-[10px] font-semibold text-[#014421]">+{lesson.xpValue} XP</span>
                                        {lesson.duration && <span className="text-[10px] text-gray-500">{lesson.duration}</span>}
                                      </div>
                                    </div>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()
        ) : activeLesson ? (
          /* === LESSON PLAYER === */
          <div id="lesson-pdf-content" className="relative w-full flex flex-col pb-24">
            {/* Save as PDF - FAB top-right of content */}
            <div className="report-button library-no-print absolute top-4 right-4 z-30">
              <button
                type="button"
                onClick={downloadPlayerReport}
                className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg border-2 border-gray-200 bg-white/95 backdrop-blur-sm text-gray-700 hover:bg-gray-50 hover:border-[#014421] transition-colors shadow-sm text-sm font-semibold"
                aria-label="Save as PDF"
              >
                <FileText className="w-4 h-4" />
                Save as PDF
              </button>
            </div>

            {/* Print-only header */}
            <div className="lesson-print-header hidden print:block">
              Player Report — {activeLesson.title}
            </div>

            {/* Video Player / Thumbnail Stage */}
            <div className="lesson-video-container w-full bg-black aspect-video shrink-0 shadow-md print:min-h-[120px] relative">
              {videoUrl ? (
                <>
                  <iframe
                    src={videoUrl}
                    className="w-full h-full border-0 print:hidden"
                    allowFullScreen
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    title={activeLesson.title}
                  />
                  <div className="hidden print:block absolute inset-0 min-h-[120px] bg-gray-800 flex items-center justify-center text-gray-400 text-sm">
                    [Video: {activeLesson.title}]
                  </div>
                </>
              ) : activeLesson.type === "video" ? (
                <VideoComingSoon />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-900">
                  {activeLesson.type === "quiz" ? (
                    <HelpCircle className="w-12 h-12 text-gray-600" />
                  ) : (
                    <FileText className="w-12 h-12 text-gray-600" />
                  )}
                </div>
              )}
            </div>

            {/* Content Body */}
            <div className="flex-1 bg-white px-5 py-6 relative">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 text-[#FFA500] text-[10px] font-bold uppercase tracking-wider mb-3">
                {activeLesson.type === "video" && <Play className="w-3 h-3" />}
                {activeLesson.type === "text" && <FileText className="w-3 h-3" />}
                {activeLesson.type === "quiz" && <HelpCircle className="w-3 h-3" />}
                {activeLesson.type === "drill" && <Target className="w-3 h-3" />}
                {activeLesson.type === "pdf" && <FileText className="w-3 h-3" />}
                {activeLesson.type} Lesson
              </div>
              
              <p className="mb-1 text-[11px] font-medium text-gray-500">
                {ONLINE_LEARNING_LIBRARY}
                <span className="text-gray-300"> · </span>
                {COURSE_TITLE}
                <span className="text-gray-300"> · </span>
                {activeLesson.module_name}
                <span className="text-gray-300"> · </span>
                {activeLesson.chapter_name}
              </p>
              <h2 className="text-2xl font-black text-gray-900 mb-2 leading-tight">
                {activeLesson.title}
              </h2>

              {/* Stats row for PDF */}
              <div className="lesson-stat-card flex flex-wrap gap-3 text-xs text-gray-500 mb-4">
                <span>+{activeLesson.xpValue} XP</span>
                {activeLesson.duration && <span>{activeLesson.duration}</span>}
                <span>{activeLesson.type}</span>
              </div>
              
              <div className="w-full h-px bg-gray-100 my-4" />

              {activeLesson.description && (
                <div className="text-base text-gray-600 leading-relaxed whitespace-pre-wrap">
                  {activeLesson.description}
                </div>
              )}
              
              {activeLesson.type === "text" && activeLesson.source && (
                <div className="mt-4 prose prose-sm max-w-none text-gray-800 leading-relaxed [&>p]:mb-4">
                  <ReactMarkdown>{activeLesson.source}</ReactMarkdown>
                </div>
              )}

              {/* Print-only footer */}
              <div className="lesson-print-footer hidden print:block">
                Blake Dowd Golf — blakedowdgolf.com
              </div>
            </div>
          </div>
        ) : null}
      </main>

      {/* Floating Action Bar (Fixed above bottom global nav which is usually h-20/5rem) */}
      {activeLesson && (
        <div className="bottom-nav library-no-print fixed bottom-[5rem] left-1/2 -translate-x-1/2 w-full max-w-md px-4 py-3 bg-white/90 backdrop-blur-md border-t border-gray-200 z-[45] shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
          <div className="flex items-center gap-3">
            <button
              onClick={goPrev}
              disabled={activeLessonIndex === 0}
              className="flex-[0.4] py-3 px-2 rounded-xl font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm text-center flex items-center justify-center gap-1"
            >
              Previous
            </button>
            <button
              onClick={goNext}
              className="flex-[0.6] py-3 px-2 rounded-xl font-bold text-white bg-[#FFA500] shadow-[0_4px_14px_rgba(255,165,0,0.3)] hover:opacity-90 transition-opacity text-sm text-center flex items-center justify-center gap-1"
            >
              {activeLessonIndex < flatLessons.length - 1
                ? "Next Lesson"
                : "Complete Course"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LibraryPage() {
  return <LibraryPageContent />;
}
