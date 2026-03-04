"use client";

import { useState, useEffect, Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Search, ExternalLink, Play, FileText, File, Check, ChevronDown, X, Lock, Star, MoreVertical } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { logActivity } from "@/lib/activity";

type DrillType = 'video' | 'text' | 'pdf';
type SkillLevel = 'Foundation' | 'Performance' | 'Elite';

interface Drill {
  id: string;
  title: string;
  type: DrillType;
  description: string;
  source: string; // YouTube URL, PDF path, or text content
  category: string;
  mechanic?: string; // Ball Striking, Short Game, Putting, Strategy
  practiceMode?: 'Technique' | 'Skill' | 'Performance'; // Practice mode tag
  duration?: string;
  xpValue: number;
  estimatedMinutes: number;
  level: SkillLevel;
  accessType: 'free' | 'premium';
  complexity: number; // 1-5 star rating
}

interface UserProgress {
  completedDrills: string[];
  totalXP: number;
  totalMinutes: number;
  drillCompletions?: { [drillId: string]: number };
}

const CATEGORIES = ['All', 'Putting', 'Driving', 'Irons', 'Short Game', 'Wedge Play', 'Skills', 'On-Course', 'Mental Game'];
const LEVELS: (SkillLevel | 'All')[] = ['All', 'Foundation', 'Performance', 'Elite'];
const MECHANICS = ['All', 'Ball Striking', 'Short Game', 'Putting', 'Strategy'];
const PRACTICE_MODES = ['All Modes', 'Technique', 'Skill', 'Performance'];

const DRILLS: Drill[] = [
  {
    id: '1',
    title: 'Mastering Your Short Game',
    type: 'video',
    description: 'Learn the fundamentals of chipping and putting with Coach Sarah Thompson.',
    source: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    category: 'Short Game',
    mechanic: 'Short Game',
    practiceMode: 'Technique',
    duration: '8:42',
    xpValue: 50,
    estimatedMinutes: 9,
    level: 'Foundation',
    accessType: 'free',
    complexity: 2
  },
  {
    id: '2',
    title: 'Driving Range Fundamentals',
    type: 'video',
    description: 'Perfect your swing mechanics and increase your driving distance.',
    source: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    category: 'Driving',
    mechanic: 'Ball Striking',
    practiceMode: 'Skill',
    duration: '12:15',
    xpValue: 75,
    estimatedMinutes: 12,
    level: 'Foundation',
    accessType: 'free',
    complexity: 2
  },
  {
    id: '3',
    title: 'Golf Course Strategy Guide',
    type: 'pdf',
    description: 'A comprehensive guide to course management and strategic play.',
    source: '/sample-golf-strategy.pdf',
    category: 'On-Course',
    mechanic: 'Strategy',
    practiceMode: 'Performance',
    xpValue: 100,
    estimatedMinutes: 20,
    level: 'Performance',
    accessType: 'premium',
    complexity: 3
  },
  {
    id: '4',
    title: 'Putting Practice Routine',
    type: 'text',
    description: 'A detailed 30-day putting practice routine designed to improve your accuracy and consistency on the green.',
    source: `Putting is one of the most critical aspects of golf, and consistent practice is key to improvement. This 30-day routine is designed to build muscle memory, improve your stroke, and increase your confidence on the green.

**Week 1: Foundation Building**
- Day 1-3: Focus on your putting stance and grip. Practice 50 putts from 3 feet.
- Day 4-5: Work on your backswing and follow-through. Practice 30 putts from 5 feet.
- Day 6-7: Combine stance, grip, and stroke. Practice 40 putts from various distances.

**Week 2: Distance Control**
- Day 8-10: Practice lag putting from 20-30 feet. Focus on getting within 3 feet of the hole.
- Day 11-12: Work on uphill and downhill putts. Practice 25 putts of each.
- Day 13-14: Practice breaking putts. Set up 5 different break scenarios and practice each.

**Week 3: Pressure Situations**
- Day 15-17: Practice 3-foot putts under pressure. Set a goal of making 20 in a row.
- Day 18-19: Practice 5-foot putts with consequences (miss and start over).
- Day 20-21: Simulate tournament conditions with various putt scenarios.

**Week 4: Refinement**
- Day 22-24: Focus on your weakest areas identified in previous weeks.
- Day 25-26: Practice putting from various lies (uphill, downhill, sidehill).
- Day 27-28: Full course putting practice, simulating real game scenarios.
- Day 29-30: Review and refine your technique, focusing on consistency.

Remember: Consistency is more important than perfection. Practice daily, even if it's just 15 minutes.`,
    category: 'Putting',
    mechanic: 'Putting',
    practiceMode: 'Technique',
    xpValue: 150,
    estimatedMinutes: 30,
    level: 'Foundation',
    accessType: 'free',
    complexity: 1
  },
  {
    id: '5',
    title: 'Swing Analysis Techniques',
    type: 'video',
    description: 'Learn how to analyze and improve your golf swing using video analysis.',
    source: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    category: 'Skills',
    mechanic: 'Ball Striking',
    practiceMode: 'Skill',
    duration: '15:30',
    xpValue: 60,
    estimatedMinutes: 16,
    level: 'Performance',
    accessType: 'free',
    complexity: 3
  },
  {
    id: '6',
    title: 'Mental Game Workbook',
    type: 'pdf',
    description: 'Exercises and strategies to strengthen your mental game on the course.',
    source: '/mental-game-workbook.pdf',
    category: 'Mental Game',
    mechanic: 'Strategy',
    practiceMode: 'Performance',
    xpValue: 80,
    estimatedMinutes: 25,
    level: 'Elite',
    accessType: 'premium',
    complexity: 4
  },
  {
    id: '7',
    title: 'Advanced Putting Techniques',
    type: 'video',
    description: 'Master advanced putting strategies for competitive play.',
    source: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    category: 'Putting',
    mechanic: 'Putting',
    practiceMode: 'Performance',
    duration: '18:00',
    xpValue: 120,
    estimatedMinutes: 18,
    level: 'Elite',
    accessType: 'premium',
    complexity: 5
  },
  {
    id: '8',
    title: 'Irons Mastery Guide',
    type: 'text',
    description: 'Complete guide to mastering your iron shots.',
    source: 'Learn the fundamentals of iron play...',
    category: 'Irons',
    mechanic: 'Ball Striking',
    practiceMode: 'Technique',
    xpValue: 90,
    estimatedMinutes: 25,
    level: 'Performance',
    accessType: 'free',
    complexity: 3
  },
  {
    id: '9',
    title: 'Power Driving Techniques',
    type: 'video',
    description: 'Increase your driving distance with advanced techniques.',
    source: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    category: 'Driving',
    mechanic: 'Ball Striking',
    practiceMode: 'Skill',
    duration: '20:00',
    xpValue: 110,
    estimatedMinutes: 20,
    level: 'Elite',
    accessType: 'premium',
    complexity: 4
  },
];

function LibraryPageContent() {

  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [selectedDrill, setSelectedDrill] = useState<Drill | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedLevel, setSelectedLevel] = useState<SkillLevel | 'All'>('All');
  const [selectedMechanic, setSelectedMechanic] = useState<string>('All');
  const [selectedPracticeMode, setSelectedPracticeMode] = useState<string>('All Modes');
  const [expandedDrill, setExpandedDrill] = useState<string | null>(null);
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [premiumDrill, setPremiumDrill] = useState<Drill | null>(null);
  
  // Read URL params and set category filter
  useEffect(() => {
    if (typeof window === 'undefined' || !searchParams) return;
    
    try {
      const categoryParam = searchParams.get('category');
      const drillParam = searchParams.get('drill');
      
      if (categoryParam) {
        setSelectedCategory(categoryParam);
        // If a specific drill is requested, find and select it
        if (drillParam) {
          const drill = DRILLS.find(d => d.id === drillParam);
          if (drill) {
            setSelectedDrill(drill);
            // Save recommended drill ID for Coach's Pet trophy
            const recommendedDrills = JSON.parse(localStorage.getItem('recommendedDrills') || '[]');
            if (!recommendedDrills.includes(drillParam)) {
              recommendedDrills.push(drillParam);
              localStorage.setItem('recommendedDrills', JSON.stringify(recommendedDrills));
            }
          }
        }
      }
    } catch (e) {
      console.error('Error reading search params:', e);
    }
  }, [searchParams]);
  
  // Access Context: Create profile object with totalXP from useAuth
  // Map Property: Point the display to profile?.totalXP || 0 to match the Home Dashboard
  const profile = useMemo(() => {
    return {
      totalXP: user?.totalXP // Use synchronized totalXP from user object (mapped from database xp column)
    };
  }, [user?.totalXP]);

  // Load from localStorage on mount
  // Remove Hardcoding: Keep userProgress for drill tracking, but use profile.totalXP for display
  const [userProgress, setUserProgress] = useState<UserProgress>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('userProgress');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          drillCompletions: parsed.drillCompletions || {}
        };
      }
    }
    return {
      completedDrills: [],
      totalXP: 0, // This is used for drill tracking only, display uses profile.totalXP
      totalMinutes: 0,
      drillCompletions: {}
    };
  });

  // Save to localStorage whenever progress changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('userProgress', JSON.stringify(userProgress));
      // Also save drill data for stats page
      localStorage.setItem('drillsData', JSON.stringify(DRILLS));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProgress]);

  const markComplete = (drillId: string) => {
    const drill = DRILLS.find(d => d.id === drillId);
    if (!drill) return;

    setUserProgress(prev => {
      const isAlreadyCompleted = prev.completedDrills.includes(drillId);
      const drillCompletions = prev.drillCompletions || {};
      
      // Check if this is a recommended drill (from URL params or localStorage)
      const recommendedDrills = JSON.parse(localStorage.getItem('recommendedDrills') || '[]');
      const isRecommended = recommendedDrills.includes(drillId);
      
      if (isAlreadyCompleted) {
        // Remove from completed
        return {
          completedDrills: prev.completedDrills.filter(id => id !== drillId),
          totalXP: prev.totalXP - drill.xpValue,
          totalMinutes: prev.totalMinutes - drill.estimatedMinutes,
          drillCompletions: {
            ...drillCompletions,
            [drillId]: Math.max(0, (drillCompletions[drillId] || 0) - 1)
          }
        };
      } else {
        // Add to completed and increment completion count
        // Check if this is a recommended drill (from URL params or localStorage)
        const currentRecommended = JSON.parse(localStorage.getItem('recommendedDrills') || '[]');
        const isRecommendedDrill = currentRecommended.includes(drillId);
        
        // If this is a recommended drill, ensure it's tracked
        if (isRecommendedDrill && !currentRecommended.includes(drillId)) {
          currentRecommended.push(drillId);
          localStorage.setItem('recommendedDrills', JSON.stringify(currentRecommended));
        }
        
        // Dispatch event to update Academy trophies
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('userProgressUpdated'));
        }
        
        // Log video/lesson completion
        if (user?.id) {
          const actionText = drill.type === 'video' ? 'Watched' : 'Completed';
          const actionType = drill.type === 'video' ? 'video' : 'drill';
          logActivity(user.id, actionType as any, `${actionText} ${drill.title}`);
        }
        
        return {
          completedDrills: [...prev.completedDrills, drillId],
          totalXP: prev.totalXP + drill.xpValue,
          totalMinutes: prev.totalMinutes + drill.estimatedMinutes,
          drillCompletions: {
            ...drillCompletions,
            [drillId]: (drillCompletions[drillId] || 0) + 1
          }
        };
      }
    });
  };

  const isCompleted = (drillId: string) => userProgress.completedDrills.includes(drillId);

  // Exponential Growth: Calculate level based on exponential thresholds
  const getLevelInfo = (xp: number) => {
    if (xp < 500) {
      return { level: 1, xpForCurrentLevel: xp, xpNeededForNextLevel: 500, xpRemaining: 500 - xp };
    } else if (xp < 1500) {
      return { level: 2, xpForCurrentLevel: xp - 500, xpNeededForNextLevel: 1000, xpRemaining: 1500 - xp };
    } else if (xp < 3000) {
      return { level: 3, xpForCurrentLevel: xp - 1500, xpNeededForNextLevel: 1500, xpRemaining: 3000 - xp };
    } else {
      // Level 4+ (every 2000 XP after 3000)
      const level4XP = xp - 3000;
      const additionalLevels = Math.floor(level4XP / 2000);
      const level = 4 + additionalLevels;
      const xpInCurrentLevel = level4XP % 2000;
      return { level, xpForCurrentLevel: xpInCurrentLevel, xpNeededForNextLevel: 2000, xpRemaining: 2000 - xpInCurrentLevel };
    }
  };

  // Use state + useEffect to avoid hydration mismatch (user.totalXP loads client-side only)
  const [levelDisplay, setLevelDisplay] = useState({ currentLevel: 1, totalXP: 0, levelProgress: 0 });
  useEffect(() => {
    const xp = user?.totalXP ?? 0;
    const info = getLevelInfo(xp);
    setLevelDisplay({
      currentLevel: info.level,
      totalXP: xp,
      levelProgress: (info.xpForCurrentLevel / info.xpNeededForNextLevel) * 100,
    });
  }, [user?.totalXP]);

  const { currentLevel, totalXP, levelProgress } = levelDisplay;

  const filteredDrills = DRILLS.filter(drill => {
    // Search filter
    const matchesSearch = 
      drill.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      drill.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      drill.category.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Category filter
    const matchesCategory = selectedCategory === 'All' || drill.category === selectedCategory;
    
    // Level filter
    const matchesLevel = selectedLevel === 'All' || drill.level === selectedLevel;
    
    // Mechanic filter
    const matchesMechanic = selectedMechanic === 'All' || drill.mechanic === selectedMechanic;
    
    // Practice Mode filter
    const matchesPracticeMode = selectedPracticeMode === 'All Modes' || drill.practiceMode === selectedPracticeMode;
    
    return matchesSearch && matchesCategory && matchesLevel && matchesMechanic && matchesPracticeMode;
  });

  // Handle drill selection with premium check
  const handleDrillClick = (drill: Drill) => {
    if (drill.accessType === 'premium') {
      setPremiumDrill(drill);
      setShowPaywallModal(true);
    } else {
      setSelectedDrill(drill);
    }
  };

  // Render complexity stars
  const renderComplexityStars = (complexity: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`w-3 h-3 ${
              star <= complexity
                ? 'fill-[#FFA500] text-[#FFA500]'
                : 'fill-gray-300 text-gray-300'
            }`}
          />
        ))}
      </div>
    );
  };

  const getLevelBadge = (level: SkillLevel) => {
    const badges = {
      Foundation: { letter: 'F', color: '#014421', bgColor: 'rgba(1, 68, 33, 0.1)' },
      Performance: { letter: 'P', color: '#3B82F6', bgColor: 'rgba(59, 130, 246, 0.1)' },
      Elite: { letter: 'E', color: '#FFA500', bgColor: 'rgba(255, 165, 0, 0.1)' }
    };
    return badges[level];
  };

  const getIcon = (type: DrillType) => {
    switch (type) {
      case 'video':
        return <Play className="w-4 h-4" />;
      case 'pdf':
        return <File className="w-4 h-4" />;
      case 'text':
        return <FileText className="w-4 h-4" />;
    }
  };

  const openFullscreen = () => {
    if (selectedDrill?.type === 'pdf') {
      window.open(selectedDrill.source, '_blank');
    } else if (selectedDrill?.type === 'video') {
      window.open(selectedDrill.source.replace('/embed/', '/watch?v='), '_blank');
    }
  };

  // Netflix-style drill categorization
  const continuePracticingDrills = DRILLS.filter(d => userProgress.completedDrills.includes(d.id));
  const row1Drills = continuePracticingDrills.length > 0 ? continuePracticingDrills : DRILLS.slice(0, 4);
  
  const shortGameDrills = DRILLS.filter(d => d.category === 'Short Game' || d.category === 'Putting' || d.category === 'Wedge Play' || d.mechanic === 'Short Game');
  const longGameDrills = DRILLS.filter(d => d.category === 'Driving' || d.category === 'Irons' || d.mechanic === 'Ball Striking');
  const strategyDrills = DRILLS.filter(d => d.category === 'Mental Game' || d.category === 'On-Course' || d.mechanic === 'Strategy');

  const heroDrill = DRILLS.find(d => d.id === '1') || DRILLS[0];
  
  const getThumbnailUrl = (source: string) => {
    if (source.includes('youtube.com/embed/')) {
      const videoId = source.split('youtube.com/embed/')[1]?.split('?')[0];
      return videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : null;
    } else if (source.includes('youtu.be/')) {
      const videoId = source.split('youtu.be/')[1]?.split('?')[0];
      return videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : null;
    }
    return null;
  };
  
  const heroThumbnail = getThumbnailUrl(heroDrill.source) || 'https://images.unsplash.com/photo-1535136104956-6211bc6432f6?q=80&w=2000&auto=format&fit=crop';

  const isFiltering = searchQuery !== '' || selectedCategory !== 'All' || selectedLevel !== 'All' || selectedMechanic !== 'All' || selectedPracticeMode !== 'All Modes';

  const renderNetflixCard = (drill: Drill) => {
    const isCompletedDrill = isCompleted(drill.id);
    const thumbnailUrl = getThumbnailUrl(drill.source);

    return (
      <div
        key={drill.id}
        onClick={() => handleDrillClick(drill)}
        style={{
          flex: '0 0 280px',
          minWidth: '280px',
          maxWidth: '280px',
          scrollSnapAlign: 'start',
          cursor: 'pointer',
        }}
      >
        <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', aspectRatio: '16/9', width: '100%', backgroundColor: '#f3f4f6' }}>
          {thumbnailUrl ? (
            <img src={thumbnailUrl} alt={drill.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : drill.type === 'video' ? (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e5e7eb' }}>
              <Play className="w-8 h-8 text-gray-400" />
            </div>
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#eff6ff' }}>
              <FileText className="w-8 h-8 text-blue-300" />
            </div>
          )}
          {isCompletedDrill && (
            <div style={{ position: 'absolute', top: '8px', left: '8px', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#014421', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Check className="w-3 h-3 text-white" />
            </div>
          )}
          {drill.accessType === 'premium' && (
            <div style={{ position: 'absolute', top: '8px', right: '8px', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#FFA500', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Lock className="w-3 h-3 text-black" />
            </div>
          )}
        </div>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', marginTop: '8px', lineHeight: '1.3', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>{drill.title}</h3>
        <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{drill.category} &bull; {drill.level}</p>
      </div>
    );
  };

  const DrillCarousel = ({ title, drills }: { title: string, drills: Drill[] }) => {
    if (drills.length === 0) return null;
    return (
      <div style={{ width: '100%', marginBottom: '24px' }}>
        <h2 style={{ padding: '12px 16px', fontWeight: 700, color: '#111827', fontSize: '14px', margin: 0 }}>{title}</h2>
        <div
          className="netflix-scroll-row"
          style={{
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'nowrap',
            overflowX: 'auto',
            overflowY: 'hidden',
            WebkitOverflowScrolling: 'touch',
            scrollSnapType: 'x mandatory',
            gap: '16px',
            padding: '0 16px 16px',
            cursor: 'grab',
            scrollbarWidth: 'auto',
          } as React.CSSProperties}
        >
          {drills.map(renderNetflixCard)}
        </div>
      </div>
    );
  };

  const handleDrillComplete = (drillId: string) => {
    markComplete(drillId);
  };

  const allDrills = isFiltering ? filteredDrills : [...row1Drills, ...shortGameDrills, ...longGameDrills, ...strategyDrills];

  return (
    <div className="flex-1 w-full max-w-md mx-auto flex flex-col bg-gray-50 min-w-0 overflow-x-hidden">
      <style>{`
        .netflix-scroll-row::-webkit-scrollbar {
          height: 8px;
          display: block;
        }
        .netflix-scroll-row::-webkit-scrollbar-track {
          background: transparent;
        }
        .netflix-scroll-row::-webkit-scrollbar-thumb {
          background: #ccc;
          border-radius: 10px;
        }
        .netflix-scroll-row::-webkit-scrollbar-thumb:hover {
          background: #aaa;
        }
      `}</style>

      {/* Header */}
      <div className="shrink-0 w-full px-4 py-3" style={{ backgroundColor: '#054d2b' }}>
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold text-white">Library</span>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-white/90">Level {currentLevel}</span>
              <span className="text-[10px] text-white/70 font-mono">{totalXP} XP</span>
            </div>
            <div className="w-20 h-1 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${levelProgress}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Video Player & Main Content Container */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden pb-32 min-w-0">
        <div className="max-w-md mx-auto w-full min-w-0">
          {selectedDrill && (
            <div className="w-full bg-black">
          <div className="relative w-full pb-[56.25%]">
            <button
              onClick={() => setSelectedDrill(null)}
              className="absolute top-3 right-3 z-50 w-8 h-8 rounded-full bg-black/50 border-none text-white flex items-center justify-center cursor-pointer"
            >
              <X className="w-4.5 h-4.5" />
            </button>
            <iframe
              src={selectedDrill.source}
              className="absolute top-0 left-0 w-full h-full border-none"
              allowFullScreen
            />
          </div>
          <div className="p-4">
            <h2 className="text-base font-bold text-white m-0">{selectedDrill.title}</h2>
            <p className="text-xs text-gray-400 mt-1">{selectedDrill.category} &bull; {selectedDrill.level}</p>
            <button
              onClick={() => handleDrillComplete(selectedDrill.id)}
              className={`mt-3 w-full py-2.5 rounded-lg font-bold text-[13px] text-white transition-colors ${isCompleted(selectedDrill.id) ? 'bg-gray-800' : 'bg-[#16a34a]'}`}
            >
              {isCompleted(selectedDrill.id) ? 'Completed' : 'Mark as Complete'}
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="px-4 py-3 bg-white w-full border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search drills..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-[#16a34a] border-none"
            style={{ backgroundColor: '#f3f4f6' }}
          />
        </div>
        
        {/* YouTube-style Category Chips */}
        <div
          className="netflix-scroll-row"
          style={{
            display: 'flex',
            flexWrap: 'nowrap',
            overflowX: 'auto',
            gap: '8px',
            marginTop: '12px',
            paddingBottom: '4px',
            paddingRight: '40px',
            WebkitOverflowScrolling: 'touch',
            cursor: 'grab',
            scrollbarWidth: 'auto',
          } as React.CSSProperties}
        >
          {[
            { label: 'All', onClick: () => { setSelectedLevel('All'); setSelectedMechanic('All'); }, active: selectedLevel === 'All' && selectedMechanic === 'All' },
            { label: 'Break 100', onClick: () => { setSelectedLevel('Foundation'); setSelectedMechanic('All'); }, active: selectedLevel === 'Foundation' },
            { label: 'Break 90', onClick: () => { setSelectedLevel('Performance'); setSelectedMechanic('All'); }, active: selectedLevel === 'Performance' },
            { label: 'Break 80', onClick: () => { setSelectedLevel('Elite'); setSelectedMechanic('All'); }, active: selectedLevel === 'Elite' },
            { label: 'Ball Striking', onClick: () => { setSelectedMechanic('Ball Striking'); setSelectedLevel('All'); }, active: selectedMechanic === 'Ball Striking' },
            { label: 'Short Game', onClick: () => { setSelectedMechanic('Short Game'); setSelectedLevel('All'); }, active: selectedMechanic === 'Short Game' },
            { label: 'Putting', onClick: () => { setSelectedMechanic('Putting'); setSelectedLevel('All'); }, active: selectedMechanic === 'Putting' },
            { label: 'Strategy', onClick: () => { setSelectedMechanic('Strategy'); setSelectedLevel('All'); }, active: selectedMechanic === 'Strategy' },
          ].map((chip) => (
            <button
              key={chip.label}
              onClick={chip.onClick}
              style={{
                flexShrink: 0,
                padding: '6px 16px',
                borderRadius: '9999px',
                fontSize: '12px',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                border: 'none',
                cursor: 'pointer',
                transition: 'background-color 0.15s',
                backgroundColor: chip.active ? '#111827' : '#f3f4f6',
                color: chip.active ? '#fff' : '#374151',
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Drill Content */}
      <div className="w-full pb-8">
        {isFiltering ? (
          <div style={{ width: '100%', paddingTop: '16px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', padding: '0 16px 16px' }}>
              {filteredDrills.map(renderNetflixCard)}
            </div>
            {filteredDrills.length === 0 && (
              <p className="text-center text-gray-400 py-12 text-sm">No drills match your search.</p>
            )}
          </div>
        ) : (
          <div className="w-full pt-2">
            <DrillCarousel title="Continue Practicing" drills={row1Drills} />
            <DrillCarousel title="Short Game Mastery" drills={shortGameDrills} />
            <DrillCarousel title="Long Game Power" drills={longGameDrills} />
            <DrillCarousel title="Mental &amp; Strategy" drills={strategyDrills} />
          </div>
        )}
      </div>

      {/* Paywall Modal */}
      {showPaywallModal && premiumDrill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="bg-[#111] border border-white/10 rounded-2xl max-w-[400px] w-[90%] p-6 relative">
            <button
              onClick={() => { setShowPaywallModal(false); setPremiumDrill(null); }}
              className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/10 border-none text-[#aaa] cursor-pointer flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="text-center mb-4">
              <div className="w-14 h-14 rounded-full bg-[#FFA500] inline-flex items-center justify-center">
                <Lock className="w-7 h-7 text-black" />
              </div>
            </div>
            <h2 className="text-xl font-extrabold text-center text-white m-0 mb-1">Premium Content</h2>
            <p className="text-center text-[#888] mb-5 text-[13px]">{premiumDrill.title}</p>
            <button
              onClick={() => { setShowPaywallModal(false); setPremiumDrill(null); }}
              className="w-full py-3 rounded-lg border-none font-bold text-sm cursor-pointer bg-[#FFA500] text-black mb-2"
            >
              Upgrade to Premium
            </button>
            <button
              onClick={() => { setShowPaywallModal(false); setPremiumDrill(null); }}
              className="w-full py-3 rounded-lg border-none font-medium text-sm cursor-pointer bg-white/10 text-white"
            >
              Maybe Later
            </button>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}

export default function LibraryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#050505] flex items-center justify-center text-[#FFA500] font-bold">Loading...</div>}>
      <LibraryPageContent />
    </Suspense>
  );
}

