"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useStats } from "@/contexts/StatsContext";
import { useAuth } from "@/contexts/AuthContext";
import { motion, useSpring, useTransform } from "framer-motion";

function AnimatedNumber({ value, isPercentage = false }: { value: number; isPercentage?: boolean }) {
  const spring = useSpring(value >= 0 ? value : 0, { mass: 0.8, stiffness: 75, damping: 15 });
  const display = useTransform(spring, (current) => value === -1 ? '--' : `${current.toFixed(1)}${isPercentage ? '%' : ''}`);

  useEffect(() => {
    spring.set(value >= 0 ? value : 0);
  }, [value, spring]);

  return <motion.span>{display}</motion.span>;
}

const StatDisplay = ({
  label,
  tooltip,
  current,
  goal,
  isPercentage = false,
  inverse = false,
  isAdjustingGoal
}: {
  label: string;
  tooltip?: string;
  current: number;
  goal: number;
  isPercentage?: boolean;
  inverse?: boolean;
  isAdjustingGoal: boolean;
}) => {
  const diff = goal - current;
  const gap = inverse ? -diff : diff;
  const needsImprovement = gap > 0;
  const gapText = needsImprovement ? `${inverse ? '-' : '+'}${Math.abs(gap).toFixed(1)}${isPercentage ? '%' : ''}` : `Target Met`;
  
  const isMeetingGoal = inverse ? current <= goal : current >= goal;
  const goalColor = isMeetingGoal ? 'text-green-500' : 'text-red-500';

  return (
    <div className="flex items-center justify-between py-2">
      {tooltip ? (
        <div className="flex items-center gap-1 group relative">
          <div className="text-sm text-gray-700">{label}</div>
          <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-[10px] font-bold cursor-help border border-gray-200 transition-colors hover:bg-gray-200">i</div>
          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-48 bg-gray-900 text-white text-xs rounded-lg p-2 shadow-xl z-10">
            {tooltip}
          </div>
        </div>
      ) : (
        <div className="text-sm text-gray-700">{label}</div>
      )}
      
      <div className="flex items-center gap-3">
        {isAdjustingGoal && (
          <div className="flex items-center gap-2 animate-in fade-in duration-300">
            <span className="text-[10px] font-bold text-[#FF9800] uppercase tracking-wider bg-orange-50 px-2 py-0.5 rounded border border-orange-100">
              Gap: {gapText}
            </span>
          </div>
        )}
        <div className="flex items-baseline gap-2">
          <div className="text-2xl font-bold transition-colors duration-300 text-[#FF9800]">
            <AnimatedNumber value={current} isPercentage={isPercentage} />
          </div>
          <div className="flex flex-col items-end justify-center">
            <span className="text-[9px] leading-none text-gray-400 font-bold uppercase tracking-wider mb-0.5">Goal</span>
            <div className={`text-sm leading-none font-bold transition-all duration-300 ${isAdjustingGoal ? 'text-[#FF9800] scale-110 drop-shadow-sm' : goalColor}`}>
              <AnimatedNumber value={goal} isPercentage={isPercentage} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Linear scaling function: Maps handicap from 54 to +5 to goal percentages
const getBenchmarkGoals = (handicap: number) => {
  const clampedHandicap = Math.max(-5, Math.min(54, handicap));
  const normalized = (54 - clampedHandicap) / (54 - (-5));
  
  const gir = 8 + (70 - 8) * normalized;
  const fir = 15 + (75 - 15) * normalized;
  const upAndDown = 10 + (65 - 10) * normalized;
  const putts = 40 - (40 - 26) * normalized;
  const bunkerSaves = 10 + (50 - 10) * normalized;
  const within8ft = 3 + (15 - 3) * normalized;
  const within20ft = 15 + (50 - 15) * normalized;
  const chipsInside6ft = 30 + (70 - 30) * normalized;
  const puttMake6ft = 60 + (95 - 60) * normalized;
  const score = clampedHandicap + 72;
  const birdies = 0 + (3.5 - 0) * normalized;
  const pars = 5 + (13.5 - 5) * normalized;
  const bogeys = 10 - (10 - 3) * normalized;
  const doubleBogeys = 10 - (10 - 0) * normalized;
  const teePenalties = 2 - (2 - 0) * normalized;
  const approachPenalties = 2 - (2 - 0) * normalized;
  const totalPenalties = teePenalties + approachPenalties;
  
  return {
    score: Math.round(score),
    gir: Math.round(gir),
    fir: Math.round(fir),
    upAndDown: Math.round(upAndDown),
    putts: Math.round(putts * 10) / 10,
    bunkerSaves: Math.round(bunkerSaves),
    within8ft: Math.round(within8ft),
    within20ft: Math.round(within20ft),
    chipsInside6ft: Math.round(chipsInside6ft),
    puttMake6ft: Math.round(puttMake6ft),
    birdies: Math.round(birdies * 10) / 10,
    pars: Math.round(pars * 10) / 10,
    eagles: 0,
    bogeys: Math.round(bogeys * 10) / 10,
    doubleBogeys: Math.round(doubleBogeys * 10) / 10,
    teePenalties: Math.round(teePenalties * 10) / 10,
    approachPenalties: Math.round(approachPenalties * 10) / 10,
    totalPenalties: Math.round(totalPenalties * 10) / 10
  };
};

export default function StatsPage() {
  // ============================================
  // ALL HOOKS MUST BE AT THE TOP - NO EXCEPTIONS
  // ============================================
  
  // Context hooks
  const { rounds, practiceSessions, loading: statsLoading, refreshRounds } = useStats();
  const { user, loading: authLoading } = useAuth();
  
  // Filter by User ID: Filter the array so it only includes rounds belonging to the current user
  // Keep Academy Global: This change only happens on the stats page. The Academy leaderboard must stay global so Stuart and Sean still show up there.
  const personalRounds = useMemo(() => {
    if (!rounds || !user?.id) return [];
    // Type assertion: rounds from StatsContext include user_id even though RoundData interface doesn't explicitly list it
    return rounds.filter((r: any) => (r as any).user_id === user.id);
  }, [rounds, user?.id]);
  
  const personalPractice = useMemo(() => {
    if (!practiceSessions || !user?.id) return [];
    return practiceSessions.filter((p: any) => p.user_id === user.id);
  }, [practiceSessions, user?.id]);
  
  // Ensure rounds is always an array (use personalRounds for stats page)
  const safeRounds = personalRounds || [];
  
  // Debug: Log rounds data
  useEffect(() => {
    console.log('StatsPage: Rounds Data:', rounds);
    console.log('StatsPage: Rounds Length:', rounds?.length || 0);
    console.log('StatsPage: Stats Loading:', statsLoading);
  }, [rounds, statsLoading]);

  // Force refresh when roundsUpdated event is fired
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleRoundsUpdate = () => {
      console.log('StatsPage: Received roundsUpdated event, calling refreshRounds...');
      // Use the context's refreshRounds function to reload data
      if (refreshRounds) {
        refreshRounds();
      }
    };

    window.addEventListener('roundsUpdated', handleRoundsUpdate);

    return () => {
      window.removeEventListener('roundsUpdated', handleRoundsUpdate);
    };
  }, [refreshRounds]);
  
  // State hooks - MUST be before any conditional returns
  // Use user's initialHandicap if available, otherwise default to 8.7
  const [selectedGoal, setSelectedGoal] = useState<number>(user?.initialHandicap ?? 8.7);
  const [isAdjustingGoal, setIsAdjustingGoal] = useState<boolean>(false);
  const adjustTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const handleGoalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newGoal = parseFloat(e.target.value);
    setSelectedGoal(newGoal);
    setIsAdjustingGoal(true);
    
    if (adjustTimeoutRef.current) {
      clearTimeout(adjustTimeoutRef.current);
    }
    
    // Debounce the Supabase update
    adjustTimeoutRef.current = setTimeout(async () => {
      setIsAdjustingGoal(false);
      
      if (user?.id) {
        try {
          const { createClient } = await import("@/lib/supabase/client");
          const supabase = createClient();
          const { error } = await supabase
            .from('profiles')
            .update({ initial_handicap: newGoal })
            .eq('id', user.id);
            
          if (error) {
            console.error('Error updating goal handicap:', error);
          }
        } catch (err) {
          console.error('Failed to update goal handicap:', err);
        }
      }
    }, 1000); // 1 second debounce for the DB update
  };
  
  // Update selectedGoal when user's initialHandicap changes
  useEffect(() => {
    if (user?.initialHandicap !== undefined) {
      setSelectedGoal(user.initialHandicap);
    }
  }, [user?.initialHandicap]);
  const [selectedMetric, setSelectedMetric] = useState<'nettScore' | 'gross' | 'birdies' | 'pars' | 'bogeys' | 'totalPutts' | 'doubleBogeys' | 'eagles' | 'threePutts' | 'fairwaysHit' | 'gir' | 'gir8ft' | 'gir20ft' | 'upAndDown' | 'bunkerSaves' | 'chipInside6ft' | 'doubleChips' | 'totalPenalties'>('nettScore');
  const [activeHistory, setActiveHistory] = useState<'LAST 5' | 'LAST 10' | 'LAST 20' | 'ALL'>('LAST 10');
  const [holeFilter, setHoleFilter] = useState<'9' | '18'>('18');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [forceLoaded, setForceLoaded] = useState(false);
  const [skillAssessmentFilter, setSkillAssessmentFilter] = useState<'WEEK' | 'MONTH' | 'ALL'>('ALL');
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  
  // Safety Net Mock Data
  const safetyNetData: {val: number, date: string}[] = [
    { val: 92, date: 'Round 1' }, { val: 88, date: 'Round 2' }, { val: 85, date: 'Round 3' },
    { val: 90, date: 'Round 4' }, { val: 87, date: 'Round 5' }, { val: 83, date: 'Round 6' },
    { val: 80, date: 'Round 7' }, { val: 78, date: 'Round 8' }, { val: 82, date: 'Round 9' },
    { val: 79, date: 'Round 10' },
  ];

  // Emergency Timeout: Force setForceLoaded(true) after 3 seconds only if still loading
  useEffect(() => {
    // Don't set timeout if data has already loaded
    if (!statsLoading && rounds !== undefined) {
      setForceLoaded(true);
      return;
    }
    
    const timeout = setTimeout(() => {
      if (statsLoading) {
        setForceLoaded(true);
        console.log('Emergency timeout: Forcing Stats component to render after 3 seconds');
      }
    }, 3000);
    return () => clearTimeout(timeout);
  }, [statsLoading, rounds]);

  // Get benchmark goals based on selected goal handicap
  const goals = getBenchmarkGoals(selectedGoal);
  
  // Calculate ALL performance metrics for tiles
  const performanceMetrics = useMemo(() => {
    if (safeRounds.length === 0) {
      return {
        // DRIVING
        firPercent: 0,
        missedLeft: 0,
        missedRight: 0,
        totalFirShots: 0,
        firHit: 0,
        firMissed: 0,
        // APPROACH
        girPercent: 0,
        gir8ft: 0,
        gir20ft: 0,
        // SHORT GAME
        upAndDownPercent: 0,
        bunkerSaves: 0,
        chipInside6ft: 0,
        // PUTTING
        avgPutts: 0,
        puttsUnder6ftMake: 0,
        avgThreePutts: 0,
        // PENALTIES
        teePenalties: 0,
        approachPenalties: 0,
        totalPenalties: 0,
      };
    }

    // DRIVING: FIR percentage and shot breakdown
    const totalFir = safeRounds.reduce((sum, r) => sum + (r.firHit || 0) + (r.firLeft || 0) + (r.firRight || 0), 0);
    const firHit = safeRounds.reduce((sum, r) => sum + (r.firHit || 0), 0);
    const firLeft = safeRounds.reduce((sum, r) => sum + (r.firLeft || 0), 0);
    const firRight = safeRounds.reduce((sum, r) => sum + (r.firRight || 0), 0);
    const firMissed = firLeft + firRight;
    const firPercent = totalFir > 0 ? (firHit / totalFir) * 100 : 0;
    const missedLeft = totalFir > 0 ? (firLeft / totalFir) * 100 : 0;
    const missedRight = totalFir > 0 ? (firRight / totalFir) * 100 : 0;

    // APPROACH: GIR percentage
    const totalGir = safeRounds.reduce((sum, r) => sum + (r.totalGir || 0), 0);
    const totalHoles = safeRounds.reduce((sum, r) => sum + (r.holes || 18), 0);
    const girPercent = totalHoles > 0 ? (totalGir / totalHoles) * 100 : 0;

    // APPROACH: GIR from distances percentages
    const totalGir8ft = safeRounds.reduce((sum, r) => sum + (r.gir8ft || 0), 0);
    const totalGir20ft = safeRounds.reduce((sum, r) => sum + (r.gir20ft || 0), 0);
    // Calculate percentage based on total GIRs
    const gir8ft = totalGir > 0 ? (totalGir8ft / totalGir) * 100 : 0;
    const gir20ft = totalGir > 0 ? (totalGir20ft / totalGir) * 100 : 0;

    // SHORT GAME: Up & Down percentage
    const totalUpDownAttempts = safeRounds.reduce((sum, r) => sum + (r.upAndDownConversions || 0) + (r.missed || 0), 0);
    const upDownSuccess = safeRounds.reduce((sum, r) => sum + (r.upAndDownConversions || 0), 0);
    const upAndDownPercent = totalUpDownAttempts > 0 ? (upDownSuccess / totalUpDownAttempts) * 100 : 0;

    // SHORT GAME: Bunker Saves percentage
    const totalBunkerAttempts = safeRounds.reduce((sum, r) => sum + (r.bunkerAttempts || 0) + (r.bunkerSaves || 0), 0);
    const bunkerSavesCount = safeRounds.reduce((sum, r) => sum + (r.bunkerSaves || 0), 0);
    const bunkerSaves = totalBunkerAttempts > 0 ? (bunkerSavesCount / totalBunkerAttempts) * 100 : 0;

    // SHORT GAME: Chip Inside 6ft (Scrambling %)
    const totalChips = safeRounds.reduce((sum, r) => sum + (r.chipInside6ft || 0) + (r.doubleChips || 0), 0); // Need to know total chips, using doubleChips as missed for now or just standardizing based on up&down attempts
    // Better way for Chip Inside 6ft percentage: It's usually chip inside 6ft / total chips
    // Let's use totalUpDownAttempts as the denominator since that's roughly total short game shots
    const chipInside6ft = totalUpDownAttempts > 0 ? (safeRounds.reduce((sum, r) => sum + (r.chipInside6ft || 0), 0) / totalUpDownAttempts) * 100 : 0;

    // PUTTING: Average Putts per round
    const totalPutts = safeRounds.reduce((sum, r) => sum + (r.totalPutts || 0), 0);
    const avgPutts = safeRounds.length > 0 ? totalPutts / safeRounds.length : 0;

    // PUTTING: < 6ft Make percentage
    const totalPuttsUnder6ft = safeRounds.reduce((sum, r) => sum + ((r as any).putts_attempts_6ft ?? r.puttsUnder6ftAttempts ?? 0), 0);
    const puttsMadeUnder6ft = safeRounds.reduce((sum, r) => sum + ((r as any).putts_made_6ft ?? r.made6ftAndIn ?? 0), 0);
    const puttsUnder6ftMake = Math.round((puttsMadeUnder6ft / totalPuttsUnder6ft) * 100) || 0;

    // PUTTING: 3-Putts (average per round)
    const totalThreePutts = safeRounds.reduce((sum, r) => sum + (r.threePutts || 0), 0);
    const avgThreePutts = safeRounds.length > 0 ? totalThreePutts / safeRounds.length : 0;

    // PENALTIES: All penalty types
    const totalTeePenalties = safeRounds.reduce((sum, r) => sum + (r.teePenalties || 0), 0);
    const teePenalties = safeRounds.length > 0 ? totalTeePenalties / safeRounds.length : 0;
    const totalApproachPenalties = safeRounds.reduce((sum, r) => sum + (r.approachPenalties || 0), 0);
    const approachPenalties = safeRounds.length > 0 ? totalApproachPenalties / safeRounds.length : 0;
    const totalPenaltiesCount = safeRounds.reduce((sum, r) => sum + (r.totalPenalties || 0), 0);
    const totalPenalties = safeRounds.length > 0 ? totalPenaltiesCount / safeRounds.length : 0;

    return {
      // DRIVING
      firPercent: Math.round(firPercent * 10) / 10,
      missedLeft: Math.round(missedLeft * 10) / 10,
      missedRight: Math.round(missedRight * 10) / 10,
      totalFirShots: totalFir,
      firHit: firHit,
      firMissed: firMissed,
      // APPROACH
      girPercent: Math.round(girPercent * 10) / 10,
      gir8ft: Math.round(gir8ft * 10) / 10,
      gir20ft: Math.round(gir20ft * 10) / 10,
      // SHORT GAME
      upAndDownPercent: Math.round(upAndDownPercent * 10) / 10,
      bunkerSaves: Math.round(bunkerSaves * 10) / 10,
      chipInside6ft: Math.round(chipInside6ft * 10) / 10,
      // PUTTING
      avgPutts: Math.round(avgPutts * 10) / 10,
      puttsUnder6ftMake: Math.round(puttsUnder6ftMake * 10) / 10,
      avgThreePutts: Math.round(avgThreePutts * 10) / 10,
      // PENALTIES
      teePenalties: Math.round(teePenalties * 10) / 10,
      approachPenalties: Math.round(approachPenalties * 10) / 10,
      totalPenalties: Math.round(totalPenalties * 10) / 10,
    };
  }, [safeRounds]);

  // Full data collection for trend graph
  const fullData: Record<string, {val: number, date: string}[]> = useMemo(() => {
    const filteredRounds = holeFilter === '9' 
      ? safeRounds.filter(r => r.holes === 9)
      : safeRounds.filter(r => r.holes === 18);

    if (!filteredRounds || filteredRounds.length === 0) {
      return {
        'NETT SCORE': safetyNetData,
        'GROSS SCORE': safetyNetData,
        'BIRDIES': safetyNetData.map(d => ({ ...d, val: 0 })),
        'PARS': safetyNetData.map(d => ({ ...d, val: 8 })),
        'BOGEYS': safetyNetData.map(d => ({ ...d, val: 6 })),
        'DOUBLE BOGEYS': safetyNetData.map(d => ({ ...d, val: 2 })),
        'EAGLES': safetyNetData.map(d => ({ ...d, val: 0 })),
        'TOTAL PUTTS': safetyNetData.map(d => ({ ...d, val: 32 })),
        'THREE PUTTS': safetyNetData.map(d => ({ ...d, val: 1 })),
        'FAIRWAYS HIT': safetyNetData.map(d => ({ ...d, val: 10 })),
        'GIR': safetyNetData.map(d => ({ ...d, val: 8 })),
        'GIR 8FT': safetyNetData.map(d => ({ ...d, val: 2 })),
        'GIR 20FT': safetyNetData.map(d => ({ ...d, val: 5 })),
        'UP AND DOWN': safetyNetData.map(d => ({ ...d, val: 3 })),
        'BUNKER SAVES': safetyNetData.map(d => ({ ...d, val: 2 })),
        'CHIP INSIDE 6FT': safetyNetData.map(d => ({ ...d, val: 4 })),
        'DOUBLE CHIPS': safetyNetData.map(d => ({ ...d, val: 1 })),
        'TOTAL PENALTIES': safetyNetData.map(d => ({ ...d, val: 1 })),
        'TEE PENALTIES': safetyNetData.map(d => ({ ...d, val: 0 })),
        'APPROACH PENALTIES': safetyNetData.map(d => ({ ...d, val: 1 })),
        'MADE 6FT AND IN': safetyNetData.map(d => ({ ...d, val: 2 })),
      };
    }

    const data: Record<string, {val: number, date: string}[]> = {
      'NETT SCORE': [],
      'GROSS SCORE': [],
      'BIRDIES': [],
      'PARS': [],
      'BOGEYS': [],
      'DOUBLE BOGEYS': [],
      'EAGLES': [],
      'TOTAL PUTTS': [],
      'THREE PUTTS': [],
      'FAIRWAYS HIT': [],
      'FAIRWAYS LEFT': [],
      'FAIRWAYS RIGHT': [],
      'GIR': [],
      'GIR 8FT': [],
      'GIR 20FT': [],
      'UP AND DOWN': [],
      'BUNKER SAVES': [],
      'CHIP INSIDE 6FT': [],
      'DOUBLE CHIPS': [],
      'TOTAL PENALTIES': [],
      'TEE PENALTIES': [],
      'APPROACH PENALTIES': [],
      'MADE 6FT AND IN': [],
    };

    filteredRounds.forEach((round, index) => {
      const roundDate = round.date ? new Date(round.date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) : `Round ${index + 1}`;
      
      data['NETT SCORE'].push({ val: round.nett || 0, date: roundDate });
      data['GROSS SCORE'].push({ val: round.score || 0, date: roundDate });
      data['BIRDIES'].push({ val: round.birdies || 0, date: roundDate });
      data['PARS'].push({ val: round.pars || 0, date: roundDate });
      data['BOGEYS'].push({ val: round.bogeys || 0, date: roundDate });
      data['DOUBLE BOGEYS'].push({ val: round.doubleBogeys || 0, date: roundDate });
      data['EAGLES'].push({ val: round.eagles || 0, date: roundDate });
      data['TOTAL PUTTS'].push({ val: round.totalPutts || 0, date: roundDate });
      data['THREE PUTTS'].push({ val: round.threePutts || 0, date: roundDate });
      data['FAIRWAYS HIT'].push({ val: round.firHit || 0, date: roundDate });
      data['FAIRWAYS LEFT'].push({ val: round.firLeft || 0, date: roundDate });
      data['FAIRWAYS RIGHT'].push({ val: round.firRight || 0, date: roundDate });
      data['GIR'].push({ val: round.totalGir || 0, date: roundDate });
      data['GIR 8FT'].push({ val: round.gir8ft || 0, date: roundDate });
      data['GIR 20FT'].push({ val: round.gir20ft || 0, date: roundDate });
      data['UP AND DOWN'].push({ val: round.upAndDownConversions || 0, date: roundDate });
      data['BUNKER SAVES'].push({ val: round.bunkerSaves || 0, date: roundDate });
      data['CHIP INSIDE 6FT'].push({ val: round.chipInside6ft || 0, date: roundDate });
      data['DOUBLE CHIPS'].push({ val: round.doubleChips || 0, date: roundDate });
      data['TOTAL PENALTIES'].push({ val: round.totalPenalties || 0, date: roundDate });
      data['TEE PENALTIES'].push({ val: round.teePenalties || 0, date: roundDate });
      data['APPROACH PENALTIES'].push({ val: round.approachPenalties || 0, date: roundDate });
      data['MADE 6FT AND IN'].push({ val: round.made6ftAndIn || 0, date: roundDate });
    });

    return data;
  }, [safeRounds, holeFilter]);

  // Universal Key Mapper
  const metricKeyMap: Record<string, string> = {
    'nettScore': 'NETT SCORE', 'nett_score': 'NETT SCORE',
    'gross': 'GROSS SCORE', 'gross_score': 'GROSS SCORE',
    'birdies': 'BIRDIES',
    'pars': 'PARS',
    'bogeys': 'BOGEYS',
    'doubleBogeys': 'DOUBLE BOGEYS', 'double_bogeys': 'DOUBLE BOGEYS',
    'eagles': 'EAGLES',
    'totalPutts': 'TOTAL PUTTS', 'total_putts': 'TOTAL PUTTS',
    'threePutts': 'THREE PUTTS', 'three_putts': 'THREE PUTTS',
    'fairwaysHit': 'FAIRWAYS HIT', 'fairways_hit': 'FAIRWAYS HIT', 'firHit': 'FAIRWAYS HIT',
    'gir': 'GIR', 'totalGir': 'GIR', 'total_gir': 'GIR',
    'gir8ft': 'GIR 8FT', 'gir_8ft': 'GIR 8FT',
    'gir20ft': 'GIR 20FT', 'gir_20ft': 'GIR 20FT',
    'upAndDown': 'UP AND DOWN', 'up_and_down': 'UP AND DOWN',
    'bunkerSaves': 'BUNKER SAVES', 'bunker_saves': 'BUNKER SAVES',
    'chipInside6ft': 'CHIP INSIDE 6FT', 'chip_inside_6ft': 'CHIP INSIDE 6FT',
    'doubleChips': 'DOUBLE CHIPS', 'double_chips': 'DOUBLE CHIPS',
    'totalPenalties': 'TOTAL PENALTIES', 'total_penalties': 'TOTAL PENALTIES',
  };

  const resolveMetricKey = (metric: string): string => {
    const lowerMetric = metric.toLowerCase();
    for (const [key, value] of Object.entries(metricKeyMap)) {
      if (key.toLowerCase() === lowerMetric) {
        return value;
      }
    }
    return 'NETT SCORE';
  };

  // Active dataset for trend graph
  const activeDataset = useMemo(() => {
    const mappedKey = resolveMetricKey(selectedMetric);
    let dataFromDB = (fullData[mappedKey] && Array.isArray(fullData[mappedKey])) ? fullData[mappedKey] : [];
    
    if (!dataFromDB || dataFromDB.length === 0) {
      dataFromDB = (fullData['NETT SCORE'] && Array.isArray(fullData['NETT SCORE'])) ? fullData['NETT SCORE'] : [];
    }
    
    if (!dataFromDB || dataFromDB.length === 0) {
      dataFromDB = safetyNetData;
    }

    let limit: number;
    if (activeHistory === 'LAST 5') limit = 5;
    else if (activeHistory === 'LAST 10') limit = 10;
    else if (activeHistory === 'LAST 20') limit = 20;
    else limit = dataFromDB.length;

    const finalData = dataFromDB.length > 0 
      ? dataFromDB.slice(-Math.min(limit, dataFromDB.length))
      : [];

    return finalData;
  }, [selectedMetric, activeHistory, fullData]);

  // Calculate goal value for the selected metric
  const getGoalValueForMetric = (metric: string): number => {
    const metricLower = metric.toLowerCase();
    if (metricLower === 'nettscore' || metricLower === 'nett_score') {
      return goals.score - selectedGoal;
    } else if (metricLower === 'gross' || metricLower === 'gross_score') {
      return goals.score;
    } else if (metricLower === 'birdies') {
      return goals.birdies;
    } else if (metricLower === 'pars') {
      return goals.pars;
    } else if (metricLower === 'bogeys') {
      return goals.bogeys;
    } else if (metricLower === 'doublebogeys' || metricLower === 'double_bogeys') {
      return goals.doubleBogeys;
    } else if (metricLower === 'eagles') {
      return goals.eagles;
    } else if (metricLower === 'totalputts' || metricLower === 'total_putts') {
      return goals.putts;
    } else if (metricLower === 'threeputts' || metricLower === 'three_putts') {
      return Math.max(0, goals.putts / 18 - 1);
    } else if (metricLower === 'fairwayshit' || metricLower === 'fairways_hit' || metricLower === 'firhit') {
      return goals.fir;
    } else if (metricLower === 'gir' || metricLower === 'totalgir' || metricLower === 'total_gir') {
      return goals.gir;
    } else if (metricLower === 'gir8ft' || metricLower === 'gir_8ft') {
      return goals.within8ft;
    } else if (metricLower === 'gir20ft' || metricLower === 'gir_20ft') {
      return goals.within20ft;
    } else if (metricLower === 'upanddown' || metricLower === 'up_and_down') {
      return goals.upAndDown;
    } else if (metricLower === 'bunkersaves' || metricLower === 'bunker_saves') {
      return goals.bunkerSaves;
    } else if (metricLower === 'chipinside6ft' || metricLower === 'chip_inside_6ft') {
      return goals.chipsInside6ft;
    } else if (metricLower === 'totalpenalties' || metricLower === 'total_penalties') {
      return goals.totalPenalties;
    } else if (metricLower === 'teepenalties' || metricLower === 'tee_penalties') {
      return goals.teePenalties;
    } else if (metricLower === 'approachpenalties' || metricLower === 'approach_penalties') {
      return goals.approachPenalties;
    }
    return goals.score - selectedGoal;
  };
  
  const goalValue = getGoalValueForMetric(selectedMetric);

  // Y-Axis configuration
  const yAxisConfig = useMemo(() => {
    if (!activeDataset || activeDataset.length === 0) {
      return { yMin: 0, yMax: 100, labels: [100.0, 66.7, 33.3, 0.0] };
    }

    const numericValues = activeDataset.map(d => d?.val ?? 0).filter(v => !isNaN(v) && isFinite(v));
    if (numericValues.length === 0) {
      return { yMin: 0, yMax: 100, labels: [100.0, 66.7, 33.3, 0.0] };
    }

    const dataMin = Math.min(...numericValues, goalValue);
    const dataMax = Math.max(...numericValues, goalValue);
    const range = dataMax - dataMin;

    let yMin: number, yMax: number;
    if (range === 0) {
      if (dataMin === 0) {
        yMin = 0;
        yMax = 4;
      } else {
        yMin = Math.max(0, dataMin - 1);
        yMax = dataMax + 1;
      }
    } else {
      const isLowNumberStat = dataMax < 20;
      const padding = isLowNumberStat ? Math.max(0.2, range * 0.15) : range * 0.1;
      yMin = Math.max(0, dataMin - padding);
      yMax = dataMax + padding;
    }

    const numLabels = 4;
    const step = (yMax - yMin) / (numLabels - 1);
    const labels = Array.from({ length: numLabels }, (_, i) => {
      return Number((yMin + (step * i)).toFixed(1));
    }).reverse();

    return { yMin, yMax, labels };
  }, [activeDataset, goalValue]);

  // SVG dimensions - Define ONCE
  const viewBoxWidth = 400;
  const viewBoxHeight = 380;
  const graphWidth = 340;
  const graphHeight = 240;
  const graphStartX = 40;
  const graphStartY = 20;
  const xAxisY = 280;

  // Coordinate functions - Define ONCE
  const getX = (index: number, totalPoints: number) => {
    if (totalPoints <= 1) return graphStartX + graphWidth / 2;
    return (index / (totalPoints - 1)) * graphWidth + graphStartX;
  };

  const getY = (val: number) => {
    if (yAxisConfig.yMax === yAxisConfig.yMin) {
      return graphStartY + graphHeight / 2;
    }
    const range = yAxisConfig.yMax - yAxisConfig.yMin;
    if (range === 0) {
      return graphStartY + graphHeight / 2;
    }
    const normalized = (val - yAxisConfig.yMin) / range;
    const calculatedY = graphStartY + graphHeight - (normalized * graphHeight);
    return Math.max(graphStartY, Math.min(graphStartY + graphHeight, calculatedY));
  };

  // Calculate Practice Allocation Chart values (7 categories)
  const practiceAllocationData = useMemo(() => {
    // Filter practice sessions based on selected timeframe
    const now = new Date();
    let startDate = new Date(0); // ALL
    if (skillAssessmentFilter === 'WEEK') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    } else if (skillAssessmentFilter === 'MONTH') {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    }

    const filteredPractice = personalPractice.filter((p: any) => {
      const pDate = new Date(p.created_at || p.practice_date || new Date());
      return pDate >= startDate;
    });

    const getMinutes = (category: string) => {
      return filteredPractice
        .filter((p: any) => p.type === category)
        .reduce((sum: number, p: any) => sum + (p.duration_minutes || 0), 0);
    };

    return {
      driving: getMinutes('Driving'),
      irons: getMinutes('Irons'),
      wedges: getMinutes('Wedges'),
      chipping: getMinutes('Chipping'),
      bunkers: getMinutes('Bunkers'),
      putting: getMinutes('Putting'),
      mentalStrategy: getMinutes('Mental/Strategy'),
      onCourse: getMinutes('On-Course'),
    };
  }, [personalPractice, skillAssessmentFilter]);

  const handleGenerateReport = async () => {
    if (!user) return;
    setIsGeneratingPDF(true);
    try {
      // 1. Prepare Rounds Data (latest 10 rounds)
      const sortedRounds = [...safeRounds].sort((a, b) => 
        new Date(b.date || b.created_at || 0).getTime() - new Date(a.date || a.created_at || 0).getTime()
      );
      
      const pdfRounds = sortedRounds.slice(0, 10).map((r: any, idx) => {
        const totalHoles = r.holes || 18;
        const girPercent = totalHoles > 0 ? ((r.totalGir || 0) / totalHoles) * 100 : 0;
        
        let displayDate = `Round ${idx + 1}`;
        if (r.date || r.created_at) {
          const d = new Date(r.date || r.created_at);
          displayDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }
        
        return {
          date: displayDate,
          score: r.score || 0,
          girPercent,
          putts: r.totalPutts || 0,
        };
      });

      // 2. Prepare Practice Data
      const practiceData = [
        { category: 'Driving', minutes: practiceAllocationData.driving },
        { category: 'Irons', minutes: practiceAllocationData.irons },
        { category: 'Wedges', minutes: practiceAllocationData.wedges },
        { category: 'Chipping', minutes: practiceAllocationData.chipping },
        { category: 'Bunkers', minutes: practiceAllocationData.bunkers },
        { category: 'Putting', minutes: practiceAllocationData.putting },
        { category: 'Mental/Strategy', minutes: practiceAllocationData.mentalStrategy },
        { category: 'On-Course', minutes: practiceAllocationData.onCourse },
      ];

      // 3. Prepare Trends
      const trends = [];
      if (sortedRounds.length >= 5) {
        const last5 = sortedRounds.slice(0, 5);
        const prev5 = sortedRounds.slice(5, 10);
        
        if (prev5.length > 0) {
          // GIR Trend
          const last5GIR = last5.reduce((sum, r) => sum + (r.totalGir || 0) / (r.holes || 18), 0) / last5.length * 100;
          const prev5GIR = prev5.reduce((sum, r) => sum + (r.totalGir || 0) / (r.holes || 18), 0) / prev5.length * 100;
          const girDiff = last5GIR - prev5GIR;
          if (Math.abs(girDiff) >= 1) {
            trends.push({ text: `GIR has ${girDiff > 0 ? 'increased' : 'decreased'} by ${Math.abs(girDiff).toFixed(1)}% over the last 5 rounds compared to the previous ${prev5.length}.` });
          }

          // Putts Trend
          const last5Putts = last5.reduce((sum, r) => sum + (r.totalPutts || 0), 0) / last5.length;
          const prev5Putts = prev5.reduce((sum, r) => sum + (r.totalPutts || 0), 0) / prev5.length;
          const puttsDiff = last5Putts - prev5Putts;
          if (Math.abs(puttsDiff) >= 0.5) {
            trends.push({ text: `Putting average has ${puttsDiff < 0 ? 'improved' : 'worsened'} by ${Math.abs(puttsDiff).toFixed(1)} putts over the last 5 rounds.` });
          }
        }
      }
      
      if (trends.length === 0) {
        trends.push({ text: 'Not enough comparable round data to generate trends.' });
      }

      // 4. Generate PDF
      const { pdf } = await import('@react-pdf/renderer');
      const { StudentReportPDF } = await import('@/components/StudentReportPDF');
      
      const studentName = user.fullName || user.email.split('@')[0];
      const blob = await pdf(
        <StudentReportPDF 
          studentName={studentName}
          rounds={pdfRounds}
          practiceData={practiceData}
          trends={trends}
        />
      ).toBlob();

      // 5. Trigger Download
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${studentName.replace(/\s+/g, '_')}_Golf_Report.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate report. Please try again.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // ============================================
  // NOW WE CAN DO CONDITIONAL RETURNS
  // ============================================
  
  // Show loading state (with emergency timeout bypass)
  if ((authLoading || statsLoading) && !forceLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#014421] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="max-w-md mx-auto bg-white min-h-screen">
        <div className="pt-6 pb-4 px-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Game Overview</h1>
              <p className="text-gray-600 text-sm mt-1">Track your performance metrics</p>
              {/* Handicap Display: Show initial_handicap from database */}
              {user?.initialHandicap !== undefined && (
                <p className="text-sm font-semibold mt-1" style={{ color: '#014421' }}>
                  Handicap: {(user.initialHandicap >= 0 ? user.initialHandicap.toFixed(1) : `+${Math.abs(user.initialHandicap).toFixed(1)}`)} {user.initialHandicap <= 0 ? 'Pro' : 'HCP'}
                </p>
              )}
            </div>
            {/* Generate Report Button */}
            <button
              onClick={handleGenerateReport}
              disabled={isGeneratingPDF}
              className={`px-4 py-2 rounded-lg border-2 border-white text-white text-sm font-semibold transition-all ${
                isGeneratingPDF ? 'opacity-70 cursor-not-allowed' : 'hover:bg-white/10'
              }`}
              style={{ backgroundColor: '#05412B' }}
            >
              {isGeneratingPDF ? 'Generating...' : 'Generate Report'}
            </button>
          </div>
          
          {/* Stat Slider */}
          <div className="mt-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-xs font-medium text-gray-600 mb-2">Target Goal</div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="-5"
                max="54"
                step="0.1"
                value={selectedGoal}
                onChange={handleGoalChange}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #014421 0%, #014421 ${((selectedGoal + 5) / 59) * 100}%, #E5E7EB ${((selectedGoal + 5) / 59) * 100}%, #E5E7EB 100%)`
                }}
              />
              <div className="text-sm font-semibold text-gray-900 w-full text-right">
                {(selectedGoal ?? 0) >= 0 ? `${(selectedGoal ?? 0).toFixed(1)}` : `+${Math.abs(selectedGoal ?? 0).toFixed(1)}`} {(selectedGoal ?? 0) <= 0 ? 'Pro' : 'HCP'}
              </div>
            </div>
            <div className="text-xs text-gray-600 mt-2">
              GIR: {goals.gir}% | FIR: {goals.fir}% | Up & Down: {goals.upAndDown}% | Putts: {goals.putts} | Bunker: {goals.bunkerSaves}%
            </div>
          </div>
        </div>

        {/* TREND ANALYSIS */}
        <div className="px-3 mb-6">
          <div className="bg-[#05412B] rounded-[40px] p-6 text-white shadow-2xl">
            <h2 className="text-center font-bold text-lg mb-6 uppercase tracking-wider italic" style={{ color: '#FFFFFF', textDecoration: 'underline', textDecorationColor: '#FF9800', textDecorationThickness: '2px', textUnderlineOffset: '8px' }}>
              TREND ANALYSIS
            </h2>
            
            {/* Controls */}
            <div className="bg-white/5 rounded-3xl p-5 mb-6 border border-white/10 space-y-4">
              {/* Metric Selection */}
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-white/50 uppercase">Metric:</span>
                <select 
                  value={selectedMetric} 
                  onChange={(e) => setSelectedMetric(e.target.value as typeof selectedMetric)} 
                  className="bg-white text-[#05412B] text-xs font-bold py-2 px-3 rounded-xl outline-none max-h-48 overflow-y-auto"
                  style={{ maxHeight: '200px' }}
                >
                  <option value="nettScore">NETT SCORE</option>
                  <option value="gross">GROSS SCORE</option>
                  <option value="birdies">BIRDIES</option>
                  <option value="pars">PARS</option>
                  <option value="bogeys">BOGEYS</option>
                  <option value="doubleBogeys">DOUBLE BOGEYS</option>
                  <option value="eagles">EAGLES</option>
                  <option value="totalPutts">TOTAL PUTTS</option>
                  <option value="threePutts">THREE PUTTS</option>
                  <option value="fairwaysHit">FAIRWAYS HIT</option>
                  <option value="gir">GIR</option>
                  <option value="gir8ft">GIR 8FT</option>
                  <option value="gir20ft">GIR 20FT</option>
                  <option value="upAndDown">UP & DOWN</option>
                  <option value="bunkerSaves">BUNKER SAVES</option>
                  <option value="chipInside6ft">CHIP INSIDE 6FT</option>
                  <option value="doubleChips">DOUBLE CHIPS</option>
                  <option value="totalPenalties">TOTAL PENALTIES</option>
                </select>
              </div>

              {/* Hole Filter */}
              <div className="flex justify-between items-center border-t border-white/10 pt-4">
                <span className="text-[10px] font-bold text-white/50 uppercase tracking-tight">Filter:</span>
                <div className="flex gap-1">
                  <button 
                    onClick={() => setHoleFilter('9')} 
                    className={`px-3 py-1.5 rounded-xl text-[9px] font-bold uppercase transition-all ${
                      holeFilter === '9' 
                        ? 'bg-white text-[#05412B] border-2 border-white' 
                        : 'bg-white/10 text-white/40'
                    }`}
                  >
                    9 HOLES
                  </button>
                  <button 
                    onClick={() => setHoleFilter('18')} 
                    className={`px-3 py-1.5 rounded-xl text-[9px] font-bold uppercase transition-all ${
                      holeFilter === '18' 
                        ? 'bg-white text-[#05412B] border-2 border-white' 
                        : 'bg-white/10 text-white/40'
                    }`}
                  >
                    18 HOLES
                  </button>
                </div>
              </div>

              {/* History Filter */}
              <div className="flex justify-between items-center border-t border-white/10 pt-4">
                <span className="text-[10px] font-bold text-white/50 uppercase tracking-tight">History:</span>
                <div className="flex gap-1">
                  {(['LAST 5', 'LAST 10', 'LAST 20', 'ALL'] as const).map(h => (
                    <button 
                      key={h} 
                      onClick={() => setActiveHistory(h)} 
                      className={`px-2 py-1.5 rounded-xl text-[9px] font-bold uppercase transition-all ${
                        activeHistory === h 
                          ? 'bg-white text-[#05412B] border-2 border-white' 
                          : 'bg-white/10 text-white/40'
                      }`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* SVG Graph */}
            <div className="relative w-full bg-[#05412B] rounded-[32px] p-4 border border-white/5" style={{ height: '350px', overflow: 'visible', minHeight: '350px' }}>
              <div className="overflow-x-auto scrollbar-hide" style={{ height: '100%', overflow: 'visible', minHeight: '350px' }}>
                <svg 
                  key={`${selectedMetric}-${activeHistory}-${yAxisConfig.yMin}-${yAxisConfig.yMax}-${selectedGoal}`}
                  viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`} 
                  preserveAspectRatio="xMidYMid meet"
                  className="w-full h-full"
                  style={{ display: 'block', overflow: 'visible' }}
                >
                  <defs>
                    <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#FF9800" stopOpacity="0.15" />
                      <stop offset="100%" stopColor="#FF9800" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  
                  {/* Grid lines */}
                  {yAxisConfig.labels.map((label: number, idx: number) => {
                    const totalLabels = yAxisConfig.labels.length;
                    const yPos = totalLabels > 1 
                      ? graphStartY + (idx / (totalLabels - 1)) * graphHeight
                      : graphStartY + graphHeight / 2;
                    return (
                      <line
                        key={`grid-${idx}`}
                        x1={graphStartX}
                        y1={yPos}
                        x2={graphStartX + graphWidth}
                        y2={yPos}
                        stroke="#FFFFFF"
                        strokeWidth="1"
                        strokeOpacity="0.1"
                        strokeDasharray="4 4"
                      />
                    );
                  })}
                  
                  {/* Y-Axis Numbers */}
                  {yAxisConfig.labels.map((label: number, idx: number) => {
                    const totalLabels = yAxisConfig.labels.length;
                    const yPos = totalLabels > 1 
                      ? graphStartY + (idx / (totalLabels - 1)) * graphHeight
                      : graphStartY + graphHeight / 2;
                    
                    // Find the closest label to the goal value
                    const distances = yAxisConfig.labels.map(l => Math.abs(l - goalValue));
                    const minDistance = Math.min(...distances);
                    const isClosest = isAdjustingGoal && Math.abs(label - goalValue) === minDistance;
                    
                    return (
                      <text
                        key={`y-label-${idx}`}
                        x={35}
                        y={yPos}
                        textAnchor="end"
                        fill={isClosest ? "#FF9800" : "#FFFFFF"}
                        fontWeight="bold"
                        opacity={isClosest ? "1" : "0.7"}
                        fontSize={isClosest ? "12" : "10"}
                        dominantBaseline="middle"
                        className="transition-all duration-300"
                      >
                        {label.toFixed(1)}
                      </text>
                    );
                  })}
                  
                  {/* Y-axis line */}
                  <line 
                    x1={graphStartX} 
                    y1={graphStartY} 
                    x2={graphStartX} 
                    y2={graphStartY + graphHeight} 
                    stroke="#FFFFFF" 
                    strokeWidth="1" 
                  />
                  
                  {/* X-axis line */}
                  <line 
                    x1={graphStartX} 
                    y1={xAxisY} 
                    x2={graphStartX + graphWidth} 
                    y2={xAxisY} 
                    stroke="#FFFFFF" 
                    strokeWidth="1" 
                  />
                  
                  {/* Goal Trend Line - Dashed Orange Line synced with slider */}
                  {(() => {
                    const goalY = getY(goalValue);
                    return (
                      <g className="transition-all duration-300">
                        <line
                          x1={graphStartX}
                          y1={goalY}
                          x2={graphStartX + graphWidth}
                          y2={goalY}
                          stroke="#FF9800"
                          strokeWidth="2"
                          strokeDasharray="5,5"
                          opacity={isAdjustingGoal ? "1" : "0.7"}
                        />
                        <rect
                          x={graphStartX + graphWidth - 65}
                          y={goalY - 10}
                          width="65"
                          height="20"
                          rx="4"
                          fill="#FF9800"
                          opacity={isAdjustingGoal ? "1" : "0.9"}
                        />
                        <text
                          x={graphStartX + graphWidth - 5}
                          y={goalY + 4}
                          textAnchor="end"
                          fill="#FFFFFF"
                          fontWeight="bold"
                          fontSize="10"
                        >
                          GOAL: {goalValue.toFixed(1)}
                        </text>
                      </g>
                    );
                  })()}
                  
                  {/* Area fill */}
                  {activeDataset && activeDataset.length > 0 && (
                    <path
                      fill="url(#areaGradient)"
                      d={`M ${activeDataset.map((d, i) => {
                        const x = getX(i, activeDataset.length);
                        const y = getY(d?.val ?? 0);
                        return `${x},${y}`;
                      }).join(' L ')} L ${getX(activeDataset.length - 1, activeDataset.length)},${xAxisY} L ${getX(0, activeDataset.length)},${xAxisY} Z`}
                    />
                  )}
                  
                  {/* Trend Line - Orange #FF9800, stroke width 5 */}
                  {activeDataset && activeDataset.length > 0 && (
                    <polyline
                      fill="none"
                      stroke="#FF9800"
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={activeDataset.map((d, i) => {
                        const x = getX(i, activeDataset.length);
                        const y = getY(d?.val ?? 0);
                        return `${x},${y}`;
                      }).join(' ')}
                    />
                  )}
                  
                  {/* Nodes - Hollow white circles, radius 6, rendered last */}
                  {activeDataset && activeDataset.length > 0 && activeDataset.map((d, i) => {
                    const nodeX = getX(i, activeDataset.length);
                    const nodeY = getY(d?.val ?? 0);
                    const isHovered = hoveredIndex === i;
                    return (
                      <g key={`node-${i}`}>
                        {/* Invisible larger hitbox for easier hovering */}
                        <circle
                          cx={nodeX}
                          cy={nodeY}
                          r={24}
                          fill="transparent"
                          onMouseEnter={() => setHoveredIndex(i)}
                          onMouseLeave={() => setHoveredIndex(null)}
                          style={{ cursor: 'pointer' }}
                        />
                        {/* Visible node */}
                        <circle
                          cx={nodeX}
                          cy={nodeY}
                          r={isHovered ? 8 : 6}
                          fill={isHovered ? "#FF9800" : "#014421"}
                          stroke="#FFFFFF"
                          strokeWidth="2"
                          style={{ pointerEvents: 'none' }}
                        />
                        
                        {isHovered && (
                          <g transform={`translate(${nodeX - 55}, ${nodeY - 55})`} style={{ pointerEvents: 'none' }}>
                            <rect width="110" height="50" rx="10" fill="white" stroke="#05412B" strokeWidth="2" />
                            <text x="55" y="18" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#0F172A" opacity="1">{d?.date || ''}</text>
                            <text x="55" y="38" textAnchor="middle" fontSize="16" fontWeight="bold" fill="#0F172A" opacity="1">{(d?.val ?? 0).toFixed(1)}</text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                  
                  {/* Round labels */}
                  {activeDataset && activeDataset.length > 0 && activeDataset.map((d, i) => {
                    const nodeX = getX(i, activeDataset.length);
                    return (
                      <text
                        key={`x-label-${i}`}
                        x={nodeX}
                        y={290}
                        textAnchor="end"
                        fill="#FFFFFF"
                        fontWeight="bold"
                        opacity="1"
                        fontSize="10"
                        dominantBaseline="hanging"
                        className="fill-white text-[10px]"
                        transform={`rotate(-45 ${nodeX} 290)`}
                        style={{ pointerEvents: 'none' }}
                      >
                        Round {i + 1}
                      </text>
                    );
                  })}
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Performance Tiles - High-Fidelity White/Orange Style */}
        <div className="px-4 mb-6">
          <div className="space-y-3">
            {/* DRIVING Section */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-xs font-bold text-black uppercase tracking-wide mb-3">DRIVING</div>
              
              {/* Top Level FIR % */}
              <StatDisplay 
                label="FIR %"
                current={performanceMetrics.firPercent}
                goal={goals.fir}
                isPercentage={true}
                isAdjustingGoal={isAdjustingGoal}
              />
              
              <div className="space-y-3 pt-3 border-t border-gray-100">
                {/* FIR % Progress Bar */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-gray-700">Fairways Hit (FIR %)</span>
                    <span className="text-xs font-bold" style={{ color: '#FF9800' }}>{performanceMetrics.firPercent.toFixed(1)}%</span>
                  </div>
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all"
                      style={{ 
                        width: `${Math.min(100, performanceMetrics.firPercent)}%`,
                        backgroundColor: '#FF9800'
                      }}
                    />
                  </div>
                </div>

                {/* Left Miss % Progress Bar */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-gray-700">Left Miss %</span>
                    <span className="text-xs font-bold" style={{ color: '#FF9800' }}>{performanceMetrics.missedLeft.toFixed(1)}%</span>
                  </div>
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all"
                      style={{ 
                        width: `${Math.min(100, performanceMetrics.missedLeft)}%`,
                        backgroundColor: '#FF9800'
                      }}
                    />
                  </div>
                </div>

                {/* Right Miss % Progress Bar */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-gray-700">Right Miss %</span>
                    <span className="text-xs font-bold" style={{ color: '#FF9800' }}>{performanceMetrics.missedRight.toFixed(1)}%</span>
                  </div>
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all"
                      style={{ 
                        width: `${Math.min(100, performanceMetrics.missedRight)}%`,
                        backgroundColor: '#FF9800'
                      }}
                    />
                  </div>
                </div>

                {/* Shot Breakdown */}
                <div className="border-t border-gray-200 pt-3 mt-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-gray-900">Total Shots</span>
                    <span className="text-sm font-bold text-gray-900">{performanceMetrics.totalFirShots}</span>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-sm font-bold text-gray-900">Hit</span>
                    <span className="text-sm font-bold text-gray-900">{performanceMetrics.firHit}</span>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-sm font-bold text-gray-900">Missed</span>
                    <span className="text-sm font-bold text-gray-900">{performanceMetrics.firMissed}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* APPROACH Section */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-xs font-bold text-black uppercase tracking-wide mb-3">APPROACH</div>
              <div className="space-y-0">
                <StatDisplay 
                  label="GIR %"
                  current={performanceMetrics.girPercent}
                  goal={goals.gir}
                  isPercentage={true}
                  isAdjustingGoal={isAdjustingGoal}
                />
                <div className="border-t border-gray-200"></div>
                <StatDisplay 
                  label="GIR 8ft"
                  tooltip="Approximately 2.4 metres"
                  current={performanceMetrics.gir8ft}
                  goal={goals.within8ft}
                  isPercentage={true}
                  isAdjustingGoal={isAdjustingGoal}
                />
                <div className="border-t border-gray-200"></div>
                <StatDisplay 
                  label="GIR 20ft"
                  tooltip="Approximately 6.1 metres"
                  current={performanceMetrics.gir20ft}
                  goal={goals.within20ft}
                  isPercentage={true}
                  isAdjustingGoal={isAdjustingGoal}
                />
              </div>
            </div>

            {/* SHORT GAME Section */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-xs font-bold text-black uppercase tracking-wide mb-3">SHORT GAME</div>
              <div className="space-y-0">
                <StatDisplay 
                  label="Up & Down %"
                  current={performanceMetrics.upAndDownPercent}
                  goal={goals.upAndDown}
                  isPercentage={true}
                  isAdjustingGoal={isAdjustingGoal}
                />
                <div className="border-t border-gray-200"></div>
                <StatDisplay 
                  label="Bunker Saves"
                  current={performanceMetrics.bunkerSaves}
                  goal={goals.bunkerSaves}
                  isPercentage={true}
                  isAdjustingGoal={isAdjustingGoal}
                />
                <div className="border-t border-gray-200"></div>
                <StatDisplay 
                  label="Scrambling % (< 6ft)"
                  tooltip="Approximately 1.8 metres. Chip shots ending inside 6ft."
                  current={performanceMetrics.chipInside6ft}
                  goal={goals.chipsInside6ft}
                  isPercentage={true}
                  isAdjustingGoal={isAdjustingGoal}
                />
              </div>
            </div>

            {/* PUTTING PRECISION Section */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-xs font-bold text-black uppercase tracking-wide mb-3">PUTTING PRECISION</div>
              <div className="space-y-0">
                <StatDisplay 
                  label="Total Putts"
                  current={performanceMetrics.avgPutts}
                  goal={goals.putts}
                  inverse={true}
                  isAdjustingGoal={isAdjustingGoal}
                />
                <div className="border-t border-gray-200"></div>
                <StatDisplay 
                  label="< 6ft Make %"
                  tooltip="Approximately 1.8 metres"
                  current={performanceMetrics.puttsUnder6ftMake}
                  goal={goals.puttMake6ft}
                  isPercentage={true}
                  isAdjustingGoal={isAdjustingGoal}
                />
                <div className="border-t border-gray-200"></div>
                <StatDisplay 
                  label="3-Putts (Avg)"
                  current={performanceMetrics.avgThreePutts}
                  goal={Math.max(0, goals.putts / 18 - 1)}
                  inverse={true}
                  isAdjustingGoal={isAdjustingGoal}
                />
              </div>
            </div>

            {/* PENALTIES Section */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-xs font-bold text-black uppercase tracking-wide mb-3">PENALTIES</div>
              <div className="space-y-0">
                <StatDisplay 
                  label="Tee Penalties"
                  current={performanceMetrics.teePenalties}
                  goal={goals.teePenalties}
                  inverse={true}
                  isAdjustingGoal={isAdjustingGoal}
                />
                <div className="border-t border-gray-200"></div>
                <StatDisplay 
                  label="Approach Penalties"
                  current={performanceMetrics.approachPenalties}
                  goal={goals.approachPenalties}
                  inverse={true}
                  isAdjustingGoal={isAdjustingGoal}
                />
                <div className="border-t border-gray-200"></div>
                <StatDisplay 
                  label="Total Penalties"
                  current={performanceMetrics.totalPenalties}
                  goal={goals.totalPenalties}
                  inverse={true}
                  isAdjustingGoal={isAdjustingGoal}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Practice Allocation Chart - At the bottom */}
        <div className="px-4 mb-6">
          <div className="bg-[#05412B] rounded-2xl p-6 border border-white/10 relative">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg uppercase tracking-wider italic text-white" style={{ textDecoration: 'underline', textDecorationColor: '#FF9800', textDecorationThickness: '2px', textUnderlineOffset: '8px' }}>
                PRACTICE ALLOCATION
              </h2>
              {/* Time Filter */}
              <div className="flex gap-1">
                {(['WEEK', 'MONTH', 'ALL'] as const).map(filter => (
                  <button 
                    key={filter} 
                    onClick={() => setSkillAssessmentFilter(filter)} 
                    className={`px-3 py-1 rounded-lg text-xs font-bold uppercase transition-all ${
                      skillAssessmentFilter === filter 
                        ? 'bg-white text-[#05412B] border-2 border-white' 
                        : 'bg-white/10 text-white/60 border border-white/20'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-center items-center relative mt-4 px-4 py-8">
              <svg 
                width="100%" 
                height="100%" 
                viewBox="0 0 500 500" 
                className="mx-auto overflow-visible max-w-[500px]"
                onMouseLeave={() => setHoveredCategory(null)}
              >
                <defs>
                  <linearGradient id="practiceGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#FF9800" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#FF9800" stopOpacity="0.1" />
                  </linearGradient>
                </defs>
                
                {/* Grid polygons (Octagons) */}
                {[42, 84, 126, 168, 210].map((radius, idx) => {
                  const points = [0, 1, 2, 3, 4, 5, 6, 7].map(i => {
                    // Start from Driving at top, rotate clockwise
                    const angle = (i * (360/8) - 90) * (Math.PI / 180);
                    const x = 250 + radius * Math.cos(angle);
                    const y = 250 + radius * Math.sin(angle);
                    return `${x},${y}`;
                  }).join(' ');
                  return (
                    <polygon
                      key={`grid-${idx}`}
                      points={points}
                      fill="none"
                      stroke="white"
                      strokeWidth="1"
                      strokeOpacity="0.2"
                    />
                  );
                })}
                
                {/* Grid lines (8 axes for 8 categories) */}
                {[0, 1, 2, 3, 4, 5, 6, 7].map((idx) => {
                  const angle = (idx * (360/8) - 90) * (Math.PI / 180);
                  const x = 250 + 210 * Math.cos(angle);
                  const y = 250 + 210 * Math.sin(angle);
                  return (
                    <line
                      key={`axis-${idx}`}
                      x1="250"
                      y1="250"
                      x2={x}
                      y2={y}
                      stroke="white"
                      strokeWidth="1"
                      strokeOpacity="0.2"
                    />
                  );
                })}
                
                {/* Practice Allocation Area */}
                {(() => {
                  const categories = ['Driving', 'Irons', 'Wedges', 'Chipping', 'Bunkers', 'Putting', 'Mental/Strategy', 'On-Course'];
                  const values = [
                    practiceAllocationData.driving,
                    practiceAllocationData.irons,
                    practiceAllocationData.wedges,
                    practiceAllocationData.chipping,
                    practiceAllocationData.bunkers,
                    practiceAllocationData.putting,
                    practiceAllocationData.mentalStrategy,
                    practiceAllocationData.onCourse,
                  ];
                  
                  // Consistent maxDomain (like 120 minutes) across all axes so the data forms a clear 'web' shape.
                  const maxDataValue = Math.max(120, ...values);
                  
                  const dPath = values.map((value, idx) => {
                    const angle = (idx * (360/8) - 90) * (Math.PI / 180);
                    // If a student has 0 minutes in a category, ensure the orange line pulls all the way to the center point (radius = 0).
                    const radius = (value / maxDataValue) * 210;
                    const x = 250 + radius * Math.cos(angle);
                    const y = 250 + radius * Math.sin(angle);
                    return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
                  }).join(' ') + ' Z'; // Z ensures the path explicitly loops back to close the shape
                  
                  return (
                    <>
                      <path
                        d={dPath}
                        fill="rgba(255, 152, 0, 0.4)"
                        stroke="#FF9800"
                        strokeWidth="2"
                        strokeLinejoin="round"
                      />
                      {/* Interactive category segments with hover */}
                      {categories.map((category, idx) => {
                        const angle = (idx * (360/8) - 90) * (Math.PI / 180);
                        const value = values[idx];
                        const radius = (value / maxDataValue) * 210;
                        const labelX = 250 + 235 * Math.cos(angle); // Pushed further out
                        const labelY = 250 + 235 * Math.sin(angle); // Pushed further out
                        
                        // Text alignment based on horizontal position
                        let textAnchor: "start" | "middle" | "end" = "middle";
                        if (Math.cos(angle) > 0.1) textAnchor = "start"; // Right side
                        else if (Math.cos(angle) < -0.1) textAnchor = "end"; // Left side
                        
                        // Create hover area (triangle from center to point)
                        const prevAngle = ((idx - 1 + 8) % 8 * (360/8) - 90) * (Math.PI / 180);
                        const nextAngle = ((idx + 1) % 8 * (360/8) - 90) * (Math.PI / 180);
                        const midPrevAngle = (angle + prevAngle) / 2;
                        const midNextAngle = (angle + nextAngle) / 2;
                        const hoverRadius = 210;
                        
                        const hoverPoints = [
                          '250,250',
                          `${250 + hoverRadius * Math.cos(midPrevAngle)},${250 + hoverRadius * Math.sin(midPrevAngle)}`,
                          `${250 + radius * Math.cos(angle)},${250 + radius * Math.sin(angle)}`,
                          `${250 + hoverRadius * Math.cos(midNextAngle)},${250 + hoverRadius * Math.sin(midNextAngle)}`,
                        ].join(' ');
                        
                        const isHovered = hoveredCategory === category;
                        
                        return (
                          <g key={`category-${idx}`}>
                            {/* Invisible hover area */}
                            <polygon
                              points={hoverPoints}
                              fill="transparent"
                              onMouseEnter={(e) => {
                                setHoveredCategory(category);
                                const svgElement = e.currentTarget.closest('svg');
                                const rect = svgElement?.getBoundingClientRect();
                                const svgRect = svgElement?.viewBox?.baseVal || { width: 500, height: 500 };
                                if (rect && svgElement) {
                                  const scaleX = rect.width / svgRect.width;
                                  const scaleY = rect.height / svgRect.height;
                                  setTooltipPosition({
                                    x: rect.left + labelX * scaleX,
                                    y: rect.top + labelY * scaleY,
                                  });
                                }
                              }}
                              style={{ cursor: 'pointer' }}
                            />
                            {/* Category labels */}
                            {category === 'Mental/Strategy' ? (
                              <text
                                x={labelX}
                                y={labelY}
                                textAnchor={textAnchor}
                                dominantBaseline="middle"
                                fill="white"
                                fontSize="13"
                                fontWeight="bold"
                                opacity={isHovered ? 1 : 0.8}
                              >
                                <tspan x={labelX} dy="-0.6em">Mental</tspan>
                                <tspan x={labelX} dy="1.2em">Strategy</tspan>
                              </text>
                            ) : (
                              <text
                                x={labelX}
                                y={labelY}
                                textAnchor={textAnchor}
                                dominantBaseline="middle"
                                fill="white"
                                fontSize="13"
                                fontWeight="bold"
                                opacity={isHovered ? 1 : 0.8}
                              >
                                {category}
                              </text>
                            )}
                            {/* Value indicator on hover */}
                            {isHovered && (
                              <circle
                                cx={250 + radius * Math.cos(angle)}
                                cy={250 + radius * Math.sin(angle)}
                                r="6"
                                fill="#FF9800"
                                stroke="white"
                                strokeWidth="2"
                              />
                            )}
                          </g>
                        );
                      })}
                    </>
                  );
                })()}
              </svg>
              
              {/* Hover Tooltip */}
              {hoveredCategory && (() => {
                const categoryIndex = ['Driving', 'Irons', 'Wedges', 'Chipping', 'Bunkers', 'Putting', 'Mental/Strategy', 'On-Course'].indexOf(hoveredCategory);
                const currentValue = [
                  practiceAllocationData.driving,
                  practiceAllocationData.irons,
                  practiceAllocationData.wedges,
                  practiceAllocationData.chipping,
                  practiceAllocationData.bunkers,
                  practiceAllocationData.putting,
                  practiceAllocationData.mentalStrategy,
                  practiceAllocationData.onCourse,
                ][categoryIndex];
                
                return (
                  <div 
                    className="fixed bg-white rounded-lg shadow-xl p-3 z-50 border-2 border-[#FF9800] pointer-events-none"
                    style={{
                      left: `${tooltipPosition.x}px`,
                      top: `${tooltipPosition.y - 100}px`,
                      transform: 'translateX(-50%)',
                      minWidth: '160px',
                    }}
                  >
                    <div className="text-xs font-bold text-gray-900 mb-2">{hoveredCategory}</div>
                    <div className="text-xs text-gray-700">
                      <span className="font-semibold">Practice Logged:</span> {currentValue} mins
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Numeric Breakdown Section */}
          <div className="bg-white rounded-2xl p-4 mt-4 shadow-sm">
            <div className="text-xs font-bold text-black uppercase tracking-wide mb-3">PRACTICE BREAKDOWN</div>
            <div className="space-y-0">
              {(() => {
                const categories = ['Driving', 'Irons', 'Wedges', 'Chipping', 'Bunkers', 'Putting', 'Mental/Strategy', 'On-Course'];
                const values = [
                  practiceAllocationData.driving,
                  practiceAllocationData.irons,
                  practiceAllocationData.wedges,
                  practiceAllocationData.chipping,
                  practiceAllocationData.bunkers,
                  practiceAllocationData.putting,
                  practiceAllocationData.mentalStrategy,
                  practiceAllocationData.onCourse,
                ];
                const totalMins = values.reduce((sum, val) => sum + val, 0);
                
                return categories.map((category, idx) => {
                  const mins = values[idx];
                  const percentage = totalMins > 0 ? Math.round((mins / totalMins) * 100) : 0;
                  
                  return (
                    <div key={category}>
                      <div className="flex items-center justify-between py-2">
                        <div className="text-sm text-gray-700">{category}</div>
                        <div className="flex items-center gap-3">
                          <div className="text-xl font-bold" style={{ color: '#FF9800' }}>
                            {mins} <span className="text-xs text-gray-500 font-normal">mins</span>
                          </div>
                          <div className="text-sm font-semibold text-gray-400 w-12 text-right">
                            {percentage}%
                          </div>
                        </div>
                      </div>
                      {idx < categories.length - 1 && <div className="border-t border-gray-200"></div>}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
