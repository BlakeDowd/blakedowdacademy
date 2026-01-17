"use client";

import { useState, useEffect, Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Search, ExternalLink, Play, FileText, File, Check, ChevronDown, X, Lock, Star } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

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
  // Access Context: Ensure the page is using the useAuth() hook to get the user or profile object
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

  // Exponential Growth: Level thresholds - Level 2 = 500 XP, Level 3 = 1500 XP, Level 4 = 3000 XP
  // Update Display: Use profile?.totalXP || 0 to match the Home Dashboard (synchronized from database)
  const totalXP = profile?.totalXP || 0;
  
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
  
  const levelInfo = getLevelInfo(totalXP);
  const currentLevel = levelInfo.level;
  const xpForCurrentLevel = levelInfo.xpForCurrentLevel;
  const xpNeededForNextLevel = levelInfo.xpNeededForNextLevel;
  const levelProgress = (xpForCurrentLevel / xpNeededForNextLevel) * 100;

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

  return (
    <div className="bg-gray-50 pb-24">
      <div className="max-w-md mx-auto bg-white">
        {/* Mobile Layout - Professional Mobile-First */}
        <div className="lg:hidden flex flex-col">
          {/* Top Header - HUD Style - Sticky */}
          <div className="sticky top-0 z-30 backdrop-blur-md border-b border-white/5" style={{ backgroundColor: 'rgba(1, 68, 33, 0.95)' }}>
            {/* Header with Typography Refresh */}
            <div className="px-4 py-2.5">
              <div className="flex items-start justify-between gap-4">
                <h1 className="text-xl font-extrabold text-white">Library</h1>
                {/* Floating Level Bar Section */}
                <div className="flex flex-col items-end gap-1.5 flex-1 max-w-xs">
                  {/* Wrapper to match badge+XP row width exactly */}
                  <div className="flex flex-col items-end gap-1.5 ml-2">
                    {/* Level Badge and XP Counter Row */}
                    <div className="flex items-center gap-2">
                      {/* Elegant Level Badge */}
                      <span 
                        className="border rounded-md px-2.5 py-0.5 text-[10px] font-bold font-sans text-center"
                        style={{ 
                          borderColor: 'rgba(255, 165, 0, 0.5)',
                          color: '#FFA500'
                        }}
                      >
                        Level {currentLevel}
                      </span>
                      {/* Micro-Stats XP Counter */}
                      {/* Update Display: Use profile?.totalXP || 0 to match the Home Dashboard (synchronized from database) */}
                      <span className="tracking-widest text-[10px] text-gray-400 uppercase font-mono">
                        {totalXP} XP
                      </span>
                    </div>
                    {/* Ultra-Thin Floating Progress Bar with Neon Glow - Matched Width */}
                    <div className="relative bg-white/10 rounded-full h-0.5 overflow-hidden w-full">
                      {/* Progress Fill with Gradient and Neon Glow */}
                      <div
                        className="h-full rounded-full transition-all duration-500 relative overflow-hidden shadow-[0_0_8px_rgba(255,165,0,0.4)]"
                        style={{ width: `${levelProgress}%` }}
                      >
                        <div 
                          className="absolute inset-0"
                          style={{ background: 'linear-gradient(to right, #FFA500, #FF8C00)' }}
                        ></div>
                        {/* Shimmer Effect */}
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
                </div>
              </div>
            </div>

            {/* Glass Search Bar */}
            <div className="px-4 pb-2.5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/50 z-10" />
                <input
                  type="text"
                  placeholder="Search drills..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white/5 backdrop-blur-md rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-orange-500/30 focus:bg-white/10 text-sm border-t border-white/10"
                />
              </div>
            </div>

            {/* Premium Selectors - Side by Side */}
            <div className="px-4 pb-2.5">
              <div className="flex flex-wrap justify-center gap-2">
                {/* Skill Level Dropdown - Premium Dark Background */}
                <select
                  value={selectedLevel === 'All' ? 'All Levels' : selectedLevel === 'Foundation' ? 'Break 100' : selectedLevel === 'Performance' ? 'Break 90' : 'Break 80'}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === 'All Levels') setSelectedLevel('All');
                    else if (value === 'Break 100') setSelectedLevel('Foundation');
                    else if (value === 'Break 90') setSelectedLevel('Performance');
                    else if (value === 'Break 80') setSelectedLevel('Elite');
                  }}
                  className={`flex-1 min-w-[100px] px-3 py-2 rounded-lg text-white text-xs truncate focus:outline-none appearance-none cursor-pointer h-9 transition-all ${
                    selectedLevel !== 'All' ? 'border-b-2 border-[#FFA500]' : ''
                  }`}
                  style={{ 
                    backgroundColor: '#0a2118',
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.75rem center',
                    backgroundSize: '16px 16px',
                    paddingRight: '2.75rem'
                  }}
                >
                  <option value="All Levels" style={{ backgroundColor: '#0a2118', color: 'white' }}>All Levels</option>
                  <option value="Break 100" style={{ backgroundColor: '#0a2118', color: 'white' }}>Break 100</option>
                  <option value="Break 90" style={{ backgroundColor: '#0a2118', color: 'white' }}>Break 90</option>
                  <option value="Break 80" style={{ backgroundColor: '#0a2118', color: 'white' }}>Break 80</option>
                </select>

                {/* Focus Area Dropdown - Premium Dark Background */}
                <select
                  value={selectedMechanic}
                  onChange={(e) => setSelectedMechanic(e.target.value)}
                  className={`flex-1 min-w-[100px] px-3 py-2 rounded-lg text-white text-xs truncate focus:outline-none appearance-none cursor-pointer h-9 transition-all ${
                    selectedMechanic !== 'All' ? 'border-b-2 border-[#FFA500]' : ''
                  }`}
                  style={{ 
                    backgroundColor: '#0a2118',
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.75rem center',
                    backgroundSize: '16px 16px',
                    paddingRight: '2.75rem'
                  }}
                >
                  <option value="All" style={{ backgroundColor: '#0a2118', color: 'white' }}>All Focus Areas</option>
                  <option value="Ball Striking" style={{ backgroundColor: '#0a2118', color: 'white' }}>Ball Striking</option>
                  <option value="Short Game" style={{ backgroundColor: '#0a2118', color: 'white' }}>Short Game</option>
                  <option value="Putting" style={{ backgroundColor: '#0a2118', color: 'white' }}>Putting</option>
                  <option value="Strategy" style={{ backgroundColor: '#0a2118', color: 'white' }}>Strategy</option>
                </select>

                {/* Practice Mode Dropdown - Premium Dark Background */}
                <select
                  value={selectedPracticeMode}
                  onChange={(e) => setSelectedPracticeMode(e.target.value)}
                  className={`flex-1 min-w-[100px] px-3 py-2 rounded-lg text-white text-xs truncate focus:outline-none appearance-none cursor-pointer h-9 transition-all ${
                    selectedPracticeMode !== 'All Modes' ? 'border-b-2 border-[#FFA500]' : ''
                  }`}
                  style={{ 
                    backgroundColor: '#0a2118',
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.75rem center',
                    backgroundSize: '16px 16px',
                    paddingRight: '2.75rem'
                  }}
                >
                  <option value="All Modes" style={{ backgroundColor: '#0a2118', color: 'white' }}>All Modes</option>
                  <option value="Technique" style={{ backgroundColor: '#0a2118', color: 'white' }}>Technique</option>
                  <option value="Skill" style={{ backgroundColor: '#0a2118', color: 'white' }}>Skill</option>
                  <option value="Performance" style={{ backgroundColor: '#0a2118', color: 'white' }}>Performance</option>
                </select>
              </div>
            </div>
          </div>

          {/* Video Hero Section - Full Width, No Padding - Slide Down Animation */}
          <div
            className={`w-full overflow-hidden transition-all duration-500 ease-in-out ${
              selectedDrill ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            {selectedDrill && (
              <div className="w-full">
                {/* Video Player - Full Width with Close Button */}
                <div className="w-full aspect-video bg-gray-900 relative">
                  {/* Close Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedDrill(null);
                    }}
                    className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors"
                    aria-label="Close video"
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                  
                  {selectedDrill.type === 'video' && (
                    <iframe
                      src={selectedDrill.source}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  )}
                  {selectedDrill.type === 'pdf' && (
                    <iframe
                      src={selectedDrill.source}
                      className="w-full h-full"
                      title={selectedDrill.title}
                    />
                  )}
                  {selectedDrill.type === 'text' && (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100 p-6">
                      <div className="text-gray-800 leading-relaxed whitespace-pre-line text-sm max-w-2xl">
                        {selectedDrill.source}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Full-Width Gold Action Bar */}
                <button
                  onClick={openFullscreen}
                  className="w-full py-4 text-center font-semibold text-white transition-colors"
                  style={{ backgroundColor: '#FFA500' }}
                >
                  <ExternalLink className="w-5 h-5 inline mr-2" />
                  Open Fullscreen
                </button>
                
                {/* Title & Description - Below Action Bar */}
                <div className="px-4 py-4 bg-white">
                  <h2 className="font-bold text-xl text-gray-900 mb-2">{selectedDrill.title}</h2>
                  <p className="text-sm text-gray-600 mb-2">{selectedDrill.category} • {selectedDrill.level}</p>
                  <div className="flex items-center gap-2 mb-3">
                    {renderComplexityStars(selectedDrill.complexity)}
                    <span className="text-xs text-gray-500">Difficulty Rating</span>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{selectedDrill.description}</p>
                </div>
              </div>
            )}
          </div>

          {/* Drill List - 2-Column Grid, Full Width */}
          <div className="px-4 py-4">
            {/* Drill Grid - 2 Columns */}
            <div className="grid grid-cols-2 gap-3">
              {filteredDrills.map((drill) => {
                const completionCount = userProgress.drillCompletions?.[drill.id] || 0;
                const isCompletedDrill = isCompleted(drill.id);
                
                // Extract video ID for thumbnail
                const getThumbnailUrl = (source: string) => {
                  if (drill.type === 'video') {
                    const videoId = source.includes('youtube.com/embed/') 
                      ? source.split('youtube.com/embed/')[1]?.split('?')[0]
                      : source.includes('youtu.be/')
                      ? source.split('youtu.be/')[1]?.split('?')[0]
                      : null;
                    return videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : null;
                  }
                  return null;
                };
                const thumbnailUrl = getThumbnailUrl(drill.source);
                
                return (
                  <div
                    key={drill.id}
                    onClick={() => handleDrillClick(drill)}
                    className="bg-white rounded-lg border border-gray-200 hover:border-[#014421] transition-all cursor-pointer overflow-hidden shadow-sm relative"
                  >
                    {/* Thumbnail - Full Width */}
                    <div className="w-full aspect-video bg-gray-200 relative overflow-hidden">
                      {thumbnailUrl ? (
                        <img 
                          src={thumbnailUrl} 
                          alt={drill.title}
                          className="w-full h-full object-cover"
                        />
                      ) : drill.type === 'video' ? (
                        <div className="w-full h-full flex items-center justify-center bg-gray-300">
                          <Play className="w-8 h-8 text-gray-500" />
                        </div>
                      ) : drill.type === 'pdf' ? (
                        <div 
                          className="w-full h-full flex items-center justify-center"
                          style={{ backgroundColor: '#dbeafe' }}
                        >
                          <FileText className="w-8 h-8" style={{ color: '#2563eb' }} />
                        </div>
                      ) : (
                        <div 
                          className="w-full h-full flex items-center justify-center"
                          style={{ backgroundColor: '#dcfce7' }}
                        >
                          <FileText className="w-8 h-8" style={{ color: '#16a34a' }} />
                        </div>
                      )}
                      {/* Premium Lock Icon */}
                      {drill.accessType === 'premium' && (
                        <div className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center shadow-md bg-black/60">
                          <Lock className="w-4 h-4 text-[#FFA500]" />
                        </div>
                      )}
                      {/* XP Badge Overlay */}
                      <div 
                        className="absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-bold shadow-md"
                        style={{ 
                          backgroundColor: '#FFA500', 
                          color: '#014421'
                        }}
                      >
                        +{drill.xpValue} XP
                      </div>
                      {/* Completion Check */}
                      {isCompletedDrill && (
                        <div className="absolute bottom-2 left-2 w-6 h-6 rounded-full flex items-center justify-center shadow-md" style={{ backgroundColor: '#014421' }}>
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </div>
                    
                    {/* Card Content */}
                    <div className="p-3">
                      <div className="flex items-start justify-between mb-1">
                        <h3 className="font-semibold text-sm text-gray-900 line-clamp-2 flex-1 min-h-[2.5rem]">
                          {drill.title}
                        </h3>
                        {drill.accessType === 'premium' && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold text-[#FFA500] border border-[#FFA500] flex-shrink-0">
                            Premium
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mb-1">
                        {drill.category} • {drill.level}
                      </p>
                      {/* Complexity Rating and Practice Mode */}
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          {renderComplexityStars(drill.complexity)}
                          <span className="text-[10px] text-gray-400">Difficulty</span>
                        </div>
                        {drill.practiceMode && (
                          <span className="text-[10px] text-gray-500 font-medium">
                            {drill.practiceMode} • {drill.level === 'Foundation' ? 'Beginner' : drill.level === 'Performance' ? 'Intermediate' : 'Advanced'}
                          </span>
                        )}
                      </div>
                      {completionCount > 0 && (
                        <p className="text-xs text-[#014421] font-medium">
                          Completed {completionCount}x
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Desktop Layout - Vertical Stack */}
        <div className="hidden lg:flex flex-col">
          {/* Header Section - HUD Style - Sticky */}
          <div className="sticky top-0 z-30 backdrop-blur-md border-b border-white/5" style={{ backgroundColor: 'rgba(1, 68, 33, 0.95)' }}>
            {/* Header with Typography Refresh */}
            <div className="px-6 py-2.5">
              <div className="flex items-start justify-between gap-4">
                <h1 className="text-xl font-extrabold text-white">Library</h1>
                {/* Floating Level Bar Section */}
                <div className="flex flex-col items-end gap-1.5 flex-1 max-w-xs">
                  {/* Wrapper to match badge+XP row width exactly */}
                  <div className="flex flex-col items-end gap-1.5 ml-2">
                    {/* Level Badge and XP Counter Row */}
                    <div className="flex items-center gap-2">
                      {/* Elegant Level Badge */}
                      <span 
                        className="border rounded-md px-2.5 py-0.5 text-[10px] font-bold font-sans text-center"
                        style={{ 
                          borderColor: 'rgba(255, 165, 0, 0.5)',
                          color: '#FFA500'
                        }}
                      >
                        Level {currentLevel}
                      </span>
                      {/* Micro-Stats XP Counter */}
                      {/* Update Display: Use profile?.totalXP || 0 to match the Home Dashboard (synchronized from database) */}
                      <span className="tracking-widest text-[10px] text-gray-400 uppercase font-mono">
                        {totalXP} XP
                      </span>
                    </div>
                    {/* Ultra-Thin Floating Progress Bar with Neon Glow - Matched Width */}
                    <div className="relative bg-white/10 rounded-full h-0.5 overflow-hidden w-full">
                      {/* Progress Fill with Gradient and Neon Glow */}
                      <div
                        className="h-full rounded-full transition-all duration-500 relative overflow-hidden shadow-[0_0_8px_rgba(255,165,0,0.4)]"
                        style={{ width: `${levelProgress}%` }}
                      >
                        <div 
                          className="absolute inset-0"
                          style={{ background: 'linear-gradient(to right, #FFA500, #FF8C00)' }}
                        ></div>
                        {/* Shimmer Effect */}
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
                </div>
              </div>
            </div>

            {/* Glass Search Bar */}
            <div className="px-6 pb-2.5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/50 z-10" />
                <input
                  type="text"
                  placeholder="Search drills..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white/5 backdrop-blur-md rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-orange-500/30 focus:bg-white/10 text-sm border-t border-white/10"
                />
              </div>
            </div>

            {/* Premium Selectors - Side by Side */}
            <div className="px-6 pb-2.5">
              <div className="flex flex-wrap justify-center gap-2">
                {/* Skill Level Dropdown - Premium Dark Background */}
                <select
                  value={selectedLevel === 'All' ? 'All Levels' : selectedLevel === 'Foundation' ? 'Break 100' : selectedLevel === 'Performance' ? 'Break 90' : 'Break 80'}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === 'All Levels') setSelectedLevel('All');
                    else if (value === 'Break 100') setSelectedLevel('Foundation');
                    else if (value === 'Break 90') setSelectedLevel('Performance');
                    else if (value === 'Break 80') setSelectedLevel('Elite');
                  }}
                  className={`flex-1 min-w-[100px] px-3 py-2 rounded-lg text-white text-xs truncate focus:outline-none appearance-none cursor-pointer h-9 transition-all ${
                    selectedLevel !== 'All' ? 'border-b-2 border-[#FFA500]' : ''
                  }`}
                  style={{ 
                    backgroundColor: '#0a2118',
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.75rem center',
                    backgroundSize: '16px 16px',
                    paddingRight: '2.75rem'
                  }}
                >
                  <option value="All Levels" style={{ backgroundColor: '#0a2118', color: 'white' }}>All Levels</option>
                  <option value="Break 100" style={{ backgroundColor: '#0a2118', color: 'white' }}>Break 100</option>
                  <option value="Break 90" style={{ backgroundColor: '#0a2118', color: 'white' }}>Break 90</option>
                  <option value="Break 80" style={{ backgroundColor: '#0a2118', color: 'white' }}>Break 80</option>
                </select>

                {/* Focus Area Dropdown - Premium Dark Background */}
                <select
                  value={selectedMechanic}
                  onChange={(e) => setSelectedMechanic(e.target.value)}
                  className={`flex-1 min-w-[100px] px-3 py-2 rounded-lg text-white text-xs truncate focus:outline-none appearance-none cursor-pointer h-9 transition-all ${
                    selectedMechanic !== 'All' ? 'border-b-2 border-[#FFA500]' : ''
                  }`}
                  style={{ 
                    backgroundColor: '#0a2118',
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.75rem center',
                    backgroundSize: '16px 16px',
                    paddingRight: '2.75rem'
                  }}
                >
                  <option value="All" style={{ backgroundColor: '#0a2118', color: 'white' }}>All Focus Areas</option>
                  <option value="Ball Striking" style={{ backgroundColor: '#0a2118', color: 'white' }}>Ball Striking</option>
                  <option value="Short Game" style={{ backgroundColor: '#0a2118', color: 'white' }}>Short Game</option>
                  <option value="Putting" style={{ backgroundColor: '#0a2118', color: 'white' }}>Putting</option>
                  <option value="Strategy" style={{ backgroundColor: '#0a2118', color: 'white' }}>Strategy</option>
                </select>

                {/* Practice Mode Dropdown - Premium Dark Background */}
                <select
                  value={selectedPracticeMode}
                  onChange={(e) => setSelectedPracticeMode(e.target.value)}
                  className={`flex-1 min-w-[100px] px-3 py-2 rounded-lg text-white text-xs truncate focus:outline-none appearance-none cursor-pointer h-9 transition-all ${
                    selectedPracticeMode !== 'All Modes' ? 'border-b-2 border-[#FFA500]' : ''
                  }`}
                  style={{ 
                    backgroundColor: '#0a2118',
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.75rem center',
                    backgroundSize: '16px 16px',
                    paddingRight: '2.75rem'
                  }}
                >
                  <option value="All Modes" style={{ backgroundColor: '#0a2118', color: 'white' }}>All Modes</option>
                  <option value="Technique" style={{ backgroundColor: '#0a2118', color: 'white' }}>Technique</option>
                  <option value="Skill" style={{ backgroundColor: '#0a2118', color: 'white' }}>Skill</option>
                  <option value="Performance" style={{ backgroundColor: '#0a2118', color: 'white' }}>Performance</option>
                </select>
              </div>
            </div>
          </div>

          {/* Video Hero Section - Full Width - Slide Down Animation */}
          <div
            className={`w-full overflow-hidden transition-all duration-500 ease-in-out ${
              selectedDrill ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            {selectedDrill && (
              <div className="w-full">
                {/* Video Player - Full Width with Close Button */}
                <div className="w-full aspect-video bg-gray-900 relative">
                  {/* Close Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedDrill(null);
                    }}
                    className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors"
                    aria-label="Close video"
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                  
                  {selectedDrill.type === 'video' && (
                    <iframe
                      src={selectedDrill.source}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  )}
                  {selectedDrill.type === 'pdf' && (
                    <iframe
                      src={selectedDrill.source}
                      className="w-full h-full"
                      title={selectedDrill.title}
                    />
                  )}
                  {selectedDrill.type === 'text' && (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100 p-6">
                      <div className="text-gray-800 leading-relaxed whitespace-pre-line text-base max-w-2xl">
                        {selectedDrill.source}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Full-Width Gold Action Bar */}
                <button
                  onClick={openFullscreen}
                  className="w-full py-4 text-center font-semibold text-white transition-colors"
                  style={{ backgroundColor: '#FFA500' }}
                >
                  <ExternalLink className="w-5 h-5 inline mr-2" />
                  Open Fullscreen
                </button>
                
                {/* Title & Description */}
                <div className="px-6 py-4 bg-white">
                  <h2 className="font-bold text-xl text-gray-900 mb-2">{selectedDrill.title}</h2>
                  <p className="text-sm text-gray-600 mb-2">{selectedDrill.category} • {selectedDrill.level}</p>
                  <div className="flex items-center gap-2 mb-3">
                    {renderComplexityStars(selectedDrill.complexity)}
                    <span className="text-xs text-gray-500">Difficulty Rating</span>
                  </div>
                  <p className="text-base text-gray-700 leading-relaxed">{selectedDrill.description}</p>
                </div>
              </div>
            )}
          </div>

          {/* Drill List - Vertical List, Full Width */}
          <div className="px-6 py-4">
            <div className="space-y-3">
              {filteredDrills.map((drill) => {
                const completionCount = userProgress.drillCompletions?.[drill.id] || 0;
                const isCompletedDrill = isCompleted(drill.id);
                
                // Extract video ID for thumbnail
                const getThumbnailUrl = (source: string) => {
                  if (drill.type === 'video') {
                    const videoId = source.includes('youtube.com/embed/') 
                      ? source.split('youtube.com/embed/')[1]?.split('?')[0]
                      : source.includes('youtu.be/')
                      ? source.split('youtu.be/')[1]?.split('?')[0]
                      : null;
                    return videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : null;
                  }
                  return null;
                };
                const thumbnailUrl = getThumbnailUrl(drill.source);
                
                return (
                  <div
                    key={drill.id}
                    onClick={() => handleDrillClick(drill)}
                    className="bg-white rounded-lg border border-gray-200 hover:border-[#014421] transition-all cursor-pointer overflow-hidden shadow-sm relative"
                  >
                    <div className="flex items-center gap-3 p-4">
                      {/* Thumbnail */}
                      <div className="flex-shrink-0 w-24 h-24 rounded-lg bg-gray-200 relative overflow-hidden">
                        {thumbnailUrl ? (
                          <img 
                            src={thumbnailUrl} 
                            alt={drill.title}
                            className="w-full h-full object-cover"
                          />
                        ) : drill.type === 'video' ? (
                          <div className="w-full h-full flex items-center justify-center bg-gray-300">
                            <Play className="w-6 h-6 text-gray-500" />
                          </div>
                        ) : drill.type === 'pdf' ? (
                          <div 
                            className="w-full h-full flex items-center justify-center"
                            style={{ backgroundColor: '#dbeafe' }}
                          >
                            <FileText className="w-6 h-6" style={{ color: '#2563eb' }} />
                          </div>
                        ) : (
                          <div 
                            className="w-full h-full flex items-center justify-center"
                            style={{ backgroundColor: '#dcfce7' }}
                          >
                            <FileText className="w-6 h-6" style={{ color: '#16a34a' }} />
                          </div>
                        )}
                        {/* Premium Lock Icon */}
                        {drill.accessType === 'premium' && (
                          <div className="absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center shadow-md bg-black/60">
                            <Lock className="w-3 h-3 text-[#FFA500]" />
                          </div>
                        )}
                        {/* XP Badge Overlay */}
                        <div 
                          className="absolute top-1 right-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold shadow-md"
                          style={{ 
                            backgroundColor: '#FFA500', 
                            color: '#014421'
                          }}
                        >
                          +{drill.xpValue} XP
                        </div>
                        {/* Completion Check */}
                        {isCompletedDrill && (
                          <div className="absolute bottom-1 left-1 w-5 h-5 rounded-full flex items-center justify-center shadow-md" style={{ backgroundColor: '#014421' }}>
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </div>
                      
                      {/* Card Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-1">
                          <h3 className="font-semibold text-sm text-gray-900 line-clamp-2 flex-1">
                            {drill.title}
                          </h3>
                          {drill.accessType === 'premium' && (
                            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold text-[#FFA500] border border-[#FFA500] flex-shrink-0">
                              Premium
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mb-1">
                          {drill.category} • {drill.level}
                        </p>
                        {/* Complexity Rating and Practice Mode */}
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            {renderComplexityStars(drill.complexity)}
                            <span className="text-[10px] text-gray-400">Difficulty</span>
                          </div>
                          {drill.practiceMode && (
                            <span className="text-[10px] text-gray-500 font-medium">
                              {drill.practiceMode} • {drill.level === 'Foundation' ? 'Beginner' : drill.level === 'Performance' ? 'Intermediate' : 'Advanced'}
                            </span>
                          )}
                        </div>
                        {completionCount > 0 && (
                          <p className="text-xs text-[#014421] font-medium">
                            Completed {completionCount}x
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Paywall Modal */}
      {showPaywallModal && premiumDrill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 relative">
            {/* Close Button */}
            <button
              onClick={() => {
                setShowPaywallModal(false);
                setPremiumDrill(null);
              }}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>

            {/* Premium Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FFA500' }}>
                <Lock className="w-8 h-8 text-white" />
              </div>
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">
              Premium Content
            </h2>
            <p className="text-center text-gray-600 mb-6">
              {premiumDrill.title}
            </p>

            {/* Description */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-700 text-center">
                This premium drill is part of our advanced training library. Upgrade to access exclusive content, advanced techniques, and personalized coaching.
              </p>
            </div>

            {/* Features */}
            <div className="space-y-2 mb-6">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Check className="w-5 h-5 text-[#014421] flex-shrink-0" />
                <span>Access to all premium drills and lessons</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Check className="w-5 h-5 text-[#014421] flex-shrink-0" />
                <span>Advanced technique breakdowns</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Check className="w-5 h-5 text-[#014421] flex-shrink-0" />
                <span>Personalized practice plans</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={() => {
                  setShowPaywallModal(false);
                  setPremiumDrill(null);
                  // TODO: Navigate to upgrade page or trigger upgrade flow
                }}
                className="w-full py-3 rounded-lg font-semibold text-white transition-colors"
                style={{ backgroundColor: '#FFA500' }}
              >
                Upgrade to Premium
              </button>
              <button
                onClick={() => {
                  setShowPaywallModal(false);
                  setPremiumDrill(null);
                }}
                className="w-full py-3 rounded-lg font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LibraryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center">Loading...</div>}>
      <LibraryPageContent />
    </Suspense>
  );
}

