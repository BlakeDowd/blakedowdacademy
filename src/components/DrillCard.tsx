"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, Check, PlayCircle, File, RefreshCw, ChevronUp, ChevronDown } from "lucide-react";

type FacilityType = 'home' | 'range-mat' | 'range-grass' | 'bunker' | 'chipping-green' | 'putting-green';

interface DrillLevel {
  id: string;
  name: string;
  completed?: boolean;
}

interface DrillCardProps {
  drill: {
    id: string;
    title: string;
    category: string;
    estimatedMinutes: number;
    completed?: boolean;
    xpEarned?: number;
    isRound?: boolean;
    description?: string;
    pdf_url?: string;
    youtube_url?: string;
    video_url?: string;
    levels?: DrillLevel[];
    facility?: FacilityType;
  };
  dayIndex: number;
  drillIndex: number;
  actualDrillIndex: number;
  isSwapping?: boolean;
  justSwapped?: boolean;
  facilityInfo?: Record<FacilityType, { label: string; icon: any }>;
  onComplete: (dayIndex: number, drillIndex: number) => void;
  onSwap: (dayIndex: number, drillIndex: number) => void;
  onLevelToggle: (dayIndex: number, drillIndex: number, levelId: string, completed: boolean) => void;
  onYoutubeOpen: (url: string) => void;
  onExpandToggle?: (dayIndex: number, drillIndex: number) => void;
  defaultExpanded?: boolean; // FORCE VISIBILITY: Default to expanded
}

export default function DrillCard({
  drill,
  dayIndex,
  drillIndex,
  actualDrillIndex,
  isSwapping = false,
  justSwapped = false,
  facilityInfo,
  onComplete,
  onSwap,
  onLevelToggle,
  onYoutubeOpen,
  onExpandToggle,
  defaultExpanded = true, // FORCE VISIBILITY: Default to true
}: DrillCardProps) {
  // FIX THE TOGGLE: Default to expanded, but allow user to collapse
  const [isExpanded, setIsExpanded] = useState(defaultExpanded !== false); // Start expanded unless explicitly false
  const isCompleted = drill.completed || false;
  // SMOOTH TRANSITION: Show content only when expanded or just swapped
  const shouldShowContent = isExpanded || justSwapped;

  // Sync with parent's expand state - but allow user to toggle
  useEffect(() => {
    // Only sync if defaultExpanded changes, but don't override user's manual toggle
    if (defaultExpanded === true) {
      setIsExpanded(true);
    } else if (defaultExpanded === false) {
      setIsExpanded(false);
    }
  }, [defaultExpanded]);

  // FIX THE TOGGLE: Correctly toggle the isExpanded state
  const handleExpandToggle = () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    // Notify parent component of the toggle
    if (onExpandToggle && actualDrillIndex !== -1) {
      onExpandToggle(dayIndex, actualDrillIndex);
    }
  };

  return (
    <div className="relative w-full">
      <div
        className={`w-full p-4 rounded-lg border-2 transition-all ${
          isCompleted
            ? 'bg-green-50 border-green-300'
            : 'bg-white border-gray-200 hover:border-[#FFA500]'
        } ${justSwapped ? 'ring-2 ring-green-400' : ''} ${isExpanded ? 'border-[#014421]' : ''}`}
      >
        {/* Drill Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className={`text-lg font-semibold flex-1 ${
                  isCompleted ? 'text-green-700 line-through' : 'text-gray-900'
                }`}>
                  {isCompleted && (
                    <span className="inline-flex items-center mr-2">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    </span>
                  )}
                  {drill.title}
                </h4>
              </div>
            </div>
            
            {/* Target/Category */}
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-700">Target: {drill.category}</p>
              {drill.facility && facilityInfo && (
                <p className="text-sm text-gray-600">@ {facilityInfo[drill.facility].label}</p>
              )}
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <span>{drill.estimatedMinutes} min</span>
                </span>
                {drill.xpEarned && drill.xpEarned > 0 && (
                  <span className="text-[#FFA500] font-semibold">+{drill.xpEarned} XP</span>
                )}
              </div>
            </div>
          </div>
          
          {/* Expand/Collapse Button */}
          <button
            className="flex-shrink-0 p-2 hover:bg-gray-100 rounded-lg transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              handleExpandToggle();
            }}
          >
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-600" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-600" />
            )}
          </button>
        </div>
        
        {/* CORE UPGRADES: Always show content - cards expanded by default */}
        {shouldShowContent && (
          <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
            {drill.description && (
              <p className="text-sm text-gray-700 leading-relaxed">{drill.description}</p>
            )}
            
            {/* CORE UPGRADE: Watch Video Button (YouTube icon) */}
            <div className="flex gap-2 flex-wrap">
              {(drill.youtube_url || drill.video_url) ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onYoutubeOpen(drill.youtube_url || drill.video_url || '');
                  }}
                  className="px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-sm font-semibold text-white transition-colors flex items-center gap-2 flex-1 min-w-[140px]"
                >
                  <PlayCircle className="w-5 h-5" />
                  Watch Video
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="px-4 py-2.5 rounded-lg bg-gray-300 text-gray-500 text-sm font-semibold cursor-not-allowed flex items-center gap-2 flex-1 min-w-[140px] opacity-50"
                >
                  <PlayCircle className="w-5 h-5" />
                  No Video Link
                </button>
              )}
              
              {/* CORE UPGRADE: View PDF Button (File icon) */}
              {drill.pdf_url ? (
                <a
                  href={drill.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="px-4 py-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-semibold text-gray-700 transition-colors flex items-center gap-2 flex-1 min-w-[140px]"
                >
                  <File className="w-5 h-5" />
                  View PDF
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="px-4 py-2.5 rounded-lg bg-gray-300 text-gray-500 text-sm font-semibold cursor-not-allowed flex items-center gap-2 flex-1 min-w-[140px] opacity-50"
                >
                  <File className="w-5 h-5" />
                  No PDF Link
                </button>
              )}
            </div>
            
            {/* CORE UPGRADE: Goal/Reps heading and checklist */}
            <div className="space-y-2">
              <h5 className="text-sm font-semibold text-gray-900">Goal/Reps:</h5>
              {drill.levels && drill.levels.length > 0 ? (
                <div className="space-y-1.5">
                  {drill.levels.map((level) => (
                    <button
                      key={level.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (actualDrillIndex !== -1) {
                          onLevelToggle(dayIndex, actualDrillIndex, level.id, !level.completed);
                        }
                      }}
                      className="flex items-center gap-2 w-full text-left hover:bg-gray-50 p-2 rounded transition-colors"
                    >
                      <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        level.completed
                          ? 'bg-green-500 border-green-600'
                          : 'bg-white border-gray-300 hover:border-green-500'
                      }`}>
                        {level.completed && (
                          <Check className="w-3 h-3 text-white" />
                        )}
                      </div>
                      <span className={`text-sm ${
                        level.completed ? 'text-gray-500 line-through' : 'text-gray-700'
                      }`}>
                        {level.name}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">No goals/reps set for this drill</p>
              )}
            </div>
            
            {/* BUTTON PLACEMENT: Complete Drill and Swap Drill buttons stay here */}
            {/* Action Buttons - Side by Side */}
            <div className="flex gap-3 w-full">
              {/* Complete Drill Button - Primary */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (actualDrillIndex !== -1) {
                    onComplete(dayIndex, actualDrillIndex);
                  }
                }}
                disabled={isCompleted}
                className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                  isCompleted
                    ? 'bg-green-500 text-white cursor-not-allowed'
                    : 'bg-[#014421] text-white hover:bg-[#014421]/90'
                }`}
              >
                {isCompleted ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Completed
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Complete Drill
                  </>
                )}
              </button>
              
              {/* Swap Drill Button - Secondary */}
              {!drill.isRound && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (actualDrillIndex !== -1) {
                      onSwap(dayIndex, actualDrillIndex);
                    }
                  }}
                  disabled={isSwapping}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSwapping ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Swapping...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Swap Drill
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
        
        {isSwapping && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-lg">
            <RefreshCw className="w-6 h-6 animate-spin text-[#014421]" />
          </div>
        )}
      </div>
    </div>
  );
}
