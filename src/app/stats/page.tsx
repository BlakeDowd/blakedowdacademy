"use client";

import { useEffect, useState, useRef } from "react";
import { useStats } from "@/contexts/StatsContext";
import { useAuth } from "@/contexts/AuthContext";
import { AreaChart, Area, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine, CartesianGrid, Tooltip, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from "recharts";
import Link from "next/link";
import { ArrowRight, Share2, CheckCircle2 } from "lucide-react";
import html2canvas from "html2canvas";

interface CategoryTime {
  category: string;
  minutes: number;
}

interface RoundData {
  date: string;
  course: string;
  handicap: number | null;
  holes: number;
  score: number | null;
  nett: number | null;
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doubleBogeys: number;
  firLeft: number;
  firHit: number;
  firRight: number;
  totalGir: number;
  totalPenalties: number;
  teePenalties: number;
  approachPenalties: number;
  goingForGreen: number;
  gir8ft: number;
  gir20ft: number;
  upAndDownConversions: number;
  missed: number;
  bunkerAttempts: number;
  bunkerSaves: number;
  chipInside6ft: number;
  doubleChips: number;
  totalPutts: number;
  threePutts: number;
  missed6ftAndIn: number;
  puttsUnder6ftAttempts: number; // Total attempts from < 6ft
}

// Linear scaling function: Maps handicap from 36 to +4 to goal percentages
// 36 handicap: GIR ~8%, FIR ~15%, Up & Down ~10%, Putts ~40, Within 8ft ~3%, Within 20ft ~15%, Chips Inside 6ft ~30%
// +4 professional: GIR ~70%, FIR ~75%, Up & Down ~65%, Putts ~26, Within 8ft ~15%, Within 20ft ~50%, Chips Inside 6ft ~70%
const getBenchmarkGoals = (handicap: number) => {
  // Clamp handicap between 36 and -4
  const clampedHandicap = Math.max(-4, Math.min(36, handicap));
  
  // Normalize to 0-1 range (36 = 0, -4 = 1)
  const normalized = (36 - clampedHandicap) / (36 - (-4));
  
  // Linear interpolation between extremes
  const gir = 8 + (70 - 8) * normalized;
  const fir = 15 + (75 - 15) * normalized;
  const upAndDown = 10 + (65 - 10) * normalized;
  const putts = 40 - (40 - 26) * normalized;
  const bunkerSaves = 10 + (50 - 10) * normalized; // 36 HCP: 10%, +4 Pro: 50%
  
  // Proximity targets: Pro (+4) = Within 8ft >15%, Within 20ft >50%, Chips Inside 6ft >70%
  // Scale down for higher handicaps
  const within8ft = 3 + (15 - 3) * normalized; // 36 HCP: 3%, +4 Pro: 15%
  const within20ft = 15 + (50 - 15) * normalized; // 36 HCP: 15%, +4 Pro: 50%
  const chipsInside6ft = 30 + (70 - 30) * normalized; // 36 HCP: 30%, +4 Pro: 70%
  
  // Putting targets: Pro (+4) = Make % from < 6ft >95%, 36-HCP = 60%
  const puttMake6ft = 60 + (95 - 60) * normalized; // 36 HCP: 60%, +4 Pro: 95%
  
  // Calculate approximate score (handicap + 72 for par 72 course)
  const score = clampedHandicap + 72;
  
  // Scoring distribution goals (scaled based on handicap)
  // +4 Pro: ~3.5 Birdies, ~13.5 Pars, ~3 Bogeys, ~0 Double Bogeys
  // 12.5 HCP: ~0.5 Birdies, ~8.5 Pars, ~7 Bogeys, ~2 Double Bogeys
  // 36 HCP: 0 Birdies, ~5 Pars, ~10 Bogeys, ~10 Double Bogeys
  const birdies = 0 + (3.5 - 0) * normalized; // 36 HCP: 0, +4 Pro: 3.5
  const pars = 5 + (13.5 - 5) * normalized; // 36 HCP: 5, +4 Pro: 13.5
  const eagles = 0; // No goal for eagles (rare)
  const bogeys = 10 - (10 - 3) * normalized; // 36 HCP: 10, +4 Pro: 3
  const doubleBogeys = 10 - (10 - 0) * normalized; // 36 HCP: 10, +4 Pro: 0
  
  return {
    score: Math.round(score),
    gir: Math.round(gir),
    fir: Math.round(fir),
    upAndDown: Math.round(upAndDown),
    putts: Math.round(putts * 10) / 10, // One decimal place
    bunkerSaves: Math.round(bunkerSaves),
    within8ft: Math.round(within8ft),
    within20ft: Math.round(within20ft),
    chipsInside6ft: Math.round(chipsInside6ft),
    puttMake6ft: Math.round(puttMake6ft),
    birdies: Math.round(birdies * 10) / 10, // One decimal place
    pars: Math.round(pars * 10) / 10,
    eagles: 0,
    bogeys: Math.round(bogeys * 10) / 10,
    doubleBogeys: Math.round(doubleBogeys * 10) / 10
  };
};

// Empty Stats State Component
const EmptyStatsState = () => {
  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="max-w-md mx-auto bg-white min-h-screen">
        <div className="pt-6 pb-4 px-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Game Overview</h1>
              <p className="text-gray-600 text-sm mt-1">Track your performance metrics</p>
            </div>
          </div>
        </div>
        <div className="px-4 py-20 text-center">
          <p className="text-gray-600 text-lg mb-4">No rounds found. Add your first round below!</p>
          <Link 
            href="/add-round"
            className="inline-block px-6 py-3 bg-[#014421] text-white font-semibold rounded-lg hover:bg-[#01331a] transition-colors"
          >
            Add Round
          </Link>
        </div>
      </div>
    </div>
  );
};

export default function StatsPage() {
  const { rounds, loading: statsLoading } = useStats();
  const { user, loading: authLoading } = useAuth();
  
  // Ensure rounds is always an array, never null or undefined
  const safeRounds = rounds || [];
  
  // Log rounds data for debugging
  useEffect(() => {
    console.log('Rounds data in Stats page:', safeRounds);
    console.log('Rounds length:', safeRounds?.length || 0);
    console.log('Stats loading state:', statsLoading);
  }, [safeRounds, statsLoading]);
  
  // Show loading state while data is being fetched
  if (authLoading || statsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#014421] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }
  
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
  
  const userDisplayName = getUserDisplayName();
  const [categoryTimes, setCategoryTimes] = useState<CategoryTime[]>([]);
  const [selectedGoal, setSelectedGoal] = useState<number>(8.7); // Default to 8.7 handicap
  const [holeFilter, setHoleFilter] = useState<'9' | '18'>('18'); // Filter for 9 vs 18 holes (binary, no 'all')
  const [historyLimit, setHistoryLimit] = useState<number | 'all'>(10); // History limit: Last 5, 10, 20, or All
  const [practiceInsights, setPracticeInsights] = useState<{
    totalHours: number;
    categoryDistribution: { name: string; value: number; color: string }[];
    totalSessions: number;
    totalXP: number;
    mostPracticed: string;
    consistency: number;
  } | null>(null);
  const [practiceTimeframe, setPracticeTimeframe] = useState<'week' | 'month' | 'year'>('month');
  const [selectedMetric, setSelectedMetric] = useState<'gross' | 'nettScore' | 'birdies' | 'pars' | 'bogeys' | 'doubleBogeys' | 'eagles' | 'fir' | 'gir' | 'totalPenalties' | 'penaltyRate' | 'gir8ft' | 'gir20ft' | 'upAndDown' | 'bunkerSaves' | 'chipInside6ft' | 'doubleChips' | 'totalPutts' | 'puttMake6ft' | 'threePutts'>('nettScore');
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const [visibleLines, setVisibleLines] = useState({
    nettScore: true,
    fir: true,
    gir: true,
    penaltyRate: true,
    puttMake6ft: true
  });
  const [showToast, setShowToast] = useState(false);
  const reportCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadCategoryTimes = () => {
      if (typeof window === 'undefined') return;

      const savedProgress = localStorage.getItem('userProgress');
      const savedDrills = localStorage.getItem('drillsData');

      if (!savedProgress || !savedDrills) {
        setCategoryTimes([
          { category: 'Putting', minutes: 60 },
          { category: 'Driving', minutes: 30 },
          { category: 'Short Game', minutes: 45 },
        ]);
        return;
      }

      const userProgress = JSON.parse(savedProgress);
      const drills = JSON.parse(savedDrills);

      const categoryMap: Record<string, number> = {};
      
      userProgress.completedDrills.forEach((drillId: string) => {
        const drill = drills.find((d: any) => d.id === drillId);
        if (drill) {
          categoryMap[drill.category] = (categoryMap[drill.category] || 0) + drill.estimatedMinutes;
        }
      });

      const times = Object.entries(categoryMap)
        .map(([category, minutes]) => ({ category, minutes }))
        .sort((a, b) => b.minutes - a.minutes);

      setCategoryTimes(times.length > 0 ? times : []);
    };

    loadCategoryTimes();
  }, []);

  // Load and calculate practice insights
  useEffect(() => {
    const loadPracticeInsights = () => {
      if (typeof window === 'undefined') return;

      // Load practice activity history
      const allPracticeHistory = JSON.parse(localStorage.getItem('practiceActivityHistory') || '[]');
      
      // Load userProgress for fallback logic
      const savedProgress = localStorage.getItem('userProgress');
      const userProgress = savedProgress ? JSON.parse(savedProgress) : null;
      
      // Filter practice history based on selected timeframe
      const now = new Date();
      now.setHours(23, 59, 59, 999); // End of today
      const cutoffDate = new Date();
      
      if (practiceTimeframe === 'week') {
        cutoffDate.setDate(now.getDate() - 7);
      } else if (practiceTimeframe === 'month') {
        cutoffDate.setDate(now.getDate() - 30);
      } else if (practiceTimeframe === 'year') {
        cutoffDate.setDate(now.getDate() - 365);
      }
      cutoffDate.setHours(0, 0, 0, 0); // Start of cutoff day
      
      const practiceHistory = allPracticeHistory.filter((activity: any) => {
        if (!activity.date && !activity.timestamp) return false;
        // Handle both date string (YYYY-MM-DD) and timestamp (ISO string)
        const dateStr = activity.timestamp || activity.date;
        const activityDate = new Date(dateStr);
        activityDate.setHours(0, 0, 0, 0); // Normalize to start of day
        return activityDate >= cutoffDate && activityDate <= now;
      });

      // Calculate total practice minutes for filtered timeframe
      const totalPracticeMinutes = practiceHistory.reduce((sum: number, activity: any) => {
        const duration = activity.duration || activity.estimatedMinutes || 0;
        return sum + duration;
      }, 0);
      const totalHours = totalPracticeMinutes / 60;

      // Calculate total XP for filtered timeframe
      const totalXP = practiceHistory.reduce((sum: number, activity: any) => {
        return sum + (activity.xp || 0);
      }, 0);

      // Count total sessions (Roadmap + Freestyle) for filtered timeframe
      const totalSessions = practiceHistory.length;

      // Define all 8 library categories
      const allCategories = [
        'Putting',
        'Driving',
        'Irons',
        'Short Game',
        'Wedge Play',
        'Skills',
        'On-Course',
        'Mental Game'
      ];

      // Calculate minutes by category (keep all 9 separate)
      const categoryMinutes: Record<string, number> = {
        'Putting': 0,
        'Driving': 0,
        'Irons': 0,
        'Short Game': 0,
        'Wedge Play': 0,
        'Skills': 0,
        'On-Course': 0,
        'Mental Game': 0,
      };

      // Process practice history - map to specific categories
      practiceHistory.forEach((activity: any) => {
        const category = activity.category || '';
        // For freestyle practice, use duration field; for roadmap drills, use estimatedMinutes
        let duration = activity.duration || 0;
        if (duration === 0 && activity.estimatedMinutes) {
          duration = activity.estimatedMinutes;
        }
        // If still 0, try to get from facility-based estimate (freestyle practice)
        if (duration === 0 && activity.facility) {
          // Estimate based on typical session: 30 minutes default for freestyle
          duration = 30;
        }
        
        // Map to specific category (exact match or contains)
        let matchedCategory: string | null = null;
        
        // Try exact match first
        if (allCategories.includes(category)) {
          matchedCategory = category;
        } else {
          // Try partial match
          for (const cat of allCategories) {
            if (category.toLowerCase().includes(cat.toLowerCase()) || 
                cat.toLowerCase().includes(category.toLowerCase())) {
              matchedCategory = cat;
              break;
            }
          }
        }
        
        // For freestyle practice without category, infer from facility
        if (!matchedCategory && activity.facility) {
          const facility = activity.facility as string;
          if (facility.includes('putting') || facility.includes('green')) {
            matchedCategory = 'Putting';
          } else if (facility.includes('chipping') || facility.includes('bunker')) {
            matchedCategory = 'Short Game';
          } else if (facility.includes('range') || facility.includes('driving')) {
            matchedCategory = 'Driving';
          } else {
            // Default to Skills if no match
            matchedCategory = 'Skills';
          }
        }
        
        // Default to Skills if still no match
        if (!matchedCategory) {
          matchedCategory = 'Skills';
        }
        
        // Add duration to matched category
        categoryMinutes[matchedCategory] = (categoryMinutes[matchedCategory] || 0) + duration;
      });

      // Also check userProgress.totalMinutes if available and no detailed breakdown
      // Guard clause: ensure userProgress exists before accessing properties
      if (!userProgress) {
        // If userProgress doesn't exist, skip fallback logic
      } else if (userProgress.totalMinutes && totalPracticeMinutes === 0) {
        // Fallback: distribute totalMinutes proportionally across all 9 categories if we don't have detailed breakdown
        const total = userProgress.totalMinutes;
        categoryMinutes['Putting'] = total * 0.15;
        categoryMinutes['Driving'] = total * 0.15;
        categoryMinutes['Irons'] = total * 0.12;
        categoryMinutes['Short Game'] = total * 0.12;
        categoryMinutes['Wedge Play'] = total * 0.12;
        categoryMinutes['Skills'] = total * 0.12;
        categoryMinutes['On-Course'] = total * 0.12;
        categoryMinutes['Mental Game'] = total * 0.1;
      }

      // Create chart data - always include all 8 categories for RadarChart
      const COLORS = ['#014421', '#FFA500', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];
      const categoryDistribution = allCategories.map((cat, index) => ({
        name: cat,
        value: categoryMinutes[cat] || 0,
        color: COLORS[index % COLORS.length]
      })); // Always show all 8 categories, zero-fill if no practice

      // Find most practiced category (from the 8 categories)
      const mostPracticed = allCategories
        .map(cat => ({ name: cat, minutes: categoryMinutes[cat] || 0 }))
        .sort((a, b) => b.minutes - a.minutes)[0]?.name || 'None';

      // Calculate practice consistency (days with practice in last 7 days)
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - i);
        return date.toISOString().split('T')[0];
      });
      
      const daysWithPractice = last7Days.filter(date => 
        practiceHistory.some((activity: any) => activity.date === date)
      ).length;
      const consistency = Math.round((daysWithPractice / 7) * 100);

      setPracticeInsights({
        totalHours,
        categoryDistribution,
        totalSessions,
        totalXP,
        mostPracticed,
        consistency,
      });
    };

    loadPracticeInsights();

    // Listen for practice updates
    const handlePracticeUpdate = () => {
      loadPracticeInsights();
    };

    window.addEventListener('practiceActivityUpdated', handlePracticeUpdate);
    window.addEventListener('userProgressUpdated', handlePracticeUpdate);

    return () => {
      window.removeEventListener('practiceActivityUpdated', handlePracticeUpdate);
      window.removeEventListener('userProgressUpdated', handlePracticeUpdate);
    };
  }, [practiceTimeframe]);

  // Center the chart scroll on mount and when timeframe changes
  useEffect(() => {
    if (chartScrollRef.current) {
      // Calculate center scroll position
      const scrollWidth = chartScrollRef.current.scrollWidth;
      const clientWidth = chartScrollRef.current.clientWidth;
      const centerScroll = (scrollWidth - clientWidth) / 2;
      chartScrollRef.current.scrollLeft = centerScroll;
    }
  }, [practiceTimeframe, practiceInsights]);

  // Get last 10 rounds for handicap trend
  const last10Rounds = safeRounds?.length > 0 
    ? safeRounds.slice(-10).filter(r => r.handicap !== null && r.handicap !== undefined)
    : [];

  // Calculate averages for performance rings and proximity metrics
  const calculateAverages = () => {
    if (!safeRounds || safeRounds.length === 0) {
      return { 
        handicap: 'N/A',
        fir: 0, 
        gir: 0, 
        upAndDown: 0, 
        bunkerSaves: 0,
        within8ft: 0,
        within20ft: 0,
        chipsInside6ft: 0,
        doubleChips: 0,
        penaltyRate: 0,
        puttMake6ft: 0,
        avgApproachPenalties: 0
      };
    }

    let totalFIR = 0;
    let totalGIR = 0;
    let totalHoles = 0;
    let totalUpAndDown = 0;
    let totalUpAndDownOpps = 0;
    let totalBunkerSaves = 0;
    let totalBunkerAttempts = 0;
    
    // Proximity metrics
    let totalWithin8ft = 0;
    let totalWithin20ft = 0;
    let totalChipInside6ft = 0;
    let totalChipOpportunities = 0;
    let totalDoubleChips = 0;

    safeRounds.forEach(round => {
      const totalFIRShots = round.firLeft + round.firHit + round.firRight;
      if (totalFIRShots > 0) {
        totalFIR += (round.firHit / totalFIRShots) * 100;
      }
      totalGIR += round.totalGir;
      totalHoles += round.holes || 18;
      totalUpAndDown += round.upAndDownConversions;
      totalUpAndDownOpps += round.upAndDownConversions + round.missed;
      
      // Approach Proximity: Within 8ft and Within 20ft (based on GIR proximity flags)
      totalWithin8ft += round.gir8ft;
      totalWithin20ft += round.gir8ft + round.gir20ft; // Within 20ft includes both 8ft and 20ft
      
      // Scrambling Proximity: Chip Inside 6ft
      totalChipInside6ft += round.chipInside6ft;
      totalChipOpportunities += round.upAndDownConversions + round.missed; // Total scrambling opportunities
      
      // Bunker Saves
      totalBunkerSaves += round.bunkerSaves;
      totalBunkerAttempts += round.bunkerAttempts;
      
      // Double Chips
      totalDoubleChips += round.doubleChips || 0;
    });

    // Bunker Saves percentage
    const bunkerSaves = totalBunkerAttempts > 0
      ? (totalBunkerSaves / totalBunkerAttempts) * 100
      : 0;
    
    // Approach Proximity percentages
    const within8ft = totalGIR > 0 ? (totalWithin8ft / totalGIR) * 100 : 0;
    const within20ft = totalGIR > 0 ? (totalWithin20ft / totalGIR) * 100 : 0;
    
    // Scrambling Proximity: Chip Inside 6ft %
    const chipsInside6ft = totalChipOpportunities > 0
      ? (totalChipInside6ft / totalChipOpportunities) * 100
      : 0;

    // Double Chips: Season Average (per round, not percentage)
    const avgDoubleChips = safeRounds.length > 0 ? totalDoubleChips / (safeRounds.length || 1) : 0;

    // Approach Penalties: Average per round
    const avgApproachPenalties = safeRounds.length > 0 
      ? safeRounds.reduce((sum, r) => sum + (r.approachPenalties || 0), 0) / (safeRounds.length || 1) 
      : 0;

    // Calculate Penalty Rate %
    const totalPenalties = safeRounds?.length > 0 ? safeRounds.reduce((sum, r) => sum + (r.totalPenalties || 0), 0) : 0;
    const penaltyRate = totalHoles > 0 ? (totalPenalties / totalHoles) * 100 : 0;
    
    // Calculate < 6ft Make %
    const totalPuttsUnder6ftAttempts = safeRounds?.length > 0 ? safeRounds.reduce((sum, r) => sum + (r.puttsUnder6ftAttempts || 0), 0) : 0;
    const totalMissed6ft = safeRounds?.length > 0 ? safeRounds.reduce((sum, r) => sum + (r.missed6ftAndIn || 0), 0) : 0;
    const puttMake6ft = totalPuttsUnder6ftAttempts > 0
      ? ((totalPuttsUnder6ftAttempts - totalMissed6ft) / totalPuttsUnder6ftAttempts) * 100
      : 0;

    // Get handicap from last round if available
    const lastRound = safeRounds.length > 0 ? safeRounds[safeRounds.length - 1] : null;
    const handicap = lastRound?.handicap !== null && lastRound?.handicap !== undefined 
      ? lastRound.handicap.toFixed(1) 
      : 'N/A';
    
    return {
      handicap: handicap,
      fir: safeRounds.length > 0 ? totalFIR / (safeRounds.length || 1) : 0,
      gir: totalHoles > 0 ? (totalGIR / totalHoles) * 100 : 0,
      upAndDown: totalUpAndDownOpps > 0 ? (totalUpAndDown / totalUpAndDownOpps) * 100 : 0,
      bunkerSaves: bunkerSaves,
      within8ft: within8ft,
      within20ft: within20ft,
      chipsInside6ft: chipsInside6ft,
      doubleChips: avgDoubleChips,
      penaltyRate: penaltyRate,
      puttMake6ft: puttMake6ft,
      avgApproachPenalties: avgApproachPenalties
    };
  };

  const averages = calculateAverages();

  // Load recent practice activities for report
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const practiceHistory = JSON.parse(localStorage.getItem('practiceActivityHistory') || '[]');
      // Get practice activities from last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      sevenDaysAgo.setHours(0, 0, 0, 0);
      
      const filtered = practiceHistory.filter((activity: any) => {
        const activityDate = new Date(activity.timestamp || activity.date || 0);
        activityDate.setHours(0, 0, 0, 0);
        return activityDate >= sevenDaysAgo;
      });
      
      // Sort by date (newest first)
      const sorted = filtered
        .sort((a: any, b: any) => {
          const dateA = new Date(a.timestamp || a.date || 0).getTime();
          const dateB = new Date(b.timestamp || b.date || 0).getTime();
          return dateB - dateA;
        });
      setRecentActivities(sorted);
    }
  }, []);

  // Export report function - Full page capture with render delay for charts
  const handleExportReport = async () => {
    if (!reportCardRef.current) return;
    
    try {
      // Small delay to ensure SVG charts are fully rendered
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const canvas = await html2canvas(reportCardRef.current, {
        backgroundColor: '#014421',
        scale: 2,
        logging: false,
        useCORS: true,
        height: reportCardRef.current.scrollHeight,
        width: reportCardRef.current.scrollWidth,
        windowWidth: reportCardRef.current.scrollWidth,
        windowHeight: reportCardRef.current.scrollHeight,
        scrollX: 0,
        scrollY: 0,
        allowTaint: false,
        onclone: (clonedDoc: any) => {
          // Ensure all SVG elements are visible in the cloned document
          const svgs = clonedDoc.querySelectorAll('svg');
          svgs.forEach((svg: any) => {
            svg.style.display = 'block';
            svg.style.visibility = 'visible';
          });
        }
      } as any);
      
      // Convert canvas to blob and download
      canvas.toBlob((blob) => {
        if (!blob) return;
        
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Elite-Academy-Report-${new Date().toISOString().split('T')[0]}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        // Show success toast
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
      }, 'image/png');
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Failed to generate report. Please try again.');
    }
  };

  // Calculate Driving Distribution (Left/Hit/Right percentages)
  const calculateDrivingDistribution = () => {
    if (!safeRounds || safeRounds.length === 0) {
      return {
        hitPercent: 0,
        leftPercent: 0,
        rightPercent: 0,
        totalShots: 0
      };
    }

    let totalLeft = 0;
    let totalHit = 0;
    let totalRight = 0;

    safeRounds.forEach(round => {
      totalLeft += round.firLeft || 0;
      totalHit += round.firHit || 0;
      totalRight += round.firRight || 0;
    });

    const totalShots = totalLeft + totalHit + totalRight;

    if (totalShots === 0) {
      return {
        hitPercent: 0,
        leftPercent: 0,
        rightPercent: 0,
        totalShots: 0
      };
    }

    return {
      hitPercent: (totalHit / totalShots) * 100,
      leftPercent: (totalLeft / totalShots) * 100,
      rightPercent: (totalRight / totalShots) * 100,
      totalShots: totalShots
    };
  };

  const drivingDistribution = calculateDrivingDistribution();

  // Get benchmark goals based on selected goal handicap (reactive to slider)
  const goals = getBenchmarkGoals(selectedGoal);

  // Calculate putting averages (Missed < 6ft and 3-Putts as primary metrics)
  const calculatePuttingStats = () => {
    if (!safeRounds || safeRounds.length === 0) {
      return {
        avgTotalPutts: 0,
        avgMissed6ft: 0,
        avgThreePutts: 0,
        makePercent6ft: [] // Array for trend graph
      };
    }

    const totalPutts = safeRounds.reduce((sum, r) => sum + (r.totalPutts || 0), 0);
    const totalMissed = safeRounds.reduce((sum, r) => sum + (r.missed6ftAndIn || 0), 0);
    const totalThreePutts = safeRounds.reduce((sum, r) => sum + (r.threePutts || 0), 0);
    
    // Calculate Make % from < 6ft for last 5 rounds
    const last5Rounds = safeRounds.slice(-5).reverse(); // Most recent first
    const makePercent6ft = last5Rounds.map(round => {
      // Use puttsUnder6ftAttempts if available, otherwise estimate
      const attempts = round.puttsUnder6ftAttempts > 0 
        ? round.puttsUnder6ftAttempts 
        : (round.missed6ftAndIn + Math.max(1, round.totalPutts * 0.3)); // Fallback estimate
      const made = attempts - round.missed6ftAndIn;
      return attempts > 0 ? (made / attempts) * 100 : 0;
    });

    return {
      avgTotalPutts: safeRounds.length > 0 ? totalPutts / (safeRounds.length || 1) : 0,
      avgMissed6ft: safeRounds.length > 0 ? totalMissed / (safeRounds.length || 1) : 0,
      avgThreePutts: safeRounds.length > 0 ? totalThreePutts / (safeRounds.length || 1) : 0,
      makePercent6ft: makePercent6ft // Array for trend graph
    };
  };

  const puttingStats = calculatePuttingStats();

  // Map round errors to library categories and specific drills
  const errorToDrillMapping: Record<string, { libraryCategory: string; drillId?: string; drillName?: string }> = {
    'Putting': { libraryCategory: 'Putting', drillId: '4', drillName: 'Putting Practice Routine' },
    'Driving': { libraryCategory: 'Driving', drillId: '2', drillName: 'Driving Range Fundamentals' },
    'Approach': { libraryCategory: 'Irons', drillId: '1', drillName: 'Mastering Your Short Game' },
    'Short Game': { libraryCategory: 'Short Game', drillId: '1', drillName: 'Mastering Your Short Game' },
    'Sand Play': { libraryCategory: 'Short Game', drillId: '1', drillName: 'Mastering Your Short Game' },
  };

  // Determine most needed improvement with gap analysis
  const getMostNeededImprovement = () => {
    if (!safeRounds || safeRounds.length === 0) {
      return { 
        category: 'Get Started', 
        message: 'Log your first round to see personalized insights!', 
        severity: 0,
        isPriority: false,
        libraryCategory: null,
        recommendedDrillId: null
      };
    }

    // PRIORITY CHECK: Missed < 6ft > 2
    const lastRound = safeRounds[safeRounds.length - 1];
    if (lastRound && lastRound.missed6ftAndIn > 2) {
      return {
        category: '⚠️ Putting Focus',
        message: `You missed ${lastRound.missed6ftAndIn} putts inside 6ft in your last round. Try the "Gate Drill" in the Library.`,
        severity: 100,
        isPriority: true,
        libraryCategory: 'Putting',
        recommendedDrillId: '4'
      };
    }

    // Also check average
    if (puttingStats.avgMissed6ft > 2) {
      return {
        category: '🔥 Putting Alert',
        message: 'You are missing too many short putts. Head to the Library.',
        severity: 100,
        isPriority: true,
        libraryCategory: 'Putting',
        recommendedDrillId: '4'
      };
    }

    const issues: Array<{ category: string; message: string; severity: number; isPriority: boolean; libraryCategory: string | null; recommendedDrillId: string | null }> = [];

    // Check GIR Gap
    const girGap = goals.gir - averages.gir;
    if (girGap > 0) {
      issues.push({ 
        category: 'Approach', 
        message: `You are currently ${Math.round(girGap)}% away from your GIR goal`,
        severity: girGap,
        isPriority: false,
        libraryCategory: errorToDrillMapping['Approach']?.libraryCategory || 'Irons',
        recommendedDrillId: errorToDrillMapping['Approach']?.drillId || null
      });
    }

    // Check FIR Gap
    const firGap = goals.fir - averages.fir;
    if (firGap > 0) {
      issues.push({ 
        category: 'Driving', 
        message: `You are currently ${Math.round(firGap)}% away from your FIR goal`,
        severity: firGap,
        isPriority: false,
        libraryCategory: errorToDrillMapping['Driving']?.libraryCategory || 'Driving',
        recommendedDrillId: errorToDrillMapping['Driving']?.drillId || null
      });
    }

    // Check Up & Down Gap
    const upAndDownGap = goals.upAndDown - averages.upAndDown;
    if (upAndDownGap > 0) {
      issues.push({ 
        category: 'Short Game', 
        message: `You are currently ${Math.round(upAndDownGap)}% away from your Up & Down goal`,
        severity: upAndDownGap,
        isPriority: false,
        libraryCategory: errorToDrillMapping['Short Game']?.libraryCategory || 'Short Game',
        recommendedDrillId: errorToDrillMapping['Short Game']?.drillId || null
      });
    }

    // Check Putting Gap
    const puttsGap = puttingStats.avgTotalPutts - goals.putts;
    if (puttsGap > 0) {
      issues.push({ 
        category: 'Putting', 
        message: `You are currently ${(puttsGap ?? 0).toFixed(1)} putts away from your goal of ${goals.putts ?? 0}`,
        severity: puttsGap,
        isPriority: false,
        libraryCategory: errorToDrillMapping['Putting']?.libraryCategory || 'Putting',
        recommendedDrillId: errorToDrillMapping['Putting']?.drillId || null
      });
    }

    // Check Bunker Saves
    if (safeRounds && safeRounds.length > 0) {
      const totalBunkerAttempts = safeRounds.reduce((sum, r) => sum + (r.bunkerAttempts || 0), 0);
      if (totalBunkerAttempts > 0) {
        const totalBunkerSaves = safeRounds.reduce((sum, r) => sum + (r.bunkerSaves || 0), 0);
      const bunkerSaveRate = (totalBunkerSaves / totalBunkerAttempts) * 100;
      
        const bunkerSavesPercent = (totalBunkerSaves / totalBunkerAttempts) * 100;
        const bunkerGap = goals.bunkerSaves - bunkerSavesPercent;
        if (bunkerGap > 0) {
          issues.push({ 
            category: 'Sand Play', 
            message: `You are currently ${Math.round(bunkerGap)}% away from your Bunker Saves goal`,
            severity: bunkerGap,
            isPriority: false,
            libraryCategory: errorToDrillMapping['Sand Play']?.libraryCategory || 'Short Game',
            recommendedDrillId: errorToDrillMapping['Sand Play']?.drillId || null
          });
        }
      }
    }

    if (issues.length === 0) {
      return { 
        category: 'Great Work!', 
        message: `You're meeting all your goals for a ${goals.score ?? 0} score (${(selectedGoal ?? 0).toFixed(1)} handicap)! Keep it up!`, 
        severity: 0,
        isPriority: false,
        libraryCategory: null,
        recommendedDrillId: null
      };
    }

    // Return the issue with highest severity
    return issues.sort((a, b) => b.severity - a.severity)[0];
  };

  const improvement = getMostNeededImprovement();

  // Simplified AreaChart Component
  const renderMasterCorrelationChart = () => {
    // Filter rounds by hole count (binary: 9 or 18 only)
    const filteredRounds = safeRounds.filter(r => r.holes === (holeFilter === '9' ? 9 : 18));
    
    // Check if filtered rounds exist or no rounds at all
    if (!safeRounds || safeRounds.length === 0 || filteredRounds.length === 0) {
      return (
        <div className="px-4 mb-6">
          <div className="rounded-2xl p-4" style={{ backgroundColor: '#014421' }}>
            <div className="flex flex-col gap-4 mb-4">
              <h2 className="text-lg font-semibold text-white text-center">Performance Trend</h2>
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2 w-full justify-center">
                  <label className="text-sm font-medium text-white whitespace-nowrap">Select Metric:</label>
                  <select
                    value={selectedMetric}
                    onChange={(e) => setSelectedMetric(e.target.value as typeof selectedMetric)}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-white text-black border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#FFA500] focus:border-[#FFA500] min-w-[200px]"
                    style={{
                      color: '#000000',
                      backgroundColor: '#ffffff'
                    }}
                  >
                    <option value="gross" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Gross Score</option>
                    <option value="nettScore" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Nett Score</option>
                    <option value="birdies" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Birdies</option>
                    <option value="pars" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Pars</option>
                    <option value="bogeys" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Bogeys</option>
                    <option value="doubleBogeys" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Double Bogeys</option>
                    <option value="eagles" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Eagles</option>
                    <option value="fir" style={{ color: '#000000', backgroundColor: '#ffffff' }}>FIR %</option>
                    <option value="gir" style={{ color: '#000000', backgroundColor: '#ffffff' }}>GIR %</option>
                    <option value="totalPenalties" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Total Penalties</option>
                    <option value="penaltyRate" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Penalty Rate %</option>
                    <option value="gir8ft" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Within 8ft %</option>
                    <option value="gir20ft" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Within 20ft %</option>
                    <option value="upAndDown" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Up & Down %</option>
                    <option value="bunkerSaves" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Bunker Saves %</option>
                    <option value="chipInside6ft" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Chip Inside 6ft</option>
                    <option value="doubleChips" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Double Chips</option>
                    <option value="totalPutts" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Total Putts</option>
                    <option value="puttMake6ft" style={{ color: '#000000', backgroundColor: '#ffffff' }}>&lt; 6ft Make %</option>
                    <option value="threePutts" style={{ color: '#000000', backgroundColor: '#ffffff' }}>3-Putts</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/70">Filter:</span>
                  <button
                    onClick={() => setHoleFilter('9')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      holeFilter === '9' 
                        ? 'bg-white text-[#014421]' 
                        : 'bg-white/20 text-white/70'
                    }`}
                  >
                    9 Holes
                  </button>
                  <button
                    onClick={() => setHoleFilter('18')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      holeFilter === '18' 
                        ? 'bg-white text-[#014421]' 
                        : 'bg-white/20 text-white/70'
                    }`}
                  >
                    18 Holes
                  </button>
                </div>
              </div>
            </div>
            <div className="py-20 text-center">
              <p className="text-white/80 text-sm">
                {!safeRounds || safeRounds.length === 0 ? 'No data available. Log your first round to see trends!' : 'No data for this filter'}
              </p>
            </div>
          </div>
        </div>
      );
    }
    
    // Filter by hole filter (9 or 18) first
    const holeFilteredRounds = safeRounds.filter(r => {
      if (holeFilter === '9') return r.holes === 9;
      return r.holes === 18;
    });
    
    if (holeFilteredRounds.length === 0) {
      return (
        <div className="px-4 mb-6">
          <div className="rounded-2xl p-4" style={{ backgroundColor: '#014421' }}>
            <div className="flex flex-col gap-4 mb-4">
              <h2 className="text-lg font-semibold text-white text-center">Performance Trend</h2>
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2 w-full justify-center">
                  <label className="text-sm font-medium text-white whitespace-nowrap">Select Metric:</label>
                  <select
                    value={selectedMetric}
                    onChange={(e) => setSelectedMetric(e.target.value as typeof selectedMetric)}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-white text-black border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#FFA500] focus:border-[#FFA500] min-w-[200px]"
                    style={{
                      color: '#000000',
                      backgroundColor: '#ffffff'
                    }}
                  >
                    <option value="gross" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Gross Score</option>
                    <option value="nettScore" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Nett Score</option>
                    <option value="birdies" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Birdies</option>
                    <option value="pars" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Pars</option>
                    <option value="bogeys" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Bogeys</option>
                    <option value="doubleBogeys" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Double Bogeys</option>
                    <option value="eagles" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Eagles</option>
                    <option value="fir" style={{ color: '#000000', backgroundColor: '#ffffff' }}>FIR %</option>
                    <option value="gir" style={{ color: '#000000', backgroundColor: '#ffffff' }}>GIR %</option>
                    <option value="totalPenalties" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Total Penalties</option>
                    <option value="penaltyRate" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Penalty Rate %</option>
                    <option value="gir8ft" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Within 8ft %</option>
                    <option value="gir20ft" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Within 20ft %</option>
                    <option value="upAndDown" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Up & Down %</option>
                    <option value="bunkerSaves" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Bunker Saves %</option>
                    <option value="chipInside6ft" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Chip Inside 6ft</option>
                    <option value="doubleChips" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Double Chips</option>
                    <option value="totalPutts" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Total Putts</option>
                    <option value="puttMake6ft" style={{ color: '#000000', backgroundColor: '#ffffff' }}>&lt; 6ft Make %</option>
                    <option value="threePutts" style={{ color: '#000000', backgroundColor: '#ffffff' }}>3-Putts</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/70">Filter:</span>
                  <button
                    onClick={() => setHoleFilter('9')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      holeFilter === '9' 
                        ? 'bg-white text-[#014421]' 
                        : 'bg-white/20 text-white/70'
                    }`}
                  >
                    9 Holes
                  </button>
                  <button
                    onClick={() => setHoleFilter('18')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      holeFilter === '18' 
                        ? 'bg-white text-[#014421]' 
                        : 'bg-white/20 text-white/70'
                    }`}
                  >
                    18 Holes
                  </button>
                </div>
              </div>
            </div>
            <div className="py-20 text-center">
              <p className="text-white/80 text-sm">
                {!safeRounds || safeRounds.length === 0 ? 'No data available. Log your first round to see trends!' : 'No data for this filter'}
              </p>
            </div>
          </div>
        </div>
      );
    }
    
    // Sort by date (oldest to newest for chart)
    const allRounds = [...holeFilteredRounds].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    
    // Apply history limit to create displayed data
    const displayedData = historyLimit === 'all' 
      ? allRounds 
      : allRounds.slice(-historyLimit);
    
    // Map displayed data to chart data points
    const chartData = displayedData.map((round, index) => {
      const totalFIRShots = round.firLeft + round.firHit + round.firRight;
      const firPercent = totalFIRShots > 0 ? (round.firHit / totalFIRShots) * 100 : 0;
      const girPercent = (round.holes || 18) > 0 ? (round.totalGir / (round.holes || 18)) * 100 : 0;
      const puttMake6ft = round.puttsUnder6ftAttempts > 0 
        ? ((round.puttsUnder6ftAttempts - round.missed6ftAndIn) / round.puttsUnder6ftAttempts) * 100 
        : 0;
      const upAndDownPercent = (round.upAndDownConversions + round.missed) > 0
        ? (round.upAndDownConversions / (round.upAndDownConversions + round.missed)) * 100
        : 0;
      const bunkerSavesPercent = round.bunkerAttempts > 0
        ? (round.bunkerSaves / round.bunkerAttempts) * 100
        : 0;
      const gir8ftPercent = round.totalGir > 0
        ? (round.gir8ft / round.totalGir) * 100
        : 0;
      const gir20ftPercent = round.totalGir > 0
        ? ((round.gir8ft + round.gir20ft) / round.totalGir) * 100
        : 0;
      
      let value = 0;
      switch (selectedMetric) {
        case 'gross':
          value = round.score || 0;
          break;
        case 'nettScore':
          value = round.nett || 0;
          break;
        case 'birdies':
          value = round.birdies || 0;
          break;
        case 'pars':
          value = round.pars || 0;
          break;
        case 'bogeys':
          value = round.bogeys || 0;
          break;
        case 'doubleBogeys':
          value = round.doubleBogeys || 0;
          break;
        case 'eagles':
          value = round.eagles || 0;
          break;
        case 'fir':
          value = firPercent;
          break;
        case 'gir':
          value = girPercent;
          break;
        case 'totalPenalties':
          value = round.totalPenalties || 0;
          break;
        case 'penaltyRate':
          const totalHolesForRound = round.holes || 18;
          value = totalHolesForRound > 0 ? ((round.totalPenalties || 0) / totalHolesForRound) * 100 : 0;
          break;
        case 'gir8ft':
          value = gir8ftPercent;
          break;
        case 'gir20ft':
          value = gir20ftPercent;
          break;
        case 'upAndDown':
          value = upAndDownPercent;
          break;
        case 'bunkerSaves':
          value = bunkerSavesPercent;
          break;
        case 'chipInside6ft':
          value = round.chipInside6ft || 0;
          break;
        case 'doubleChips':
          value = round.doubleChips || 0;
          break;
        case 'totalPutts':
          value = round.totalPutts || 0;
          break;
        case 'puttMake6ft':
          value = puttMake6ft;
          break;
        case 'threePutts':
          value = round.threePutts || 0;
          break;
      }
      
      return {
        round: `Round ${index + 1}`, // Round 1, Round 2, etc. (chronological order)
        value: value,
        date: round.date // Keep date for tooltip only
      };
    });
    
    // Get goals for dynamic goal line
    const goals = getBenchmarkGoals(selectedGoal);
    
    // Calculate goal value and determine if metric is percentage or total
    let goalValue: number | null = null;
    let chartTitle = '';
    let isPercentage = false;
    
    switch (selectedMetric) {
      case 'gross':
        goalValue = selectedGoal + 72; // Target gross score
        chartTitle = 'Gross Score';
        break;
      case 'nettScore':
        goalValue = selectedGoal + 72;
        chartTitle = 'Nett Score';
        break;
      case 'birdies':
        goalValue = goals.birdies;
        chartTitle = 'Birdies';
        isPercentage = false;
        break;
      case 'pars':
        goalValue = goals.pars;
        chartTitle = 'Pars';
        isPercentage = false;
        break;
      case 'bogeys':
        goalValue = goals.bogeys;
        chartTitle = 'Bogeys';
        isPercentage = false;
        break;
      case 'doubleBogeys':
        goalValue = goals.doubleBogeys;
        chartTitle = 'Double Bogeys';
        isPercentage = false;
        break;
      case 'eagles':
        goalValue = goals.eagles;
        chartTitle = 'Eagles';
        isPercentage = false;
        break;
      case 'fir':
        goalValue = goals.fir;
        chartTitle = 'FIR %';
        isPercentage = true;
        break;
      case 'gir':
        goalValue = goals.gir;
        chartTitle = 'GIR %';
        isPercentage = true;
        break;
      case 'totalPenalties':
        goalValue = 0;
        chartTitle = 'Total Penalties';
        break;
      case 'penaltyRate':
        goalValue = 0;
        chartTitle = 'Penalty Rate %';
        isPercentage = true;
        break;
      case 'gir8ft':
        goalValue = goals.within8ft;
        chartTitle = 'Within 8ft %';
        isPercentage = true;
        break;
      case 'gir20ft':
        goalValue = goals.within20ft;
        chartTitle = 'Within 20ft %';
        isPercentage = true;
        break;
      case 'upAndDown':
        goalValue = goals.upAndDown;
        chartTitle = 'Up & Down %';
        isPercentage = true;
        break;
      case 'bunkerSaves':
        goalValue = goals.bunkerSaves;
        chartTitle = 'Bunker Saves %';
        isPercentage = true;
        break;
      case 'chipInside6ft':
        goalValue = null; // No specific goal
        chartTitle = 'Chip Inside 6ft';
        break;
      case 'doubleChips':
        goalValue = 0; // Goal is zero
        chartTitle = 'Double Chips';
        break;
      case 'totalPutts':
        goalValue = goals.putts;
        chartTitle = 'Total Putts';
        break;
      case 'puttMake6ft':
        goalValue = goals.puttMake6ft;
        chartTitle = '< 6ft Make %';
        isPercentage = true;
        break;
      case 'threePutts':
        goalValue = 0; // Goal is zero
        chartTitle = '3-Putts';
        break;
    }
    
    // Goal-aware Y-axis domain: Always include goalValue with 10% padding
    // Capture goalValue in closure for domain function
    const goalValueForDomain = goalValue;
    
    // For nettScore, use fixed domain [62, 92] centered at 72 (PAR)
    let yAxisDomain: [number | 'auto' | ((dataMin: number, dataMax: number) => number), number | 'auto' | ((dataMin: number, dataMax: number) => number)];
    let yAxisTicks: number[] | undefined = undefined;
    
    if (selectedMetric === 'nettScore') {
      // Fixed domain centered at 72 (PAR)
      yAxisDomain = [62, 92];
      // Clean tick marks at 10-shot increments
      yAxisTicks = [62, 72, 82, 92];
    } else {
      // Dynamic domain: For percentages start at 0, for others use 'dataMin - 10'
      // Domain max function ensures goal line is always visible
      if (isPercentage) {
        yAxisDomain = [
          0,
          (dataMax: number) => Math.max(dataMax, goalValueForDomain || 0) * 1.1
        ];
      } else {
        // Use dataMin - 10 to ensure target line is visible
        yAxisDomain = [
          (dataMin: number) => Math.max(0, dataMin - 10),
          (dataMax: number) => Math.max(dataMax, goalValueForDomain || 0) * 1.1
        ];
      }
    }
    
    return (
      <div className="px-4 mb-6">
        <div className="rounded-2xl p-4" style={{ backgroundColor: '#014421' }}>
          <div className="flex flex-col gap-4 mb-4">
            <h2 className="text-lg font-semibold text-white text-center">{chartTitle}</h2>
            
            {/* Metric Dropdown */}
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 w-full justify-center">
                <label className="text-sm font-medium text-white whitespace-nowrap">Select Metric:</label>
                <select
                  value={selectedMetric}
                  onChange={(e) => setSelectedMetric(e.target.value as typeof selectedMetric)}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-white text-black border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#FFA500] focus:border-[#FFA500] min-w-[200px]"
                  style={{
                    color: '#000000',
                    backgroundColor: '#ffffff'
                  }}
                >
                  <option value="gross" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Gross Score</option>
                  <option value="nettScore" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Nett Score</option>
                  <option value="birdies" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Birdies</option>
                  <option value="pars" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Pars</option>
                  <option value="bogeys" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Bogeys</option>
                  <option value="doubleBogeys" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Double Bogeys</option>
                  <option value="eagles" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Eagles</option>
                  <option value="fir" style={{ color: '#000000', backgroundColor: '#ffffff' }}>FIR %</option>
                  <option value="gir" style={{ color: '#000000', backgroundColor: '#ffffff' }}>GIR %</option>
                  <option value="totalPenalties" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Total Penalties</option>
                  <option value="penaltyRate" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Penalty Rate %</option>
                  <option value="gir8ft" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Within 8ft %</option>
                  <option value="gir20ft" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Within 20ft %</option>
                  <option value="upAndDown" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Up & Down %</option>
                  <option value="bunkerSaves" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Bunker Saves %</option>
                  <option value="chipInside6ft" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Chip Inside 6ft</option>
                  <option value="doubleChips" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Double Chips</option>
                  <option value="totalPutts" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Total Putts</option>
                  <option value="puttMake6ft" style={{ color: '#000000', backgroundColor: '#ffffff' }}>&lt; 6ft Make %</option>
                  <option value="threePutts" style={{ color: '#000000', backgroundColor: '#ffffff' }}>3-Putts</option>
                </select>
              </div>
              
              {/* Binary Hole Filter Toggle */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/70">Filter:</span>
                <button
                  onClick={() => setHoleFilter('9')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    holeFilter === '9' 
                      ? 'bg-white text-[#014421]' 
                      : 'bg-white/20 text-white/70'
                  }`}
                >
                  9 Holes
                </button>
                <button
                  onClick={() => setHoleFilter('18')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    holeFilter === '18' 
                      ? 'bg-white text-[#014421]' 
                      : 'bg-white/20 text-white/70'
                  }`}
                >
                  18 Holes
                </button>
              </div>
              
              {/* History Filter Toggle */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/70">History:</span>
                <button
                  onClick={() => setHistoryLimit(5)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    historyLimit === 5 
                      ? 'bg-white text-[#014421]' 
                      : 'bg-white/20 text-white/70'
                  }`}
                >
                  Last 5
                </button>
                <button
                  onClick={() => setHistoryLimit(10)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    historyLimit === 10 
                      ? 'bg-white text-[#014421]' 
                      : 'bg-white/20 text-white/70'
                  }`}
                >
                  Last 10
                </button>
                <button
                  onClick={() => setHistoryLimit(20)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    historyLimit === 20 
                      ? 'bg-white text-[#014421]' 
                      : 'bg-white/20 text-white/70'
                  }`}
                >
                  Last 20
                </button>
                <button
                  onClick={() => setHistoryLimit('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    historyLimit === 'all' 
                      ? 'bg-white text-[#014421]' 
                      : 'bg-white/20 text-white/70'
                  }`}
                >
                  All
                </button>
              </div>
            </div>
          </div>
          
          {/* AreaChart Container with Horizontal Scrolling for Mobile */}
          <div className="bg-white/10 rounded-lg p-4">
            <div className="overflow-x-auto">
              <div style={{ minWidth: (typeof historyLimit === 'number' && historyLimit > 10) || historyLimit === 'all' ? '800px' : '100%' }}>
                <ResponsiveContainer width="100%" height={350} key={historyLimit}>
              {/* @ts-ignore - Recharts type definitions are incomplete */}
              <AreaChart 
                data={chartData}
                margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" opacity={0.3} />
                {/* @ts-ignore - Recharts XAxis type definitions are incomplete */}
                <XAxis 
                  dataKey="round" 
                  type="category"
                  scale="point"
                  padding={{ left: 0, right: 0 }}
                  stroke="#FFA500"
                  tick={{ fill: '#ffffff', fontSize: 12 }}
                  interval={(typeof historyLimit === 'number' && (historyLimit === 10 || historyLimit === 20)) || historyLimit === 'all' ? 2 : 0}
                  angle={(typeof historyLimit === 'number' && (historyLimit === 10 || historyLimit === 20)) || historyLimit === 'all' ? -45 : 0}
                  textAnchor={(typeof historyLimit === 'number' && (historyLimit === 10 || historyLimit === 20)) || historyLimit === 'all' ? 'end' : 'middle'}
                  height={(typeof historyLimit === 'number' && (historyLimit === 10 || historyLimit === 20)) || historyLimit === 'all' ? 70 : 30}
                />
                {/* @ts-ignore - Recharts YAxis type definitions are incomplete */}
                <YAxis 
                  width={50}
                  stroke="#FFA500"
                  tick={{ fill: '#ffffff', fontSize: 12, textAnchor: 'end' }}
                  tickFormatter={(value) => typeof value === 'number' ? (value ?? 0).toFixed(2) : value}
                  domain={yAxisDomain as any}
                  tickCount={selectedMetric === 'nettScore' ? undefined : 8}
                  ticks={yAxisTicks}
                />
                <Tooltip 
                  content={(props: any) => {
                    // Default tooltip for all metrics
                    if (props.active && props.payload && props.payload[0]) {
                      const payload = props.payload[0].payload;
                      const date = new Date(payload.date);
                      const formattedValue = isPercentage 
                        ? `${((payload.value as number) ?? 0).toFixed(1)}%` 
                        : ((payload.value as number) ?? 0).toFixed(selectedMetric === 'gross' || selectedMetric === 'nettScore' ? 1 : 0);
                      
                      // For nettScore, show relative to PAR
                      let additionalInfo = null;
                      if (selectedMetric === 'nettScore') {
                        const relativeToPar = payload.value - 72;
                        const relativeSign = relativeToPar >= 0 ? '+' : '';
                        additionalInfo = (
                          <div style={{ 
                            fontSize: '0.9em', 
                            marginTop: '6px', 
                            paddingTop: '6px', 
                            borderTop: '1px solid rgba(255, 165, 0, 0.3)' 
                          }}>
                            Relative to PAR: <span style={{ 
                              color: relativeToPar > 0 ? '#ef4444' : relativeToPar < 0 ? '#22c55e' : '#FFA500',
                              fontWeight: 'bold'
                            }}>{relativeSign}{((relativeToPar as number) ?? 0).toFixed(1)}</span>
                          </div>
                        );
                      }
                      
                      return (
                        <div style={{
                          backgroundColor: 'rgba(1, 68, 33, 0.95)',
                          border: '1px solid #FFA500',
                          borderRadius: '8px',
                          padding: '12px',
                          color: '#ffffff'
                        }}>
                          <div style={{ color: '#FFA500', fontWeight: 'bold', marginBottom: '8px' }}>
                            {props.label} - {date.toLocaleDateString()}
                          </div>
                          <div>
                            {chartTitle}: <span style={{ color: '#FFA500', fontWeight: 'bold' }}>{formattedValue}</span>
                          </div>
                          {additionalInfo}
                        </div>
                      );
                    }
                    return null;
                  }}
                  labelFormatter={(label, payload) => {
                    if (payload && payload[0] && payload[0].payload) {
                      const date = new Date(payload[0].payload.date);
                      return `${label} - ${date.toLocaleDateString()}`;
                    }
                    return label;
                  }}
                />
                {/* Middle Reference Line at 72 (PAR) for nettScore */}
                {selectedMetric === 'nettScore' && (
                  <ReferenceLine 
                    y={72} 
                    stroke="#FFA500" 
                    strokeWidth={2}
                    label={{ value: '72 (PAR)', position: 'right', fill: '#FFA500', fontSize: 12, fontWeight: 'bold' }}
                  />
                )}
                {/* Goal Reference Line for other metrics */}
                {selectedMetric !== 'nettScore' && goalValue !== null && (
                  <ReferenceLine 
                    y={goalValue} 
                    stroke="#FFA500" 
                    strokeWidth={3}
                    strokeDasharray="3 3" 
                  />
                )}
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#FFA500" 
                  fill="#FFA500" 
                  fillOpacity={0.2}
                  dot={{ r: 6, fill: '#FFA500', strokeWidth: 2, stroke: '#ffffff' }}
                />
              </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Circular progress ring component - Track (Goal) and Fill (Current)
  // Can be used on white or green backgrounds
  const CircularProgress = ({ 
    percentage, 
    label, 
    target, 
    size = 90,
    bgColor = '#014421', // Default to green background
    isCount = false, // For non-percentage metrics like Double Chips
    invertLogic = false // For "lower is better" metrics (Penalty Rate, Double Chips)
  }: { 
    percentage: number; 
    label: string; 
    target: number;
    size?: number;
    bgColor?: string;
    isCount?: boolean;
    invertLogic?: boolean;
  }) => {
    const radius = (size - 12) / 2;
    const circumference = 2 * Math.PI * radius;
    
    // For percentage metrics, use percentage directly. For counts, convert to percentage of max (10)
    const displayValue = isCount ? percentage : percentage;
    const maxValue = isCount ? 10 : 100;
    const currentOffset = circumference - (displayValue / maxValue) * circumference;
    const targetOffset = circumference - (target / maxValue) * circumference;
    const isWhiteBg = bgColor === 'white' || bgColor.includes('white');
    
    // Red/Green Logic: 
    // Normal: Green if current >= goal, Red if current < goal
    // Inverted (lower is better): Green if current <= goal, Red if current > goal
    const meetsGoal = invertLogic ? displayValue <= target : displayValue >= target;
    const ringColor = meetsGoal ? '#22c55e' : '#ef4444';

    return (
      <div className="flex flex-col items-center">
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="transform -rotate-90">
            {/* Track (Goal) - thin, 15% opacity Gold line */}
            {target > 0 && (
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke="#FFA500"
                strokeWidth="3"
                fill="none"
                strokeDasharray={`${(target / maxValue) * circumference} ${circumference}`}
                strokeDashoffset={targetOffset}
                strokeLinecap="round"
                opacity="0.15"
                className="transition-all duration-500"
              />
            )}
            {/* Fill (Current) - thick, solid line with rounded caps - Red or Green based on logic */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={ringColor}
              strokeWidth="8"
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={currentOffset}
              strokeLinecap="round"
              className="transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className={`text-2xl font-bold ${isWhiteBg ? 'text-gray-900' : 'text-white'}`}>
                {isCount ? ((displayValue ?? 0).toFixed(1)) : `${Math.round(displayValue ?? 0)}%`}
              </div>
              <div className={`text-xs mt-0.5 ${isWhiteBg ? 'text-gray-600' : 'text-white/50'}`}>
                Goal: {isCount ? ((target ?? 0).toFixed(1)) : `${Math.round(target ?? 0)}%`}
              </div>
            </div>
          </div>
        </div>
        <div className={`text-xs mt-2 text-center ${isWhiteBg ? 'text-gray-700' : 'text-white/70'}`}>
          {label}
        </div>
      </div>
    );
  };

  // Render function wrapped in try-catch to prevent crashes
  const renderContent = () => {
    try {
      return (
        <div className="min-h-screen bg-gray-50 pb-24">
      <div className="max-w-md mx-auto bg-white min-h-screen">
        <div className="pt-6 pb-4 px-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Game Overview</h1>
              <p className="text-gray-600 text-sm mt-1">Track your performance metrics</p>
            </div>
          </div>
          {/* Selectable Goal Dropdown */}
          <div className="mt-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-xs font-medium text-gray-600 mb-2">Target Goal</div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="-4"
                max="36"
                step="0.1"
                value={selectedGoal}
                onChange={(e) => setSelectedGoal(parseFloat(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #014421 0%, #014421 ${((selectedGoal + 4) / 40) * 100}%, #E5E7EB ${((selectedGoal + 4) / 40) * 100}%, #E5E7EB 100%)`
                }}
              />
              <div className="text-sm font-semibold text-gray-900 min-w-[80px] text-right">
                {(selectedGoal ?? 0) >= 0 ? `${(selectedGoal ?? 0).toFixed(1)}` : `+${Math.abs(selectedGoal ?? 0).toFixed(1)}`} {(selectedGoal ?? 0) <= 0 ? 'Pro' : 'HCP'}
              </div>
            </div>
            <div className="text-xs text-gray-600 mt-2">
              GIR: {goals.gir}% | FIR: {goals.fir}% | Up & Down: {goals.upAndDown}% | Putts: {goals.putts} | Bunker: {goals.bunkerSaves}%
            </div>
          </div>
        </div>

        {/* Master Correlation Chart */}
        {renderMasterCorrelationChart()}

        {/* Performance Rings - Extremes Only (Top 4 Strengths, Worst 4 Focus Areas) */}
        <div className="px-4 mb-6">
          <div className="rounded-2xl p-6" style={{ backgroundColor: '#014421' }}>
            <h2 className="text-lg font-semibold text-white mb-4">Performance Rings</h2>
            
            {/* Calculate ALL metrics from dropdown - Reactive to selectedGoal slider */}
            {(() => {
              // Goals are recalculated from selectedGoal on every render (reactive)
              const dynamicGoals = getBenchmarkGoals(selectedGoal);
              
              // Calculate additional averages needed for all metrics
              const avgGross = safeRounds.length > 0 
                ? safeRounds.reduce((sum, r) => sum + (r.score || 0), 0) / (safeRounds.length || 1) 
                : 0;
              const avgNett = safeRounds.length > 0 
                ? safeRounds.reduce((sum, r) => sum + (r.nett || 0), 0) / (safeRounds.length || 1) 
                : 0;
              const avgBirdies = safeRounds.length > 0 
                ? safeRounds.reduce((sum, r) => sum + (r.birdies || 0), 0) / (safeRounds.length || 1) 
                : 0;
              const avgPars = safeRounds.length > 0 
                ? safeRounds.reduce((sum, r) => sum + (r.pars || 0), 0) / (safeRounds.length || 1) 
                : 0;
              const avgBogeys = safeRounds.length > 0 
                ? safeRounds.reduce((sum, r) => sum + (r.bogeys || 0), 0) / (safeRounds.length || 1) 
                : 0;
              const avgDoubleBogeys = safeRounds.length > 0 
                ? safeRounds.reduce((sum, r) => sum + (r.doubleBogeys || 0), 0) / (safeRounds.length || 1) 
                : 0;
              const avgEagles = safeRounds.length > 0 
                ? safeRounds.reduce((sum, r) => sum + (r.eagles || 0), 0) / (safeRounds.length || 1) 
                : 0;
              const avgTotalPutts = safeRounds.length > 0 
                ? safeRounds.reduce((sum, r) => sum + (r.totalPutts || 0), 0) / (safeRounds.length || 1) 
                : 0;
              const avgThreePutts = safeRounds.length > 0 
                ? safeRounds.reduce((sum, r) => sum + (r.threePutts || 0), 0) / (safeRounds.length || 1) 
                : 0;
              
              // Calculate goal values for all metrics (use dynamicGoals for scoring metrics)
              const goalGross = dynamicGoals.score;
              const goalNett = dynamicGoals.score;
              
              // Define ALL metrics from dropdown with their current values and goals
              const allMetrics = [
                { 
                  current: avgGross, 
                  goal: goalGross, 
                  label: "Gross Score", 
                  isCount: false, 
                  invertLogic: true, // Lower is better
                  isPercentage: false
                },
                { 
                  current: avgNett, 
                  goal: goalNett, 
                  label: "Nett Score", 
                  isCount: false, 
                  invertLogic: true, // Lower is better
                  isPercentage: false
                },
                { 
                  current: avgBirdies, 
                  goal: dynamicGoals.birdies, 
                  label: "Birdies", 
                  isCount: true, 
                  invertLogic: false, // Higher is better
                  isPercentage: false
                },
                { 
                  current: avgPars, 
                  goal: dynamicGoals.pars, 
                  label: "Pars", 
                  isCount: true, 
                  invertLogic: false, // Higher is better
                  isPercentage: false
                },
                { 
                  current: avgBogeys, 
                  goal: dynamicGoals.bogeys, 
                  label: "Bogeys", 
                  isCount: true, 
                  invertLogic: true, // Lower is better
                  isPercentage: false
                },
                { 
                  current: avgDoubleBogeys, 
                  goal: dynamicGoals.doubleBogeys, 
                  label: "Double Bogeys", 
                  isCount: true, 
                  invertLogic: true, // Lower is better
                  isPercentage: false
                },
                { 
                  current: avgEagles, 
                  goal: dynamicGoals.eagles, 
                  label: "Eagles", 
                  isCount: true, 
                  invertLogic: false, // Higher is better (though goal is 0)
                  isPercentage: false
                },
                { 
                  current: averages.fir, 
                  goal: dynamicGoals.fir, 
                  label: "FIR %", 
                  isCount: false, 
                  invertLogic: false,
                  isPercentage: true
                },
                { 
                  current: averages.gir, 
                  goal: dynamicGoals.gir, 
                  label: "GIR %", 
                  isCount: false, 
                  invertLogic: false,
                  isPercentage: true
                },
                { 
                  current: averages.within8ft, 
                  goal: dynamicGoals.within8ft, 
                  label: "Within 8ft %", 
                  isCount: false, 
                  invertLogic: false,
                  isPercentage: true
                },
                { 
                  current: averages.within20ft, 
                  goal: dynamicGoals.within20ft, 
                  label: "Within 20ft %", 
                  isCount: false, 
                  invertLogic: false,
                  isPercentage: true
                },
                { 
                  current: averages.upAndDown, 
                  goal: dynamicGoals.upAndDown, 
                  label: "Up & Down %", 
                  isCount: false, 
                  invertLogic: false,
                  isPercentage: true
                },
                { 
                  current: averages.bunkerSaves, 
                  goal: dynamicGoals.bunkerSaves, 
                  label: "Bunker Saves %", 
                  isCount: false, 
                  invertLogic: false,
                  isPercentage: true
                },
                { 
                  current: averages.chipsInside6ft, 
                  goal: dynamicGoals.chipsInside6ft, 
                  label: "Chip Inside 6ft %", 
                  isCount: false, 
                  invertLogic: false,
                  isPercentage: true
                },
                { 
                  current: averages.doubleChips, 
                  goal: 0, 
                  label: "Double Chips", 
                  isCount: true, 
                  invertLogic: true, // Lower is better
                  isPercentage: false
                },
                { 
                  current: avgTotalPutts, 
                  goal: dynamicGoals.putts, 
                  label: "Total Putts", 
                  isCount: false, 
                  invertLogic: true, // Lower is better
                  isPercentage: false
                },
                { 
                  current: averages.puttMake6ft, 
                  goal: dynamicGoals.puttMake6ft, 
                  label: "< 6ft Make %", 
                  isCount: false, 
                  invertLogic: false,
                  isPercentage: true
                },
                { 
                  current: avgThreePutts, 
                  goal: 0, 
                  label: "3-Putts", 
                  isCount: true, 
                  invertLogic: true, // Lower is better
                  isPercentage: false
                },
                { 
                  current: averages.penaltyRate, 
                  goal: 0, 
                  label: "Penalty Rate %", 
                  isCount: false, 
                  invertLogic: true, // Lower is better
                  isPercentage: true
                },
              ];
              
              // Calculate percentage difference from goal for each metric
              const metricsWithDifference = allMetrics.map(m => {
                let difference: number;
                
                // Fallback: If goal is undefined/null, assign neutral gap of 0
                const goal = m.goal !== undefined && m.goal !== null ? m.goal : 0;
                
                if (m.invertLogic) {
                  // For "lower is better" metrics, positive difference = exceeding goal (good)
                  // difference = (goal - current) / goal * 100
                  if (goal === 0) {
                    // Special case: goal is 0, difference is negative of current value
                    difference = -m.current;
                  } else {
                    difference = ((goal - m.current) / Math.abs(goal)) * 100;
                  }
                } else {
                  // For "higher is better" metrics, positive difference = exceeding goal (good)
                  // difference = (current - goal) / goal * 100
                  if (goal === 0) {
                    // Special case: goal is 0, difference is current value
                    difference = m.current;
                  } else {
                    difference = ((m.current - goal) / Math.abs(goal)) * 100;
                  }
                }
                
                // If goal was undefined, set difference to 0 (neutral, won't break sort)
                if (m.goal === undefined || m.goal === null) {
                  difference = 0;
                }
                
                const meetsGoal = m.goal !== undefined && m.goal !== null
                  ? (m.invertLogic ? m.current <= m.goal : m.current >= m.goal)
                  : false;
                
                return {
                  ...m,
                  difference,
                  meetsGoal,
                  // For display in CircularProgress
                  percentage: m.isPercentage ? m.current : m.current,
                  target: m.goal !== undefined && m.goal !== null ? m.goal : null
                };
              });
              
              // Sort by difference (largest positive = best strength, largest negative = worst focus area)
              const sortedMetrics = [...metricsWithDifference].sort((a, b) => b.difference - a.difference);
              
              // Top 4 Strengths (Green Rings) - metrics exceeding goal by largest margin
              const topStrengths = sortedMetrics
                .filter(m => m.meetsGoal)
                .slice(0, 4);
              
              // Worst 4 Focus Areas (Red Rings) - metrics falling furthest behind goal
              const worstFocusAreas = sortedMetrics
                .filter(m => !m.meetsGoal)
                .slice(-4)
                .reverse(); // Reverse to show worst first
              
              // Note: Background calculation still analyzes all logged metrics in real-time
              // The Top 4 / Bottom 4 selection is based on the full dataset
              
              return (
                <>
                  {/* Current Strengths - Top 4 Only */}
                  {topStrengths.length > 0 && (
                    <div className="mb-10">
                      <h3 className="text-sm font-semibold text-white/90 mb-3 text-center">Current Strengths</h3>
                      <div className="grid grid-cols-2 gap-6 md:gap-8 justify-items-center">
                        {topStrengths.map((metric, idx) => (
                          <div key={idx} className="drop-shadow-[0_0_10px_rgba(255,165,0,0.5)]">
                            <CircularProgress 
                              percentage={metric.percentage} 
                              label={metric.label} 
                              target={metric.target ?? 0}
                              size={90}
                              isCount={metric.isCount ?? false}
                              invertLogic={metric.invertLogic ?? false}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Focus Areas - Worst 4 Only */}
                  {worstFocusAreas.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-white/90 mb-3 text-center">Focus Areas</h3>
                      <div className="grid grid-cols-2 gap-6 md:gap-8 justify-items-center">
                        {worstFocusAreas.map((metric, idx) => (
                          <CircularProgress 
                            key={idx}
                            percentage={metric.percentage} 
                            label={metric.label} 
                            target={metric.target ?? 0}
                            size={90}
                            isCount={metric.isCount ?? false}
                            invertLogic={metric.invertLogic ?? false}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>

        {/* Driving Insights - Combined Module */}
        <div className="px-4 mb-6">
          <h2 className="text-xl font-bold mb-4" style={{ color: '#0a2118' }}>DRIVING INSIGHTS</h2>
          
          {/* Driving Distribution Card */}
          <div className="bg-white rounded-2xl p-6 border-2 border-gray-200 shadow-sm mb-4">
            {drivingDistribution.totalShots > 0 ? (
              <div className="space-y-4">
                {/* Fairways Hit */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-700">Fairways Hit (FIR %)</span>
                    <span className="text-sm font-bold" style={{ color: '#FFA500' }}>
                      {(averages.fir ?? 0).toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-6 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                      style={{
                        width: `${Math.max(0, Math.min(100, (averages.fir ?? 0)))}%`,
                        backgroundColor: '#FFA500'
                      }}
                    >
                      {(averages.fir ?? 0) > 10 && (
                        <span className="text-xs font-semibold text-white">
                          {(averages.fir ?? 0).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Left Miss */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-700">Left Miss %</span>
                    <span className="text-sm font-bold" style={{ color: '#FFA500' }}>
                      {(drivingDistribution.leftPercent ?? 0).toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-6 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                      style={{
                        width: `${Math.max(0, Math.min(100, (drivingDistribution.leftPercent ?? 0)))}%`,
                        backgroundColor: '#6B7280'
                      }}
                    >
                      {(drivingDistribution.leftPercent ?? 0) > 10 && (
                        <span className="text-xs font-semibold text-white">
                          {(drivingDistribution.leftPercent ?? 0).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Miss */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-700">Right Miss %</span>
                    <span className="text-sm font-bold" style={{ color: '#FFA500' }}>
                      {(drivingDistribution.rightPercent ?? 0).toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-6 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                      style={{
                        width: `${Math.max(0, Math.min(100, (drivingDistribution.rightPercent ?? 0)))}%`,
                        backgroundColor: '#6B7280'
                      }}
                    >
                      {(drivingDistribution.rightPercent ?? 0) > 10 && (
                        <span className="text-xs font-semibold text-white">
                          {(drivingDistribution.rightPercent ?? 0).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Summary Stats */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider">Total Shots</div>
                      <div className="text-xl font-bold tracking-tighter text-gray-900 font-mono">{drivingDistribution.totalShots}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider">Hit</div>
                      <div className="text-xl font-bold tracking-tighter font-mono" style={{ color: '#FFA500' }}>
                        {Math.round((drivingDistribution.hitPercent / 100) * drivingDistribution.totalShots)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider">Missed</div>
                      <div className="text-xl font-bold tracking-tighter text-gray-600 font-mono">
                        {Math.round(((drivingDistribution.leftPercent + drivingDistribution.rightPercent) / 100) * drivingDistribution.totalShots)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No driving data available yet.</p>
                <p className="text-sm mt-2">Log a round to see your driving distribution.</p>
              </div>
            )}
          </div>

          {/* FIR % and Tee Penalties Cards - Side by Side */}
          <div className="grid grid-cols-2 gap-4">
            {/* FIR % Card */}
            <div className="rounded-2xl p-6 bg-white border-2 border-gray-200 shadow-sm">
              <div className="text-center">
                <div className="text-3xl font-bold mb-1" style={{ color: '#FFA500' }}>
                  {(averages.fir ?? 0).toFixed(2)}%
                </div>
                <div className="text-sm font-medium text-gray-700 mb-2">FIR %</div>
                <div className="text-xs text-gray-500">Goal: <span style={{ color: '#FFA500' }}>{(goals.fir ?? 0).toFixed(2)}%</span></div>
              </div>
            </div>
            
            {/* Tee Penalties Card */}
            <div className="rounded-2xl p-6 bg-white border-2 border-gray-200 shadow-sm">
              <div className="text-center">
                <div className="text-3xl font-bold mb-1" style={{ color: '#FFA500' }}>
                  {safeRounds.length > 0 
                    ? (safeRounds.reduce((sum, r) => sum + (r.teePenalties || 0), 0) / (safeRounds.length || 1)).toFixed(1)
                    : '0.0'}
                </div>
                <div className="text-sm font-medium text-gray-700 mb-2">Tee Penalties (Avg)</div>
                <div className="text-xs text-gray-500">Per Round</div>
              </div>
            </div>
          </div>
        </div>

        {/* Categorical Grouping - Coaching Insights */}
        {safeRounds && safeRounds.length > 0 && (
          <>
            {/* Approach Accuracy */}
            <div className="px-4 mb-6">
              <h2 className="text-xl font-bold mb-4" style={{ color: '#0a2118' }}>Approach Accuracy</h2>
              <div className="grid grid-cols-2 gap-4">
                {/* GIR % Card */}
                <div className="rounded-2xl p-6 bg-white border-2 border-gray-200">
                  <div className="text-center">
                    <div className="text-3xl font-bold mb-1" style={{ color: '#FFA500' }}>
                      {(averages.gir ?? 0).toFixed(2)}%
                    </div>
                    <div className="text-sm font-medium text-gray-700 mb-2">GIR %</div>
                    <div className="text-xs text-gray-500">Goal: <span style={{ color: '#FFA500' }}>{(goals.gir ?? 0).toFixed(2)}%</span></div>
                  </div>
                </div>
                
                {/* Inside 8ft Card */}
                <div className="rounded-2xl p-6 bg-white border-2 border-gray-200">
                  <div className="text-center">
                    <div className="text-3xl font-bold mb-1" style={{ color: '#FFA500' }}>
                      {(averages.within8ft ?? 0).toFixed(2)}%
                    </div>
                    <div className="text-sm font-medium text-gray-700 mb-2">Within 8ft %</div>
                    <div className="text-xs text-gray-500">Goal: <span style={{ color: '#FFA500' }}>{(goals.within8ft ?? 0).toFixed(2)}%</span></div>
                  </div>
                </div>
                
                {/* Inside 20ft Card */}
                <div className="rounded-2xl p-6 bg-white border-2 border-gray-200">
                  <div className="text-center">
                    <div className="text-3xl font-bold mb-1" style={{ color: '#FFA500' }}>
                      {(averages.within20ft ?? 0).toFixed(2)}%
                    </div>
                    <div className="text-sm font-medium text-gray-700 mb-2">Within 20ft %</div>
                    <div className="text-xs text-gray-500">Goal: <span style={{ color: '#FFA500' }}>{(goals.within20ft ?? 0).toFixed(2)}%</span></div>
                  </div>
                </div>
                
                {/* Approach Penalty (Avg) Card */}
                <div className="rounded-2xl p-6 bg-white border-2 border-gray-200">
                  <div className="text-center">
                    <div className="text-3xl font-bold mb-1" style={{ color: '#FFA500' }}>
                      {(averages.avgApproachPenalties ?? 0).toFixed(2)}
                    </div>
                    <div className="text-sm font-medium text-gray-700 mb-2">Approach Penalty (Avg)</div>
                    <div className="text-xs text-gray-500">Per Round</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Short Game Mastery */}
            <div className="px-4 mb-6">
              <h2 className="text-xl font-bold mb-4" style={{ color: '#0a2118' }}>Short Game Mastery</h2>
              <div className="grid grid-cols-2 gap-4">
                {/* Up & Down % Card */}
                <div className="rounded-2xl p-6 bg-white border-2 border-gray-200">
                  <div className="text-center">
                    <div className="text-3xl font-bold mb-1" style={{ color: '#FFA500' }}>
                      {(averages.upAndDown ?? 0).toFixed(2)}%
                    </div>
                    <div className="text-sm font-medium text-gray-700 mb-2">Up & Down %</div>
                    <div className="text-xs text-gray-500">Goal: <span style={{ color: '#FFA500' }}>{(goals.upAndDown ?? 0).toFixed(2)}%</span></div>
                  </div>
                </div>
                
                {/* Chip Inside 6ft % Card */}
                <div className="rounded-2xl p-6 bg-white border-2 border-gray-200">
                  <div className="text-center">
                    <div className="text-3xl font-bold mb-1" style={{ color: '#FFA500' }}>
                      {(averages.chipsInside6ft ?? 0).toFixed(2)}%
                    </div>
                    <div className="text-sm font-medium text-gray-700 mb-2">Chip Inside 6ft %</div>
                    <div className="text-xs text-gray-500">Goal: <span style={{ color: '#FFA500' }}>{(goals.chipsInside6ft ?? 0).toFixed(2)}%</span></div>
                  </div>
                </div>
                
                {/* Bunker Saves Card */}
                <div className="rounded-2xl p-6 bg-white border-2 border-gray-200">
                  <div className="text-center">
                    <div className="text-3xl font-bold mb-1" style={{ color: '#FFA500' }}>
                      {(averages.bunkerSaves ?? 0).toFixed(2)}%
                    </div>
                    <div className="text-sm font-medium text-gray-700 mb-2">Bunker Saves %</div>
                    <div className="text-xs text-gray-500">Goal: <span style={{ color: '#FFA500' }}>{(goals.bunkerSaves ?? 0).toFixed(2)}%</span></div>
                  </div>
                </div>
                
                {/* Double Chips Card */}
                <div className="rounded-2xl p-6 bg-white border-2 border-gray-200">
                  <div className="text-center">
                    <div className="text-3xl font-bold mb-1" style={{ color: '#FFA500' }}>
                      {(averages.doubleChips ?? 0).toFixed(1)}
                    </div>
                    <div className="text-sm font-medium text-gray-700 mb-2">Double Chips (Avg)</div>
                    <div className="text-xs text-gray-500">Per Round</div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Putting Precision */}
        <div className="px-4 mb-6">
          <h2 className="text-xl font-bold mb-4" style={{ color: '#0a2118' }}>Putting Precision</h2>
          <div className="grid grid-cols-2 gap-4">
            {/* Total Putts (Avg) Card */}
            <div className="rounded-2xl p-6 bg-white border-2 border-gray-200">
              <div className="text-center">
                <div className="text-3xl font-bold mb-1" style={{ color: '#FFA500' }}>
                  {(puttingStats.avgTotalPutts ?? 0).toFixed(1)}
                </div>
                <div className="text-sm font-medium text-gray-700 mb-2">Total Putts (Avg)</div>
                <div className="text-xs text-gray-500">Goal: <span style={{ color: '#FFA500' }}>{(goals.putts ?? 0).toFixed(1)}</span></div>
              </div>
            </div>
            
            {/* < 6ft Make % Card */}
            <div className="rounded-2xl p-6 bg-white border-2 border-gray-200">
              <div className="text-center">
                <div className="text-3xl font-bold mb-1" style={{ color: '#FFA500' }}>
                  {(averages.puttMake6ft ?? 0).toFixed(2)}%
                </div>
                <div className="text-sm font-medium text-gray-700 mb-2">&lt; 6ft Make %</div>
                <div className="text-xs text-gray-500">Goal: <span style={{ color: '#FFA500' }}>{(goals.puttMake6ft ?? 0).toFixed(2)}%</span></div>
              </div>
            </div>
            
            {/* 3-Putts (Avg) Card */}
            <div className="rounded-2xl p-6 bg-white border-2 border-gray-200">
              <div className="text-center">
                <div className="text-3xl font-bold mb-1" style={{ color: '#FFA500' }}>
                  {(puttingStats.avgThreePutts ?? 0).toFixed(1)}
                </div>
                <div className="text-sm font-medium text-gray-700 mb-2">3-Putts (Avg)</div>
                <div className="text-xs text-gray-500">Goal: &lt; <span style={{ color: '#FFA500' }}>1.0</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* Scoring Distribution */}
        <div className="px-4 mb-6">
          <h2 className="text-xl font-bold mb-4" style={{ color: '#0a2118' }}>Scoring Distribution</h2>
          {(() => {
            // Filter rounds based on historyLimit
            const filteredRounds = historyLimit === 'all' 
              ? safeRounds 
              : safeRounds.slice(-historyLimit);
            
            // Calculate averages for scoring distribution
            const avgEagles = filteredRounds.length > 0
              ? filteredRounds.reduce((sum, r) => sum + (r.eagles || 0), 0) / (filteredRounds.length || 1)
              : 0;
            const avgBirdies = filteredRounds.length > 0
              ? filteredRounds.reduce((sum, r) => sum + (r.birdies || 0), 0) / (filteredRounds.length || 1)
              : 0;
            const avgPars = filteredRounds.length > 0
              ? filteredRounds.reduce((sum, r) => sum + (r.pars || 0), 0) / (filteredRounds.length || 1)
              : 0;
            const avgBogeys = filteredRounds.length > 0
              ? filteredRounds.reduce((sum, r) => sum + (r.bogeys || 0), 0) / (filteredRounds.length || 1)
              : 0;
            const avgDoubleBogeys = filteredRounds.length > 0
              ? filteredRounds.reduce((sum, r) => sum + (r.doubleBogeys || 0), 0) / (filteredRounds.length || 1)
              : 0;

            return (
              <div className="grid grid-cols-3 gap-4">
                {/* Eagles Card */}
                <div className="rounded-2xl p-6 bg-white border-2 border-gray-200">
                  <div className="text-center">
                    <div className="text-3xl font-bold mb-1" style={{ color: '#FFA500' }}>
                      {(avgEagles ?? 0).toFixed(1)}
                    </div>
                    <div className="text-sm font-medium text-gray-700 mb-2">Eagles</div>
                    <div className="text-xs text-gray-500">Goal: <span style={{ color: '#FFA500' }}>{(goals.eagles ?? 0).toFixed(1)}</span></div>
                  </div>
                </div>
                
                {/* Birdies Card */}
                <div className="rounded-2xl p-6 bg-white border-2 border-gray-200">
                  <div className="text-center">
                    <div className="text-3xl font-bold mb-1" style={{ color: '#FFA500' }}>
                      {(avgBirdies ?? 0).toFixed(1)}
                    </div>
                    <div className="text-sm font-medium text-gray-700 mb-2">Birdies</div>
                    <div className="text-xs text-gray-500">Goal: <span style={{ color: '#FFA500' }}>{(goals.birdies ?? 0).toFixed(1)}</span></div>
                  </div>
                </div>
                
                {/* Pars Card */}
                <div className="rounded-2xl p-6 bg-white border-2 border-gray-200">
                  <div className="text-center">
                    <div className="text-3xl font-bold mb-1" style={{ color: '#FFA500' }}>
                      {(avgPars ?? 0).toFixed(1)}
                    </div>
                    <div className="text-sm font-medium text-gray-700 mb-2">Pars</div>
                    <div className="text-xs text-gray-500">Goal: <span style={{ color: '#FFA500' }}>{(goals.pars ?? 0).toFixed(1)}</span></div>
                  </div>
                </div>
                
                {/* Bogeys Card */}
                <div className="rounded-2xl p-6 bg-white border-2 border-gray-200">
                  <div className="text-center">
                    <div className="text-3xl font-bold mb-1" style={{ color: '#FFA500' }}>
                      {(avgBogeys ?? 0).toFixed(1)}
                    </div>
                    <div className="text-sm font-medium text-gray-700 mb-2">Bogeys</div>
                    <div className="text-xs text-gray-500">Goal: <span style={{ color: '#FFA500' }}>{(goals.bogeys ?? 0).toFixed(1)}</span></div>
                  </div>
                </div>
                
                {/* Double Bogeys Card */}
                <div className="rounded-2xl p-6 bg-white border-2 border-gray-200">
                  <div className="text-center">
                    <div className="text-3xl font-bold mb-1" style={{ color: '#FFA500' }}>
                      {(avgDoubleBogeys ?? 0).toFixed(1)}
                    </div>
                    <div className="text-sm font-medium text-gray-700 mb-2">Double Bogeys+</div>
                    <div className="text-xs text-gray-500">Goal: <span style={{ color: '#FFA500' }}>{(goals.doubleBogeys ?? 0).toFixed(1)}</span></div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>


        {/* Most Needed to Improve - With Priority Logic */}
        <div className="px-4 mb-6">
          {improvement.libraryCategory ? (
            <Link 
              href={`/library?category=${improvement.libraryCategory}${improvement.recommendedDrillId ? `&drill=${improvement.recommendedDrillId}` : ''}`}
              onClick={() => {
                // Save recommended drill ID for Coach's Pet trophy tracking
                if (improvement.recommendedDrillId && typeof window !== 'undefined') {
                  const recommendedDrills = JSON.parse(localStorage.getItem('recommendedDrills') || '[]');
                  if (!recommendedDrills.includes(improvement.recommendedDrillId)) {
                    recommendedDrills.push(improvement.recommendedDrillId);
                    localStorage.setItem('recommendedDrills', JSON.stringify(recommendedDrills));
                  }
                }
              }}
            >
              <div 
                className="rounded-2xl p-4 bg-white border-4 transition-all cursor-pointer hover:shadow-lg"
                style={{ 
                  borderColor: improvement.isPriority ? '#FFA500' : '#FFA500',
                  backgroundColor: improvement.isPriority ? '#FFA500' : 'white'
                }}
              >
                <h2 className="text-lg font-semibold mb-2" style={{ color: improvement.isPriority ? 'white' : '#014421' }}>
                  Most Needed to Improve
                </h2>
                <div 
                  className="p-3 rounded-lg"
                  style={{ 
                    backgroundColor: improvement.isPriority ? 'rgba(255, 255, 255, 0.2)' : '#FFA500',
                    opacity: improvement.isPriority ? 1 : 0.1
                  }}
                >
                  <div 
                    className="text-base font-bold mb-1 flex items-center gap-2"
                    style={{ color: improvement.isPriority ? 'white' : '#014421' }}
                  >
                    {improvement.category}
                    <ArrowRight className="w-4 h-4" />
                  </div>
                  <div 
                    className="text-sm"
                    style={{ color: improvement.isPriority ? 'white' : '#374151' }}
                  >
                    {improvement.message}
                  </div>
                </div>
              </div>
            </Link>
          ) : (
            <div 
              className="rounded-2xl p-4 bg-white border-4 transition-all"
              style={{ 
                borderColor: improvement.isPriority ? '#FFA500' : '#FFA500',
                backgroundColor: improvement.isPriority ? '#D4AF37' : 'white'
              }}
            >
              <h2 className="text-lg font-semibold mb-2" style={{ color: improvement.isPriority ? 'white' : '#014421' }}>
                Most Needed to Improve
              </h2>
              <div 
                className="p-3 rounded-lg"
                style={{ 
                  backgroundColor: improvement.isPriority ? 'rgba(255, 255, 255, 0.2)' : '#FFA500',
                  opacity: improvement.isPriority ? 1 : 0.1
                }}
              >
                <div 
                  className="text-base font-bold mb-1"
                  style={{ color: improvement.isPriority ? 'white' : '#014421' }}
                >
                  {improvement.category}
                </div>
                <div 
                  className="text-sm"
                  style={{ color: improvement.isPriority ? 'white' : '#374151' }}
                >
                  {improvement.message}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Practice Time by Category */}
        {categoryTimes.length > 0 && (
          <div className="px-4 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Practice Time by Category</h2>
            
            <div className="space-y-4">
              {categoryTimes.map((item, index) => {
                const maxMinutes = Math.max(...categoryTimes.map(ct => ct.minutes), 100);
                const percentage = (item.minutes / maxMinutes) * 100;
                
                return (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">{item.category}</span>
                      <span className="text-sm font-semibold text-gray-900">{item.minutes} mins</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-6 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: '#014421',
                          minWidth: percentage > 5 ? 'auto' : '20px'
                        }}
                      >
                        {percentage > 15 && (
                          <span className="text-xs font-medium text-white">
                            {item.minutes}m
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Practice & Preparation Separator */}
        <div className="px-4 mb-6">
          <div className="border-t-2 border-gray-300 my-6"></div>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Practice & Preparation</h2>
        </div>

        {/* Practice Insights */}
        {practiceInsights && (
          <div className="px-4 mb-6">

            {/* RadarChart - Category Distribution */}
            {practiceInsights.categoryDistribution.length > 0 && (
              <div className="mb-6 w-full">
                <div className="bg-white rounded-2xl p-6 border-2 border-gray-200 w-full">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">Practice Allocation</h3>
                  
                  {/* Timeframe Toggle */}
                  <div className="flex justify-center gap-2 mb-10">
                    <button
                      onClick={() => setPracticeTimeframe('week')}
                      className={`px-6 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                        practiceTimeframe === 'week'
                          ? 'bg-[#014421] text-white shadow-md'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Week
                    </button>
                    <button
                      onClick={() => setPracticeTimeframe('month')}
                      className={`px-6 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                        practiceTimeframe === 'month'
                          ? 'bg-[#014421] text-white shadow-md'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Month
                    </button>
                    <button
                      onClick={() => setPracticeTimeframe('year')}
                      className={`px-6 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                        practiceTimeframe === 'year'
                          ? 'bg-[#014421] text-white shadow-md'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Year
                    </button>
                  </div>

                  {/* Scroll Container with Forced Minimum Width */}
                  <div 
                    ref={chartScrollRef}
                    className="w-full overflow-x-auto overflow-y-hidden cursor-grab active:cursor-grabbing"
                    style={{ scrollbarWidth: 'thin', scrollbarColor: '#FFA500 #f3f4f6' }}
                  >
                    <div className="w-full aspect-square max-h-[420px] mx-auto flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart 
                          key={practiceTimeframe}
                          cx="50%"
                          cy="50%"
                          outerRadius={150}
                          margin={{ top: 30, right: 110, bottom: 30, left: 110 }}
                          data={practiceInsights.categoryDistribution.map(item => ({
                            subject: item.name,
                            hours: (item.value || 0) / 60
                          }))}>
                          <PolarGrid gridType="polygon" />
                          <PolarAngleAxis 
                            dataKey="subject" 
                            tick={{ fontSize: 12, fontWeight: 'bold', fill: '#1f2937', dy: 3 }}
                          />
                          <PolarRadiusAxis 
                            angle={90} 
                            domain={[0, 'auto']}
                            tick={{ fill: '#6B7280', fontSize: 10 }}
                            tickFormatter={(value) => {
                              // Format as integer with 'h' suffix for clarity
                              return `${Math.round(value)}h`;
                            }}
                          />
                          <Radar
                            name="Practice Hours"
                            dataKey="hours"
                            stroke="#16a34a"
                            fill="#16a34a"
                            fillOpacity={0.5}
                            isAnimationActive={false}
                          />
                          <Tooltip 
                            formatter={(value: number | undefined) => [`${(value ?? 0).toFixed(1)} hrs`, 'Practice Time']}
                            contentStyle={{ 
                              backgroundColor: 'rgba(1, 68, 33, 0.95)', 
                              border: '1px solid #FFA500',
                              borderRadius: '8px',
                              color: '#ffffff'
                            }}
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Visual Cue for Scrolling - Moved below chart */}
                  <div className="text-center mt-4">
                    <p className="text-xs text-gray-500 flex items-center justify-center gap-1">
                      <span>←</span>
                      <span>Swipe to view all categories</span>
                      <span>→</span>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Practice Tiles - 2x2 Grid */}
            <div className="grid grid-cols-2 gap-4">
              {/* Total Practice Time */}
              <div className="rounded-2xl p-6 bg-white border-2 border-gray-200">
                <div className="text-center">
                  <div className="text-3xl font-bold mb-1" style={{ color: '#FFA500' }}>
                    {(practiceInsights.totalHours ?? 0).toFixed(1)} hrs
                  </div>
                  <div className="text-sm font-medium text-gray-700 mb-2">Total Practice Time</div>
                  <div className="text-xs text-gray-500">
                    {practiceTimeframe === 'week' ? 'Last 7 Days' : practiceTimeframe === 'month' ? 'Last 30 Days' : 'Last Year'}
                  </div>
                </div>
              </div>

              {/* Total XP Earned */}
              <div className="rounded-2xl p-6 bg-white border-2 border-gray-200">
                <div className="text-center">
                  <div className="text-3xl font-bold mb-1" style={{ color: '#FFA500' }}>
                    {practiceInsights.totalXP.toLocaleString()}
                  </div>
                  <div className="text-sm font-medium text-gray-700 mb-2">Total XP Earned</div>
                  <div className="text-xs text-gray-500">
                    {practiceTimeframe === 'week' ? 'Last 7 Days' : practiceTimeframe === 'month' ? 'Last 30 Days' : 'Last Year'}
                  </div>
                </div>
              </div>

              {/* Top Category */}
              <div className="rounded-2xl p-6 bg-white border-2 border-gray-200">
                <div className="text-center">
                  <div className="text-3xl font-bold mb-1" style={{ color: '#FFA500' }}>
                    {practiceInsights.mostPracticed}
                  </div>
                  <div className="text-sm font-medium text-gray-700 mb-2">Top Category</div>
                  <div className="text-xs text-gray-500">Most Time Spent</div>
                </div>
              </div>

              {/* Session Count */}
              <div className="rounded-2xl p-6 bg-white border-2 border-gray-200">
                <div className="text-center">
                  <div className="text-3xl font-bold mb-1" style={{ color: '#FFA500' }}>
                    {practiceInsights.totalSessions}
                  </div>
                  <div className="text-sm font-medium text-gray-700 mb-2">Session Count</div>
                  <div className="text-xs text-gray-500">
                    {practiceTimeframe === 'week' ? 'Last 7 Days' : practiceTimeframe === 'month' ? 'Last 30 Days' : 'Last Year'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Visual Divider */}
        <div className="px-4 mt-12 mb-6">
          <div className="border-t-2 border-gray-300"></div>
        </div>

        {/* Share Progress Report Section */}
        <div className="px-4 mb-8">
          <button
            onClick={handleExportReport}
            className="w-full bg-[#FFA500] text-white font-bold rounded-xl py-4 flex items-center justify-center gap-2 hover:bg-[#FF8C00] transition-colors shadow-lg"
          >
            <Share2 className="w-5 h-5" />
            Generate Coach's Report
          </button>
        </div>

        {/* Comprehensive 10-Round Trend Coach's Report - Using ONLY inline styles with HEX colors */}
        {(() => {
          // Get last 10 rounds for report
          const last10Rounds = safeRounds.slice(-10);
          const reportRounds = last10Rounds.length > 0 ? last10Rounds : safeRounds;
          
          // Calculate averages from last 10 rounds only
          const calculateReportAverages = () => {
            if (reportRounds.length === 0) {
              return { 
                fir: 0, gir: 0, upAndDown: 0, bunkerSaves: 0,
                within8ft: 0, within20ft: 0, chipsInside6ft: 0,
                doubleChips: 0, puttMake6ft: 0, avgTotalPutts: 0, avgThreePutts: 0
              };
            }

            let totalFIR = 0;
            let totalGIR = 0;
            let totalHoles = 0;
            let totalUpAndDown = 0;
            let totalUpAndDownOpps = 0;
            let totalBunkerSaves = 0;
            let totalBunkerAttempts = 0;
            let totalWithin8ft = 0;
            let totalWithin20ft = 0;
            let totalChipInside6ft = 0;
            let totalChipOpportunities = 0;
            let totalDoubleChips = 0;
            let totalPutts = 0;
            let totalThreePutts = 0;
            let totalPuttsUnder6ftAttempts = 0;
            let totalMissed6ft = 0;
            let totalTeePenalties = 0;

            reportRounds.forEach(round => {
              const totalFIRShots = round.firLeft + round.firHit + round.firRight;
              if (totalFIRShots > 0) {
                totalFIR += (round.firHit / totalFIRShots) * 100;
              }
              totalGIR += round.totalGir;
              totalHoles += round.holes || 18;
              totalUpAndDown += round.upAndDownConversions;
              totalUpAndDownOpps += round.upAndDownConversions + round.missed;
              totalWithin8ft += round.gir8ft;
              totalWithin20ft += round.gir8ft + round.gir20ft;
              totalChipInside6ft += round.chipInside6ft;
              totalChipOpportunities += round.upAndDownConversions + round.missed;
              totalBunkerSaves += round.bunkerSaves;
              totalBunkerAttempts += round.bunkerAttempts;
              totalDoubleChips += round.doubleChips || 0;
              totalPutts += round.totalPutts;
              totalThreePutts += round.threePutts;
              totalPuttsUnder6ftAttempts += round.puttsUnder6ftAttempts;
              totalMissed6ft += round.missed6ftAndIn;
              totalTeePenalties += round.teePenalties || 0;
            });

            const bunkerSaves = totalBunkerAttempts > 0 ? (totalBunkerSaves / totalBunkerAttempts) * 100 : 0;
            const within8ft = totalGIR > 0 ? (totalWithin8ft / totalGIR) * 100 : 0;
            const within20ft = totalGIR > 0 ? (totalWithin20ft / totalGIR) * 100 : 0;
            const chipsInside6ft = totalChipOpportunities > 0 ? (totalChipInside6ft / totalChipOpportunities) * 100 : 0;
            const avgDoubleChips = reportRounds.length > 0 ? totalDoubleChips / (reportRounds.length || 1) : 0;
            const puttMake6ft = totalPuttsUnder6ftAttempts > 0
              ? ((totalPuttsUnder6ftAttempts - totalMissed6ft) / totalPuttsUnder6ftAttempts) * 100
              : 0;

            return {
              fir: reportRounds.length > 0 ? totalFIR / (reportRounds.length || 1) : 0,
              gir: totalHoles > 0 ? (totalGIR / totalHoles) * 100 : 0,
              upAndDown: totalUpAndDownOpps > 0 ? (totalUpAndDown / totalUpAndDownOpps) * 100 : 0,
              bunkerSaves: bunkerSaves,
              within8ft: within8ft,
              within20ft: within20ft,
              chipsInside6ft: chipsInside6ft,
              doubleChips: avgDoubleChips,
              puttMake6ft: puttMake6ft,
              avgTotalPutts: reportRounds.length > 0 ? totalPutts / (reportRounds.length || 1) : 0,
              avgThreePutts: reportRounds.length > 0 ? totalThreePutts / (reportRounds.length || 1) : 0,
              avgTeePenalties: reportRounds.length > 0 ? totalTeePenalties / (reportRounds.length || 1) : 0
            };
          };

          const reportAverages = calculateReportAverages();
          
          // Calculate driving distribution from last 10 rounds
          const calculateReportDrivingDistribution = () => {
            if (reportRounds.length === 0) {
              return { totalShots: 0, hitPercent: 0, leftPercent: 0, rightPercent: 0 };
            }
            
            let totalShots = 0;
            let hitShots = 0;
            let leftShots = 0;
            let rightShots = 0;
            
            reportRounds.forEach(round => {
              const roundShots = round.firLeft + round.firHit + round.firRight;
              totalShots += roundShots;
              hitShots += round.firHit;
              leftShots += round.firLeft;
              rightShots += round.firRight;
            });
            
            return {
              totalShots: totalShots,
              hitPercent: totalShots > 0 ? (hitShots / totalShots) * 100 : 0,
              leftPercent: totalShots > 0 ? (leftShots / totalShots) * 100 : 0,
              rightPercent: totalShots > 0 ? (rightShots / totalShots) * 100 : 0
            };
          };

          const reportDrivingDistribution = calculateReportDrivingDistribution();
          
          // Calculate handicap trend (compare first round to last round in 10 rounds)
          const handicapTrend = reportRounds.length >= 2 && 
            reportRounds[0].handicap !== null && 
            reportRounds[reportRounds.length - 1].handicap !== null
            ? (reportRounds[reportRounds.length - 1].handicap ?? 0) - (reportRounds[0].handicap ?? 0)
            : null;
          
          // Get Nett Score trend data for graph (all 10 rounds, ensure we have exactly 10 data points)
          const nettScoreTrend = reportRounds.map(r => r.nett || 0);
          // Pad with nulls if we have fewer than 10 rounds to ensure consistent graph
          while (nettScoreTrend.length < 10) {
            nettScoreTrend.unshift(null as any);
          }
          // Take exactly the last 10
          const validScores = nettScoreTrend.filter(n => n !== null && n > 0);
          const minScore = validScores.length > 0 ? Math.min(...validScores) : 0;
          const maxScore = validScores.length > 0 ? Math.max(...validScores) : 100;
          const scoreRange = maxScore - minScore || 20;
          const graphHeight = 200;
          const graphWidth = 800;
          const padding = 40;
          
          // Calculate points for line graph - use all 10 rounds
          const points = nettScoreTrend.slice(-10).map((score, index) => {
            const x = padding + (index / 9) * (graphWidth - 2 * padding);
            const y = score !== null && score > 0 
              ? padding + ((maxScore - score) / scoreRange) * (graphHeight - 2 * padding)
              : padding + (graphHeight - 2 * padding) / 2; // Center if no data
            return { x, y, score: score || 0 };
          });
          
          // Create path string for line
          const pathData = points.length > 0 
            ? `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
            : '';

          return (
            <div 
              ref={reportCardRef}
              style={{ 
                position: 'fixed',
                left: '-9999px',
                top: 0,
                width: '800px',
                backgroundColor: '#014421',
                padding: '32px',
                color: '#ffffff',
                fontFamily: 'Arial, sans-serif'
              }}
            >
              {/* Professional Header Banner */}
              <div style={{ 
                backgroundColor: 'rgba(255, 165, 0, 0.1)', 
                border: '2px solid #FFA500',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '24px'
              }}>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#FFA500', marginBottom: '8px' }}>
                  Elite Academy
                </div>
                <div style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', marginBottom: '4px' }}>
                  Player: {userDisplayName}
                </div>
                <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                  Date of Review: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', marginTop: '8px' }}>
                  10-Round Trend Analysis
                </div>
              </div>

              {/* Mini Nett Score Trend Graph */}
              {nettScoreTrend.length > 0 && (
                <div style={{ marginBottom: '32px', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '12px', padding: '24px' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#FFA500', marginBottom: '16px' }}>
                    Nett Score Trend (Last 10 Rounds)
                  </h2>
                  <div style={{ position: 'relative', width: '100%', height: `${graphHeight}px`, overflow: 'hidden' }}>
                    <svg width={graphWidth} height={graphHeight} style={{ display: 'block', maxWidth: '100%' }} viewBox={`0 0 ${graphWidth} ${graphHeight}`}>
                      {/* Grid lines */}
                      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                        const y = padding + ratio * (graphHeight - 2 * padding);
                        const score = maxScore - (ratio * scoreRange);
                        return (
                          <g key={ratio}>
                            <line 
                              x1={padding} 
                              y1={y} 
                              x2={graphWidth - padding} 
                              y2={y} 
                              stroke="rgba(255, 255, 255, 0.1)" 
                              strokeWidth="1"
                            />
                            <text 
                              x={padding - 10} 
                              y={y + 4} 
                              fill="rgba(255, 255, 255, 0.6)" 
                              fontSize="12"
                              textAnchor="end"
                            >
                              {score.toFixed(0)}
                            </text>
                          </g>
                        );
                      })}
                      
                      {/* Trend line */}
                      {pathData && (
                        <path
                          d={pathData}
                          fill="none"
                          stroke="#FFA500"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}
                      
                      {/* Data points */}
                      {points.map((point, index) => (
                        <circle
                          key={index}
                          cx={point.x}
                          cy={point.y}
                          r="5"
                          fill="#FFA500"
                          stroke="#014421"
                          strokeWidth="2"
                        />
                      ))}
                      
                      {/* X-axis labels - Show all 10 rounds */}
                      {points.map((point, index) => (
                        <text
                          key={index}
                          x={point.x}
                          y={graphHeight - padding + 20}
                          fill="rgba(255, 255, 255, 0.6)"
                          fontSize="11"
                          textAnchor="middle"
                        >
                          R{index + 1}
                        </text>
                      ))}
                    </svg>
                  </div>
                  <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                    <span>Best: {minScore.toFixed(0)}</span>
                    <span>Average: {reportRounds.length > 0 ? (reportRounds.reduce((sum, r) => sum + (r.nett || 0), 0) / (reportRounds.length || 1)).toFixed(1) : 'N/A'}</span>
                    <span>Worst: {maxScore.toFixed(0)}</span>
                  </div>
                </div>
              )}

              {/* Key Metrics Summary */}
              <div style={{ marginBottom: '32px', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '12px', padding: '24px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#FFA500', marginBottom: '16px' }}>10-Round Summary</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.9)' }}>Current Handicap</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#FFA500' }}>
                        {reportRounds.length > 0 && reportRounds[reportRounds.length - 1].handicap !== null 
                          ? ((reportRounds[reportRounds.length - 1].handicap ?? 0).toFixed(1))
                          : 'N/A'}
                      </span>
                      {handicapTrend !== null && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '14px', color: '#FFA500' }}>
                          {handicapTrend > 0 ? (
                            <>
                              <span style={{ fontSize: '16px' }}>↑</span>
                              <span style={{ fontWeight: 'bold' }}>+{handicapTrend.toFixed(1)}</span>
                            </>
                          ) : handicapTrend < 0 ? (
                            <>
                              <span style={{ fontSize: '16px' }}>↓</span>
                              <span style={{ fontWeight: 'bold' }}>{handicapTrend.toFixed(1)}</span>
                            </>
                          ) : (
                            <span style={{ fontWeight: 'bold' }}>0.0</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.9)' }}>Average Nett Score</span>
                    <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#FFA500' }}>
                      {reportRounds.length > 0 
                        ? (reportRounds.reduce((sum, r) => sum + (r.nett || 0), 0) / (reportRounds.length || 1)).toFixed(1)
                        : 'N/A'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.9)' }}>Rounds Analyzed</span>
                    <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#FFA500' }}>
                      {reportRounds.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Unified Driving Section - Distribution + Insights */}
              {reportDrivingDistribution.totalShots > 0 && (
                <div style={{ marginBottom: '32px', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '12px', padding: '24px' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#FFA500', marginBottom: '16px' }}>Driving Performance</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* FIR % Card */}
                    <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', marginBottom: '4px' }}>Fairways Hit (FIR %)</div>
                        <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)' }}>10-Round Average</div>
                      </div>
                      <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#FFA500' }}>
                        {(reportAverages.fir ?? 0).toFixed(1)}%
                      </div>
                    </div>

                    {/* Tee Penalties Card */}
                    <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', marginBottom: '4px' }}>Tee Penalties (Avg)</div>
                        <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)' }}>Per Round</div>
                      </div>
                      <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#FFA500' }}>
                        {(reportAverages.avgTeePenalties ?? 0).toFixed(1)}
                      </div>
                    </div>

                    {/* Distribution Bars */}
                    <div style={{ marginTop: '8px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.8)', marginBottom: '12px' }}>Distribution</div>
                      
                      {/* Fairways Hit Bar */}
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)' }}>Hit</span>
                          <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#FFA500' }}>
                            {(reportDrivingDistribution.hitPercent ?? 0).toFixed(1)}%
                          </span>
                        </div>
                        <div style={{ width: '100%', backgroundColor: '#374151', borderRadius: '9999px', height: '20px', overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              borderRadius: '9999px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              paddingRight: '8px',
                              width: `${Math.max(0, Math.min(100, (reportDrivingDistribution.hitPercent ?? 0)))}%`,
                              backgroundColor: '#FFA500'
                            }}
                          />
                        </div>
                      </div>

                      {/* Left Miss Bar */}
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)' }}>Left Miss</span>
                          <span style={{ fontSize: '14px', fontWeight: 'bold', color: 'rgba(255, 255, 255, 0.8)' }}>
                            {(reportDrivingDistribution.leftPercent ?? 0).toFixed(1)}%
                          </span>
                        </div>
                        <div style={{ width: '100%', backgroundColor: '#374151', borderRadius: '9999px', height: '20px', overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              borderRadius: '9999px',
                              width: `${Math.max(0, Math.min(100, (reportDrivingDistribution.leftPercent ?? 0)))}%`,
                              backgroundColor: '#6B7280'
                            }}
                          />
                        </div>
                      </div>

                      {/* Right Miss Bar */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)' }}>Right Miss</span>
                          <span style={{ fontSize: '14px', fontWeight: 'bold', color: 'rgba(255, 255, 255, 0.8)' }}>
                            {(reportDrivingDistribution.rightPercent ?? 0).toFixed(1)}%
                          </span>
                        </div>
                        <div style={{ width: '100%', backgroundColor: '#374151', borderRadius: '9999px', height: '20px', overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              borderRadius: '9999px',
                              width: `${Math.max(0, Math.min(100, (reportDrivingDistribution.rightPercent ?? 0)))}%`,
                              backgroundColor: '#6B7280'
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Short Game Mastery Section */}
              <div style={{ marginBottom: '32px', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '12px', padding: '24px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#FFA500', marginBottom: '16px' }}>Short Game Mastery</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', marginBottom: '4px' }}>Up & Down %</div>
                      <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)' }}>Goal: {(goals.upAndDown ?? 0).toFixed(1)}%</div>
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#FFA500' }}>
                      {(reportAverages.upAndDown ?? 0).toFixed(1)}%
                    </div>
                  </div>
                  <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', marginBottom: '4px' }}>Chip Inside 6ft %</div>
                      <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)' }}>Goal: {(goals.chipsInside6ft ?? 0).toFixed(1)}%</div>
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#FFA500' }}>
                      {(reportAverages.chipsInside6ft ?? 0).toFixed(1)}%
                    </div>
                  </div>
                  <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', marginBottom: '4px' }}>Bunker Saves %</div>
                      <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)' }}>Goal: {(goals.bunkerSaves ?? 0).toFixed(1)}%</div>
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#FFA500' }}>
                      {(reportAverages.bunkerSaves ?? 0).toFixed(1)}%
                    </div>
                  </div>
                  <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', marginBottom: '4px' }}>Double Chips (Avg)</div>
                      <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)' }}>Per Round</div>
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#FFA500' }}>
                      {(reportAverages.doubleChips ?? 0).toFixed(1)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Putting Precision Section */}
              <div style={{ marginBottom: '32px', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '12px', padding: '24px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#FFA500', marginBottom: '16px' }}>Putting Precision</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', marginBottom: '4px' }}>Total Putts (Avg)</div>
                      <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)' }}>Goal: {(goals.putts ?? 0).toFixed(1)}</div>
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#FFA500' }}>
                      {(reportAverages.avgTotalPutts ?? 0).toFixed(1)}
                    </div>
                  </div>
                  <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', marginBottom: '4px' }}>&lt; 6ft Make %</div>
                      <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)' }}>Goal: {(goals.puttMake6ft ?? 0).toFixed(1)}%</div>
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#FFA500' }}>
                      {(reportAverages.puttMake6ft ?? 0).toFixed(1)}%
                    </div>
                  </div>
                  <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', marginBottom: '4px' }}>3-Putts (Avg)</div>
                      <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)' }}>Goal: &lt; 1.0</div>
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#FFA500' }}>
                      {(reportAverages.avgThreePutts ?? 0).toFixed(1)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Monthly Skill Balance - Spider Chart */}
              {(() => {
                // Calculate skill pillars from last 10 rounds (monthly averages)
                const calculateSkillPillars = () => {
                  if (reportRounds.length === 0) {
                    return {
                      drivingAccuracy: 0,
                      approachProximity: 0,
                      scrambling: 0,
                      bunkerPlay: 0,
                      puttingConsistency: 0
                    };
                  }

                  // Driving Accuracy: FIR %
                  let totalFIRShots = 0;
                  let totalFIRHit = 0;
                  reportRounds.forEach(round => {
                    const roundShots = round.firLeft + round.firHit + round.firRight;
                    totalFIRShots += roundShots;
                    totalFIRHit += round.firHit;
                  });
                  const drivingAccuracy = totalFIRShots > 0 ? (totalFIRHit / totalFIRShots) * 100 : 0;

                  // Approach Proximity: Within 20ft % of GIR
                  let totalGIR = 0;
                  let totalWithin20ft = 0;
                  reportRounds.forEach(round => {
                    totalGIR += round.totalGir;
                    totalWithin20ft += round.gir8ft + round.gir20ft;
                  });
                  const approachProximity = totalGIR > 0 ? (totalWithin20ft / totalGIR) * 100 : 0;

                  // Scrambling: Up & Down %
                  let totalUpAndDown = 0;
                  let totalUpAndDownOpps = 0;
                  reportRounds.forEach(round => {
                    totalUpAndDown += round.upAndDownConversions;
                    totalUpAndDownOpps += round.upAndDownConversions + round.missed;
                  });
                  const scrambling = totalUpAndDownOpps > 0 ? (totalUpAndDown / totalUpAndDownOpps) * 100 : 0;

                  // Bunker Play: Bunker Saves %
                  let totalBunkerSaves = 0;
                  let totalBunkerAttempts = 0;
                  reportRounds.forEach(round => {
                    totalBunkerSaves += round.bunkerSaves;
                    totalBunkerAttempts += round.bunkerAttempts;
                  });
                  const bunkerPlay = totalBunkerAttempts > 0 ? (totalBunkerSaves / totalBunkerAttempts) * 100 : 0;

                  // Putting Consistency: < 6ft Make %
                  let totalPuttsUnder6ftAttempts = 0;
                  let totalMissed6ft = 0;
                  reportRounds.forEach(round => {
                    totalPuttsUnder6ftAttempts += round.puttsUnder6ftAttempts;
                    totalMissed6ft += round.missed6ftAndIn;
                  });
                  const puttingConsistency = totalPuttsUnder6ftAttempts > 0
                    ? ((totalPuttsUnder6ftAttempts - totalMissed6ft) / totalPuttsUnder6ftAttempts) * 100
                    : 0;

                  return {
                    drivingAccuracy: Math.min(100, Math.max(0, drivingAccuracy)),
                    approachProximity: Math.min(100, Math.max(0, approachProximity)),
                    scrambling: Math.min(100, Math.max(0, scrambling)),
                    bunkerPlay: Math.min(100, Math.max(0, bunkerPlay)),
                    puttingConsistency: Math.min(100, Math.max(0, puttingConsistency))
                  };
                };

                const skillPillars = calculateSkillPillars();
                const chartSize = 350;
                const centerX = chartSize / 2;
                const centerY = chartSize / 2;
                const maxRadius = 130;
                const numAxes = 5;
                const angleStep = (2 * Math.PI) / numAxes;
                
                // Skill labels
                const skillLabels = [
                  'Driving Accuracy',
                  'Approach Proximity',
                  'Scrambling',
                  'Bunker Play',
                  'Putting Consistency'
                ];

                // Calculate points for each axis
                const axisPoints = skillLabels.map((label, index) => {
                  const angle = (index * angleStep) - (Math.PI / 2); // Start at top
                  const value = [
                    skillPillars.drivingAccuracy,
                    skillPillars.approachProximity,
                    skillPillars.scrambling,
                    skillPillars.bunkerPlay,
                    skillPillars.puttingConsistency
                  ][index];
                  const radius = (value / 100) * maxRadius;
                  const x = centerX + radius * Math.cos(angle);
                  const y = centerY + radius * Math.sin(angle);
                  const labelX = centerX + (maxRadius + 40) * Math.cos(angle);
                  const labelY = centerY + (maxRadius + 40) * Math.sin(angle);
                  return { x, y, labelX, labelY, label, value, angle };
                });

                // Create polygon path
                const polygonPath = axisPoints.map((point, index) => 
                  `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
                ).join(' ') + ' Z';

                return (
                  <div style={{ marginBottom: '32px', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '12px', padding: '64px' }}>
                    <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#FFA500', marginBottom: '20px', textAlign: 'center' }}>
                      Monthly Skill Balance
                    </h2>
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
                      <svg width={chartSize} height={chartSize} viewBox={`0 0 ${chartSize} ${chartSize}`} style={{ overflow: 'visible' }}>
                        {/* Grid circles */}
                        {[0.25, 0.5, 0.75, 1].map((ratio) => {
                          const radius = maxRadius * ratio;
                          return (
                            <circle
                              key={ratio}
                              cx={centerX}
                              cy={centerY}
                              r={radius}
                              fill="none"
                              stroke="rgba(255, 255, 255, 0.3)"
                              strokeWidth="1"
                            />
                          );
                        })}

                        {/* Grid lines (axes) */}
                        {axisPoints.map((point, index) => {
                          const endX = centerX + maxRadius * Math.cos(point.angle);
                          const endY = centerY + maxRadius * Math.sin(point.angle);
                          return (
                            <line
                              key={`axis-${index}`}
                              x1={centerX}
                              y1={centerY}
                              x2={endX}
                              y2={endY}
                              stroke="rgba(255, 255, 255, 0.3)"
                              strokeWidth="1"
                            />
                          );
                        })}

                        {/* Data polygon */}
                        <path
                          d={polygonPath}
                          fill="#FFA500"
                          fillOpacity="0.3"
                          stroke="#FFA500"
                          strokeWidth="3"
                        />

                        {/* Data points */}
                        {axisPoints.map((point, index) => (
                          <circle
                            key={`point-${index}`}
                            cx={point.x}
                            cy={point.y}
                            r="5"
                            fill="#FFA500"
                            stroke="#014421"
                            strokeWidth="2"
                          />
                        ))}

                        {/* Labels */}
                        {axisPoints.map((point, index) => {
                          const textAnchor = point.angle > -Math.PI / 2 && point.angle < Math.PI / 2 ? 'start' : 'end';
                          const labelParts = point.label.split(' ');
                          return (
                            <g key={`label-${index}`}>
                              <text
                                x={point.labelX}
                                y={point.labelY - 8}
                                fill="#ffffff"
                                fontSize="14"
                                fontWeight="bold"
                                textAnchor={textAnchor}
                                dominantBaseline="middle"
                              >
                                {labelParts[0]}
                              </text>
                              {labelParts[1] && (
                                <text
                                  x={point.labelX}
                                  y={point.labelY + 8}
                                  fill="#ffffff"
                                  fontSize="14"
                                  fontWeight="bold"
                                  textAnchor={textAnchor}
                                  dominantBaseline="middle"
                                >
                                  {labelParts[1]}
                                </text>
                              )}
                              {/* Value labels */}
                              <text
                                x={point.x}
                                y={point.y - 15}
                                fill="#FFA500"
                                fontSize="14"
                                fontWeight="bold"
                                textAnchor="middle"
                                dominantBaseline="middle"
                              >
                                {point.value.toFixed(0)}%
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                    <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', fontSize: '14px', textAlign: 'center' }}>
                      {axisPoints.map((point, index) => (
                        <div key={index} style={{ color: '#ffffff' }}>
                          <div style={{ fontWeight: 'bold', color: '#ffffff', fontSize: '14px' }}>{point.value.toFixed(0)}%</div>
                          <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#ffffff' }}>{point.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Practice Summary Section - Last 7 Days */}
              <div style={{ marginBottom: '32px', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '12px', padding: '24px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#FFA500', marginBottom: '16px' }}>
                  Recent Practice Activity (Last 7 Days)
                </h2>
                {recentActivities.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {recentActivities.map((activity, index) => {
                      const activityDate = new Date(activity.timestamp || activity.date || Date.now());
                      const formattedDate = activityDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                      return (
                        <div 
                          key={index}
                          style={{
                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                            borderRadius: '8px',
                            padding: '16px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', marginBottom: '4px' }}>
                              {activity.drillTitle || activity.title || 'Practice Session'}
                            </div>
                            <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.7)' }}>
                              {activity.category || 'Practice'} • {formattedDate}
                            </div>
                          </div>
                          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#FFA500' }}>
                            {activity.xp || 100} XP
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255, 255, 255, 0.6)' }}>
                    No practice activity in the last 7 days
                  </div>
                )}
              </div>

              {/* Footer */}
              <div style={{ 
                marginTop: '32px', 
                paddingTop: '24px', 
                borderTop: '1px solid rgba(255, 255, 255, 0.2)',
                textAlign: 'center',
                color: 'rgba(255, 255, 255, 0.6)',
                fontSize: '12px'
              }}>
                Elite Academy 10-Round Trend Report • Generated on {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
          );
        })()}

        {/* Toast Notification */}
        {showToast && (
          <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 z-50 bg-white rounded-xl shadow-2xl px-6 py-4 flex items-center gap-3 border-2" style={{ borderColor: '#FFA500' }}>
            <CheckCircle2 className="w-6 h-6" style={{ color: '#FFA500' }} />
            <span className="font-semibold text-gray-900">Report Saved to Gallery!</span>
          </div>
        )}
      </div>
    </div>
      );
    } catch (error) {
      console.error('Error rendering Stats page:', error);
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <p className="text-gray-600 mb-4">Something went wrong. Please refresh the page.</p>
            <button 
              onClick={() => window.location.reload()} 
              className="px-4 py-2 bg-[#014421] text-white rounded-lg"
            >
              Refresh
            </button>
          </div>
        </div>
      );
    }
  };
  
  // Wrap entire return in empty check - if no rounds, show empty state
  if (!rounds || rounds.length === 0) {
    return <EmptyStatsState />;
  }
  
  return renderContent();
}


