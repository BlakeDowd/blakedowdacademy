export type LessonType = "video" | "text" | "pdf" | "quiz";

export interface Lesson {
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
