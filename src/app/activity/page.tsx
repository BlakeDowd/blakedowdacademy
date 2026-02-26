"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Trophy, Target, Clock, Flag, Play, Check, Activity } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";

interface ActivityItem {
  id: string;
  type: 'round' | 'drill' | 'video' | 'achievement' | 'practice';
  title: string;
  date: string;
  xp?: number;
}

export default function ActivityPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Format time ago
  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const inputDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor((today.getTime() - inputDate.getTime()) / 86400000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffMins = Math.floor(diffMs / 60000);
    
    const timeString = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    
    if (diffDays === 0) {
      if (diffHours >= 1 && diffHours < 12) {
        return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
      }
      if (diffMins < 60 && diffMins > 0) {
        return `${diffMins} min${diffMins === 1 ? '' : 's'} ago`;
      }
      if (diffMins === 0) {
        return 'Just now';
      }
      return `Today at ${timeString}`;
    } else if (diffDays === 1) {
      return `Yesterday at ${timeString}`;
    } else {
      return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${timeString}`;
    }
  };

  // Get icon for activity type
  const getActivityIcon = (activity: ActivityItem) => {
    if (activity.type === 'round') return Flag;
    if (activity.type === 'drill') return Check;
    if (activity.type === 'video') return Play;
    if (activity.type === 'achievement') return Trophy;
    return Clock; // default for practice
  };

  // Get icon color for activity
  const getActivityIconColor = (activity: ActivityItem) => {
    if (activity.type === 'round') return '#014421';
    if (activity.type === 'drill' || activity.type === 'video') return '#FFA500';
    if (activity.type === 'achievement') return '#FFD700';
    return '#014421';
  };

  useEffect(() => {
    if (typeof window === 'undefined' || !user?.id) {
      if (!user?.id) setLoading(false);
      return;
    }

    const loadActivities = async () => {
      setLoading(true);
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        
        const { data, error } = await supabase
          .from('activity_logs')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(100); // Fetch up to 100 recent activities
          
        if (error) {
          console.error('Error loading activities:', error);
          setLoading(false);
          return;
        }
        
        if (data) {
          const mappedActivities: ActivityItem[] = data.map(log => ({
            id: log.id,
            type: (log.activity_type ?? log.type) as any,
            title: log.activity_title ?? log.title ?? '',
            date: log.created_at,
            xp: log.xp_earned // Assuming there might be an xp_earned column, but we'll map it if it exists
          }));
          
          setActivities(mappedActivities);
        }
      } catch (err) {
        console.error('Failed to fetch activity logs:', err);
      } finally {
        setLoading(false);
      }
    };

    loadActivities();

    // Listen for all updates
    const handleRoundsUpdated = () => loadActivities();
    const handlePracticeUpdate = () => loadActivities();

    window.addEventListener('roundsUpdated', handleRoundsUpdated);
    window.addEventListener('practiceActivityUpdated', handlePracticeUpdate);
    window.addEventListener('userProgressUpdated', handlePracticeUpdate);

    return () => {
      window.removeEventListener('roundsUpdated', handleRoundsUpdated);
      window.removeEventListener('practiceActivityUpdated', handlePracticeUpdate);
      window.removeEventListener('userProgressUpdated', handlePracticeUpdate);
    };
  }, [user?.id]);

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
                <Activity className="w-10 h-10" style={{ color: '#014421' }} />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">No activity yet</h2>
              <p className="text-gray-600 text-sm mb-6">
                Log your first round or practice session to start your journey!
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
              {activities.map((activity) => {
                const IconComponent = getActivityIcon(activity);
                const iconColor = getActivityIconColor(activity);
                const isRound = activity.type === 'round';

                return (
                  <div
                    key={activity.id}
                    className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-all flex items-center gap-3"
                  >
                    {/* Icon */}
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ 
                        backgroundColor: isRound 
                          ? 'rgba(1, 68, 33, 0.1)' 
                          : 'rgba(255, 165, 0, 0.1)' 
                      }}
                    >
                      <IconComponent
                        className="w-6 h-6"
                        style={{ color: iconColor }}
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 mb-1">
                        {activity.title}
                      </h3>
                      
                      {/* Date and XP */}
                      <div className="flex items-center gap-2 mt-1">
                        <Clock className="w-3 h-3 text-gray-400" />
                        <span className="text-gray-400 text-xs">{formatTimeAgo(activity.date)}</span>
                        {activity.xp && (
                          <>
                            <span className="text-gray-400 text-xs">•</span>
                            <span className="text-xs font-medium" style={{ color: '#FFA500' }}>
                              +{activity.xp} XP
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

