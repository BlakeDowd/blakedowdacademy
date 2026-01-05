"use client";

import { useState, useEffect } from "react";
import { useStats } from "@/contexts/StatsContext";
import { ArrowLeft, Trophy, Target, Calendar, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface ActivityItem {
  id: string;
  type: 'round' | 'practice';
  title: string;
  date: string;
  xp: number;
  course?: string;
  score?: number;
  handicap?: number;
  drillTitle?: string;
  category?: string;
}

// XP per round
const XP_PER_ROUND = 500;

export default function ActivityPage() {
  const router = useRouter();
  const { rounds } = useStats();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setLoading(false);
      return;
    }

    const loadActivities = () => {
      const allActivities: ActivityItem[] = [];

      // Load rounds from StatsContext
      rounds.forEach((round, index) => {
        allActivities.push({
          id: `round-${index}`,
          type: 'round',
          title: `${round.holes} Holes at ${round.course || 'Unknown Course'}`,
          date: round.date,
          xp: XP_PER_ROUND,
          course: round.course,
          score: round.score || undefined,
          handicap: round.handicap || undefined,
        });
      });

      // Load practice sessions from activity history (new repeatable system)
      const practiceHistory = localStorage.getItem('practiceActivityHistory');
      if (practiceHistory) {
        try {
          const history = JSON.parse(practiceHistory);
          history.forEach((activity: any) => {
            allActivities.push({
              id: activity.id || `practice-${Date.now()}`,
              type: 'practice',
              title: activity.title || activity.drillTitle || 'Practice Session',
              date: activity.date,
              xp: activity.xp || 100,
              drillTitle: activity.drillTitle || activity.title,
              category: activity.category,
            });
          });
        } catch (e) {
          console.error('Error loading practice history:', e);
        }
      }
      
      // Fallback: Load from old userProgress system (for backward compatibility)
      const savedProgress = localStorage.getItem('userProgress');
      const savedDrills = localStorage.getItem('drillsData');
      
      if (savedProgress && savedDrills && (!practiceHistory || JSON.parse(practiceHistory).length === 0)) {
        try {
          const userProgress = JSON.parse(savedProgress);
          const drills = JSON.parse(savedDrills);
          
          // Only use old system if no new history exists
          userProgress.completedDrills?.forEach((drillId: string, index: number) => {
            const drill = drills.find((d: any) => d.id === drillId);
            if (drill) {
              const completionDate = new Date();
              completionDate.setDate(completionDate.getDate() - (userProgress.completedDrills.length - index));
              
              allActivities.push({
                id: `practice-${drillId}-${index}`,
                type: 'practice',
                title: drill.title || 'Practice Session',
                date: completionDate.toISOString().split('T')[0],
                xp: drill.xpValue || 100,
                drillTitle: drill.title,
                category: drill.category,
              });
            }
          });
        } catch (e) {
          console.error('Error loading practice sessions:', e);
        }
      }

      // Sort by date (newest first)
      allActivities.sort((a, b) => {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });

      setActivities(allActivities);
      setLoading(false);
    };

    loadActivities();

    // Listen for all updates
    const handleRoundsUpdated = () => {
      loadActivities();
    };
    
    const handleStorageChange = () => {
      loadActivities();
    };

    const handlePracticeUpdate = () => {
      loadActivities();
    };

    window.addEventListener('roundsUpdated', handleRoundsUpdated);
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('practiceActivityUpdated', handlePracticeUpdate);
    window.addEventListener('userProgressUpdated', handlePracticeUpdate);

    return () => {
      window.removeEventListener('roundsUpdated', handleRoundsUpdated);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('practiceActivityUpdated', handlePracticeUpdate);
      window.removeEventListener('userProgressUpdated', handlePracticeUpdate);
    };
  }, [rounds]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 pb-24 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#014421] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading activities...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="max-w-md mx-auto bg-white min-h-screen">
        {/* Header */}
        <div className="px-5 pt-6 pb-4 flex items-center gap-4 border-b border-gray-200">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Activity</h1>
        </div>

        {/* Activity List */}
        <div className="px-5 py-6">
          {activities.length === 0 ? (
            /* Empty State */
            <div className="text-center py-12">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(1, 68, 33, 0.1)' }}>
                <Target className="w-10 h-10" style={{ color: '#014421' }} />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">No activity yet</h2>
              <p className="text-gray-600 text-sm mb-6">
                Log your first round to start your journey to 8.7!
              </p>
              <Link
                href="/log-round"
                className="inline-block px-6 py-3 rounded-lg font-semibold text-white transition-all hover:shadow-lg"
                style={{ backgroundColor: '#014421' }}
              >
                Log Your First Round
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-all"
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ 
                        backgroundColor: activity.type === 'round' ? '#dcfce7' : '#dbeafe' 
                      }}
                    >
                      {activity.type === 'round' ? (
                        <Trophy
                          className="w-6 h-6"
                          style={{ color: '#014421' }}
                        />
                      ) : (
                        <Target
                          className="w-6 h-6"
                          style={{ color: '#3B82F6' }}
                        />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 mb-1">
                        {activity.title}
                      </h3>
                      
                      {/* Round Details */}
                      {activity.type === 'round' && (
                        <div className="flex items-center gap-3 text-sm text-gray-600 mb-2">
                          {activity.score && (
                            <span className="font-medium" style={{ color: '#FFA500' }}>
                              Score: {activity.score}
                            </span>
                          )}
                          {activity.handicap && (
                            <span>HCP: {activity.handicap.toFixed(1)}</span>
                          )}
                        </div>
                      )}

                      {/* Practice Details */}
                      {activity.type === 'practice' && activity.category && (
                        <div className="text-sm text-gray-600 mb-2">
                          <span className="px-2 py-0.5 rounded text-xs" style={{ backgroundColor: 'rgba(1, 68, 33, 0.1)', color: '#014421' }}>
                            {activity.category}
                          </span>
                        </div>
                      )}

                      {/* Date and XP */}
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <Calendar className="w-4 h-4" />
                          <span>{formatDate(activity.date)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Zap className="w-4 h-4" style={{ color: '#FFA500' }} />
                          <span className="text-sm font-semibold" style={{ color: '#FFA500' }}>
                            +{activity.xp} XP
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

