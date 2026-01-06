"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useStats } from "@/contexts/StatsContext";
import { useAuth } from "@/contexts/AuthContext";
import Image from "next/image";
import { 
  Play,
  Flame,
  Zap,
  TrendingDown,
  TrendingUp,
  Star,
  Trophy,
  Target,
  Activity,
  Clock,
  X,
  BookOpen,
  Users
} from "lucide-react";

// Video drills for Daily Focus rotation
const VIDEO_DRILLS = [
  {
    id: '1',
    title: 'Mastering Your Short Game',
    description: 'Learn the fundamentals of chipping and putting with Coach Sarah Thompson.',
    source: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    duration: '8:42',
    coach: 'Coach Sarah Thompson'
  },
  {
    id: '2',
    title: 'Driving Range Fundamentals',
    description: 'Perfect your swing mechanics and increase your driving distance.',
    source: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    duration: '12:15',
    coach: 'Coach Mike Johnson'
  },
  {
    id: '5',
    title: 'Swing Analysis Techniques',
    description: 'Learn how to analyze and improve your golf swing using video analysis.',
    source: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    duration: '15:30',
    coach: 'Coach David Lee'
  },
  {
    id: '7',
    title: 'Advanced Putting Techniques',
    description: 'Master advanced putting strategies for competitive play.',
    source: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    duration: '18:00',
    coach: 'Coach Emma Wilson'
  },
  {
    id: '9',
    title: 'Power Driving Techniques',
    description: 'Increase your driving distance with advanced techniques.',
    source: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    duration: '20:00',
    coach: 'Coach Tom Anderson'
  }
];

// Function to select video based on date seed
const getDailyVideo = (refreshKey: number = 0) => {
  const today = new Date();
  const dateSeed = today.getDate() + today.getMonth() * 31 + refreshKey;
  const videoIndex = dateSeed % VIDEO_DRILLS.length;
  return VIDEO_DRILLS[videoIndex];
};

interface ActivityItem {
  id: string;
  type: 'practice' | 'round';
  title: string;
  date: string;
  xp?: number;
  category?: string;
  drillTitle?: string;
}

interface CommunityRound {
  id: string;
  name: string;
  course: string;
  score: number;
  badge?: string;
  timeAgo: string;
}

export default function HomeDashboard() {
  const router = useRouter();
  const { rounds } = useStats();
  const { user } = useAuth();
  
  // Ensure rounds is always an array, never null or undefined
  const safeRounds = rounds || [];
  
  // Format user name from email
  const getUserDisplayName = () => {
    if (!user?.email) return 'Player';
    const emailParts = user.email.split('@')[0];
    const nameParts = emailParts.split('.');
    if (nameParts.length >= 2) {
      return nameParts.map((part: string) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
    }
    return emailParts.charAt(0).toUpperCase() + emailParts.slice(1);
  };
  const [totalXP, setTotalXP] = useState(0);
  const [dailyVideo, setDailyVideo] = useState(() => getDailyVideo());
  const [refreshKey, setRefreshKey] = useState(0);
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [recentActivities, setRecentActivities] = useState<ActivityItem[]>([]);
  const [scoreTab, setScoreTab] = useState<'myRounds' | 'community'>('myRounds');
  
  // Calculate level and progress - Level 1 starts at 0 XP, Level 2 requires 100 XP
  const currentLevel = totalXP === 0 ? 1 : Math.floor(totalXP / 100) + 1;
  const xpForCurrentLevel = totalXP % 100;
  const xpNeededForNextLevel = 100;
  const levelProgress = (xpForCurrentLevel / xpNeededForNextLevel) * 100;
  const xpRemaining = xpNeededForNextLevel - xpForCurrentLevel;
  
  // Mock community data
  const communityRounds: CommunityRound[] = [
    {
      id: '1',
      name: 'Alex Chen',
      course: 'Pine Valley Club',
      score: 72,
      badge: 'Personal Best',
      timeAgo: '2h ago'
    },
    {
      id: '2',
      name: 'Maria Rodriguez',
      course: 'Ocean Links',
      score: 78,
      badge: 'Improved 5 strokes',
      timeAgo: '5h ago'
    },
    {
      id: '3',
      name: 'James Mitchell',
      course: 'Riverside Golf',
      score: 68,
      timeAgo: '1d ago'
    }
  ];
  
  // Format time ago
  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else {
      return `${diffDays}d ago`;
    }
  };
  
  // Get icon for activity type
  const getActivityIcon = (activity: ActivityItem) => {
    if (activity.type === 'round') {
      return Trophy;
    }
    // Practice activities
    const category = activity.category?.toLowerCase() || '';
    if (category.includes('putting')) return Target;
    if (category.includes('driving')) return Zap;
    if (category.includes('short') || category.includes('chipping')) return BookOpen;
    return Activity;
  };
  
  // Get icon color for activity
  const getActivityIconColor = (activity: ActivityItem) => {
    if (activity.type === 'round') {
      return '#014421';
    }
    return '#FFA500';
  };
  
  // Load recent activities
  const loadRecentActivities = () => {
    if (typeof window === 'undefined') return;
    
    const allActivities: ActivityItem[] = [];
    
    // Load practice sessions
    const practiceHistory = localStorage.getItem('practiceActivityHistory');
    if (practiceHistory) {
      try {
        const history = JSON.parse(practiceHistory);
        history.forEach((activity: any) => {
          allActivities.push({
            id: activity.id || `practice-${Date.now()}`,
            type: 'practice',
            title: activity.title || activity.drillTitle || 'Practice Session',
            date: activity.timestamp || activity.date,
            xp: activity.xp || 100,
            drillTitle: activity.drillTitle || activity.title,
            category: activity.category,
          });
        });
      } catch (e) {
        console.error('Error loading practice history:', e);
      }
    }
    
    // Load rounds - use safeRounds with optional chaining
    if (safeRounds && safeRounds.length > 0) {
      safeRounds.forEach((round, index) => {
        allActivities.push({
          id: `round-${index}`,
          type: 'round',
          title: `${round.holes} Holes at ${round.course || 'Unknown Course'}`,
          date: round.date,
          xp: 500,
          category: 'Round',
        });
      });
    }
    
    // Sort by date (newest first) and take top 3
    allActivities.sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
    
    setRecentActivities(allActivities.slice(0, 3));
  };
  
  // Check if round is personal best
  const isPersonalBest = (round: { score?: number | null }): boolean => {
    if (!safeRounds || safeRounds.length === 0) return false;
    const userRounds = safeRounds.filter((r: { score?: number | null }) => r.score !== null && r.score !== undefined);
    if (userRounds.length === 0) return false;
    // Bulletproof: Ensure we have valid scores before using Math.min
    const scores = userRounds.map((r: { score?: number | null }) => r.score || 999).filter(s => s !== null && s !== undefined);
    if (scores.length === 0) return false;
    const bestScore = Math.min(...scores);
    return round.score === bestScore;
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const loadXP = () => {
      const savedProgress = localStorage.getItem('userProgress');
      if (savedProgress) {
        const progress = JSON.parse(savedProgress);
        setTotalXP(progress.totalXP || 0);
      }
    };

    loadXP();
    loadRecentActivities();

    // Listen for XP updates
    window.addEventListener('userProgressUpdated', loadXP);
    window.addEventListener('storage', loadXP);
    
    // Listen for practice activity to refresh video
    const handlePracticeUpdate = () => {
      setRefreshKey(prev => prev + 1);
      setDailyVideo(getDailyVideo(refreshKey + 1));
      loadRecentActivities();
    };
    
    // Listen for rounds updates
    const handleRoundsUpdate = () => {
      loadRecentActivities();
    };
    
    window.addEventListener('practiceActivityUpdated', handlePracticeUpdate);
    window.addEventListener('roundsUpdated', handleRoundsUpdate);

    return () => {
      window.removeEventListener('userProgressUpdated', loadXP);
      window.removeEventListener('storage', loadXP);
      window.removeEventListener('practiceActivityUpdated', handlePracticeUpdate);
      window.removeEventListener('roundsUpdated', handleRoundsUpdate);
    };
  }, [refreshKey, safeRounds]);

  // Wrap return in try-catch to prevent crashes
  try {
    return (
      <div className="min-h-screen bg-gray-50 pb-20">
      <div className="max-w-md mx-auto bg-white min-h-screen">
        {/* Top Section - Premium Header */}
        <div className="px-5 pt-6 pb-4 flex items-center justify-between mb-4 bg-white">
          <div className="flex items-center gap-3">
            {/* Logo */}
            <div className="relative w-32 h-16">
              <Image
                src="/logo.png"
                alt="Blake Dowd Academy Logo"
                fill
                className="object-contain"
                priority
              />
            </div>
            <div>
              <p className="text-gray-400 text-xs">Welcome back,</p>
              <p className="text-gray-900 font-bold text-xl">
                {getUserDisplayName()}
              </p>
            </div>
          </div>
          <div 
            className="rounded-full px-4 py-2 flex items-center gap-2 shadow-md"
            style={{ 
              backgroundColor: '#FFA500',
              boxShadow: '0 4px 12px rgba(255, 165, 0, 0.3)'
            }}
          >
            <Flame className="w-4 h-4 text-white" />
            <div className="flex flex-col">
              <span className="text-xs font-medium text-white">Streak</span>
              <span className="text-white text-sm font-bold">0 days</span>
            </div>
          </div>
        </div>

        {/* Video and Daily Focus - Premium Card */}
        <div className="px-5 mb-4">
          <div 
            className="bg-white overflow-hidden"
            style={{ 
              borderRadius: '16px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)'
            }}
          >
            <div 
              className="relative aspect-video flex items-center justify-center overflow-hidden"
              style={{ background: 'linear-gradient(to bottom right, #f0fdf4, #dcfce7, #bbf7d0)' }}
            >
              {/* Golf balls pattern background */}
              <div className="absolute inset-0 opacity-30">
                <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-8 h-8 bg-white rounded-full shadow-md"></div>
                    <div className="flex gap-1">
                      <div className="w-6 h-6 bg-white rounded-full shadow-md"></div>
                      <div className="w-6 h-6 bg-white rounded-full shadow-md"></div>
                    </div>
                    <div className="flex gap-0.5">
                      <div className="w-5 h-5 bg-white rounded-full shadow-md"></div>
                      <div className="w-5 h-5 bg-white rounded-full shadow-md"></div>
                      <div className="w-5 h-5 bg-white rounded-full shadow-md"></div>
                    </div>
                  </div>
                </div>
              </div>
              <div 
                className="absolute inset-0"
                style={{ background: 'linear-gradient(to top, rgba(134, 239, 172, 0.4), transparent)' }}
              />
              
              {/* Glassmorphism Play Button Overlay */}
              <div 
                className="relative w-20 h-20 rounded-full flex items-center justify-center backdrop-blur-md z-10 cursor-pointer transition-transform hover:scale-110"
                onClick={() => router.push(`/library?drill=${dailyVideo.id}`)}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                  border: '2px solid rgba(255, 255, 255, 0.5)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
                }}
              >
                <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                  <Play className="w-8 h-8 ml-1" style={{ color: '#014421' }} fill="#014421" />
                </div>
              </div>
              
              <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">
                {dailyVideo.duration}
              </div>
            </div>
            <div className="p-5">
              <div className="inline-block border border-[#FFA500] rounded-full px-3 py-1 mb-3 bg-transparent">
                <span className="text-xs font-medium" style={{ color: '#FFA500' }}>Daily Focus</span>
              </div>
              <h2 
                className="font-bold text-xl mb-2 tracking-tight"
                style={{ 
                  color: '#014421',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  fontWeight: 700,
                  letterSpacing: '-0.02em'
                }}
              >
                {dailyVideo.title}
              </h2>
              <p className="text-gray-500 text-sm">{dailyVideo.coach}</p>
            </div>
          </div>
        </div>

        {/* Action Buttons - Side by Side */}
        <div className="px-5 mb-6 flex gap-3">
          <button 
            onClick={() => router.push('/log-round')}
            className="flex-1 text-white font-semibold py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all hover:scale-[1.02]" 
            style={{ backgroundColor: '#FFA500' }}
          >
            Log Round
          </button>
          <button 
            onClick={() => {
              router.push('/practice');
              // Trigger video refresh after navigation
              setTimeout(() => {
                setRefreshKey(prev => prev + 1);
                setDailyVideo(getDailyVideo(refreshKey + 1));
              }, 100);
            }}
            className="flex-1 bg-white border-2 font-semibold py-3.5 rounded-xl transition-all hover:shadow-md"
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0fdf4'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'} 
            style={{ borderColor: '#014421', color: '#014421' }}
          >
            Log Today's Practice
          </button>
        </div>

        {/* Skills Snapshot - Equal Width Cards */}
        <div className="px-5 mb-6">
          <h3 className="text-gray-600 font-medium text-base mb-3">Skills Snapshot</h3>
          <div className="flex gap-3">
            {/* Streak Card - Links to Practice */}
            <Link 
              href="/practice"
              className="flex-1 bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col items-start cursor-pointer transition-all hover:scale-95 hover:border-[#FFA500] active:scale-[0.97]"
            >
              <Flame className="w-6 h-6 mb-2" style={{ color: '#FFA500' }} />
              <p className="text-2xl font-bold" style={{ color: '#FFA500' }}>0</p>
              <p className="text-gray-400 text-xs mt-1">days streak</p>
            </Link>
            
            {/* XP Card - Opens Level Up Modal */}
            <button
              onClick={() => setShowLevelModal(true)}
              className="flex-1 bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col items-start cursor-pointer transition-all hover:scale-95 hover:border-[#FFA500] active:scale-[0.97] text-left"
            >
              <Zap className="w-6 h-6 mb-2" style={{ color: '#FFA500' }} />
              <p className="text-2xl font-bold" style={{ color: '#FFA500' }}>{totalXP.toLocaleString()}</p>
              <p className="text-gray-400 text-xs mt-1">Total XP</p>
            </button>
            
            {/* Handicap Card - Links to Stats */}
            <Link
              href="/stats"
              className="flex-1 bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col items-start cursor-pointer transition-all hover:scale-95 hover:border-[#FFA500] active:scale-[0.97]"
            >
              <TrendingDown className="w-6 h-6 mb-2" style={{ color: '#FFA500' }} />
              <p 
                className="text-2xl font-bold mt-0"
                style={{ 
                  color: '#FFA500',
                  fontWeight: 700,
                  fontFamily: 'system-ui, -apple-system, sans-serif'
                }}
              >
                {(() => {
                  // Safeguard: if no rounds, return --
                  if (!safeRounds || safeRounds.length === 0) return '--';
                  const lastRound = safeRounds[safeRounds.length - 1];
                  return lastRound?.handicap !== null && lastRound?.handicap !== undefined
                    ? lastRound.handicap.toFixed(1)
                    : '--';
                })()}
              </p>
              <p className="text-gray-400 text-xs mt-1">Handicap</p>
            </Link>
          </div>
        </div>
        
        {/* Level Up Modal */}
        {showLevelModal && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setShowLevelModal(false)}
          >
            <div 
              className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowLevelModal(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: '#FFA500' }}>
                  <Trophy className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Level {currentLevel}</h3>
                <p className="text-gray-600 text-sm mb-4">
                  {xpRemaining} XP until Level {currentLevel + 1}
                </p>
                
                {/* Progress Bar */}
                <div className="w-full mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-medium text-gray-600">Progress to Level {currentLevel + 1}</span>
                    <span className="text-xs font-bold" style={{ color: '#FFA500' }}>
                      {xpForCurrentLevel} / {xpNeededForNextLevel} XP
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 relative overflow-hidden"
                      style={{ 
                        width: `${levelProgress}%`,
                        background: 'linear-gradient(to right, #FFA500, #FF8C00)'
                      }}
                    >
                      <div 
                        className="absolute inset-0"
                        style={{
                          background: 'linear-gradient(to right, transparent, rgba(255, 255, 255, 0.4), transparent)',
                          animation: 'shimmer 2s infinite ease-in-out'
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
                
                <div className="w-full bg-gray-50 rounded-xl p-4 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700">Total XP</span>
                    <span className="text-lg font-bold" style={{ color: '#FFA500' }}>
                      {totalXP.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
              
              <button
                onClick={() => setShowLevelModal(false)}
                className="w-full py-3 bg-[#FFA500] text-white font-semibold rounded-lg hover:bg-[#FF8C00] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Recent Activity */}
        <div className="px-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-gray-600 font-medium text-base">Recent Activity</h3>
            <Link 
              href="/activity"
              className="text-sm font-medium hover:underline transition-all"
              style={{ color: '#FFA500' }}
            >
              View All
            </Link>
          </div>
          {recentActivities.length > 0 ? (
            <div className="space-y-3 mb-6">
              {recentActivities.map((activity) => {
                const IconComponent = getActivityIcon(activity);
                const iconColor = getActivityIconColor(activity);
                const isRound = activity.type === 'round';
                
                return (
                  <div key={activity.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center" 
                      style={{ 
                        backgroundColor: isRound 
                          ? 'rgba(1, 68, 33, 0.1)' 
                          : 'rgba(255, 165, 0, 0.1)' 
                      }}
                    >
                      <IconComponent className="w-5 h-5" style={{ color: iconColor }} />
                    </div>
                    <div className="flex-1">
                      <p className="text-gray-800 font-medium text-sm">{activity.title}</p>
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
          ) : (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 text-center mb-6">
              <Activity className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-600 text-sm mb-2">No activity yet. Start your journey!</p>
              <button
                onClick={() => router.push('/practice')}
                className="text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                style={{ 
                  backgroundColor: '#FFA500',
                  color: 'white'
                }}
              >
                Start Practicing
              </button>
            </div>
          )}
        </div>

        {/* Recent Scores */}
        <div className="px-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-gray-600 font-medium text-base">Recent Scores</h3>
            <Link
              href="/scores"
              className="text-sm font-medium hover:underline transition-all"
              style={{ color: '#FFA500' }}
            >
              View All
            </Link>
          </div>
          
          {/* Tab Toggles */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setScoreTab('myRounds')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                scoreTab === 'myRounds'
                  ? 'bg-[#FFA500] text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              My Rounds
            </button>
            <button
              onClick={() => setScoreTab('community')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                scoreTab === 'community'
                  ? 'bg-[#FFA500] text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Users className="w-4 h-4 inline mr-1" />
              Community
            </button>
          </div>
          
          {/* Scores List */}
          {scoreTab === 'myRounds' ? (
            safeRounds?.length > 0 ? (
              <div className="space-y-3">
                {safeRounds
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .slice(0, 3)
                  .map((round, index) => {
                    const isPB = isPersonalBest(round);
                    return (
                      <div key={index} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          {isPB ? (
                            <Trophy className="w-5 h-5" style={{ color: '#FFA500' }} />
                          ) : (
                            <Star className="w-5 h-5" style={{ color: '#014421' }} />
                          )}
                          <div className="flex-1">
                            <p className="text-gray-800 font-medium">You</p>
                            <p className="text-gray-400 text-sm">{round.course || 'Unknown Course'}</p>
                            <div className="flex items-center gap-2 mt-1">
                              {isPB && (
                                <span className="text-xs px-2 py-0.5 rounded text-white font-medium" style={{ backgroundColor: '#FFA500' }}>
                                  Personal Best
                                </span>
                              )}
                              <span className="text-gray-400 text-xs">• {formatTimeAgo(round.date)}</span>
                            </div>
                          </div>
                        </div>
                        <p className="text-2xl font-bold" style={{ color: '#FFA500' }}>
                          {round.score || round.nett?.toFixed(0) || 'N/A'}
                        </p>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 text-center">
                <Trophy className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-gray-600 text-sm mb-2">No rounds recorded</p>
                <p className="text-gray-400 text-xs mb-4">Log your first round to see your stats</p>
                <button
                  onClick={() => router.push('/log-round')}
                  className="text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  style={{ 
                    backgroundColor: '#FFA500',
                    color: 'white'
                  }}
                >
                  Log Round
                </button>
              </div>
            )
          ) : (
            <div className="space-y-3">
              {communityRounds.map((round) => (
                <div key={round.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    {round.badge === 'Personal Best' ? (
                      <Trophy className="w-5 h-5" style={{ color: '#FFA500' }} />
                    ) : round.badge?.includes('Improved') ? (
                      <TrendingUp className="w-5 h-5" style={{ color: '#014421' }} />
                    ) : (
                      <Star className="w-5 h-5" style={{ color: '#014421' }} />
                    )}
                    <div className="flex-1">
                      <p className="text-gray-800 font-medium">{round.name}</p>
                      <p className="text-gray-400 text-sm">{round.course}</p>
                      {round.badge && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs px-2 py-0.5 rounded text-white font-medium" style={{ backgroundColor: '#FFA500' }}>
                            {round.badge}
                          </span>
                          <span className="text-gray-400 text-xs">• {round.timeAgo}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: '#FFA500' }}>{round.score}</p>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
  } catch (error) {
    console.error('Error rendering HomeDashboard:', error);
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Something went wrong. Please refresh the page.</p>
          <button 
            onClick={() => {}} 
            className="px-4 py-2 bg-[#014421] text-white rounded-lg"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }
}


