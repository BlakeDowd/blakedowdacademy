"use client";

import { useEffect, useState, useMemo } from "react";
import { useStats } from "@/contexts/StatsContext";
import { useAuth } from "@/contexts/AuthContext";

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
    doubleBogeys: Math.round(doubleBogeys * 10) / 10
  };
};

export default function StatsPage() {
  // ============================================
  // ALL HOOKS MUST BE AT THE TOP - NO EXCEPTIONS
  // ============================================
  
  // Context hooks
  const { rounds, loading: statsLoading, refreshRounds } = useStats();
  const { user, loading: authLoading } = useAuth();
  
  // Ensure rounds is always an array
  const safeRounds = rounds || [];
  
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

    // APPROACH: GIR from distances
    const totalGir8ft = safeRounds.reduce((sum, r) => sum + (r.gir8ft || 0), 0);
    const totalGir20ft = safeRounds.reduce((sum, r) => sum + (r.gir20ft || 0), 0);
    const gir8ft = safeRounds.length > 0 ? totalGir8ft / safeRounds.length : 0;
    const gir20ft = safeRounds.length > 0 ? totalGir20ft / safeRounds.length : 0;

    // SHORT GAME: Up & Down percentage
    const totalUpDownAttempts = safeRounds.reduce((sum, r) => sum + (r.upAndDownConversions || 0) + (r.missed || 0), 0);
    const upDownSuccess = safeRounds.reduce((sum, r) => sum + (r.upAndDownConversions || 0), 0);
    const upAndDownPercent = totalUpDownAttempts > 0 ? (upDownSuccess / totalUpDownAttempts) * 100 : 0;

    // SHORT GAME: Bunker Saves percentage
    const totalBunkerAttempts = safeRounds.reduce((sum, r) => sum + (r.bunkerAttempts || 0) + (r.bunkerSaves || 0), 0);
    const bunkerSavesCount = safeRounds.reduce((sum, r) => sum + (r.bunkerSaves || 0), 0);
    const bunkerSaves = totalBunkerAttempts > 0 ? (bunkerSavesCount / totalBunkerAttempts) * 100 : 0;

    // SHORT GAME: Chip Inside 6ft (average per round)
    const totalChipInside6ft = safeRounds.reduce((sum, r) => sum + (r.chipInside6ft || 0), 0);
    const chipInside6ft = safeRounds.length > 0 ? totalChipInside6ft / safeRounds.length : 0;

    // PUTTING: Average Putts per round
    const totalPutts = safeRounds.reduce((sum, r) => sum + (r.totalPutts || 0), 0);
    const avgPutts = safeRounds.length > 0 ? totalPutts / safeRounds.length : 0;

    // PUTTING: < 6ft Make percentage
    const totalPuttsUnder6ft = safeRounds.reduce((sum, r) => sum + (r.puttsUnder6ftAttempts || 0), 0);
    const puttsMadeUnder6ft = safeRounds.reduce((sum, r) => sum + ((r.puttsUnder6ftAttempts || 0) - (r.missed6ftAndIn || 0)), 0);
    const puttsUnder6ftMake = totalPuttsUnder6ft > 0 ? (puttsMadeUnder6ft / totalPuttsUnder6ft) * 100 : 0;

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
        'MISSED 6FT AND IN': safetyNetData.map(d => ({ ...d, val: 2 })),
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
      'MISSED 6FT AND IN': [],
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
      data['MISSED 6FT AND IN'].push({ val: round.missed6ftAndIn || 0, date: roundDate });
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

  // Y-Axis configuration
  const yAxisConfig = useMemo(() => {
    if (!activeDataset || activeDataset.length === 0) {
      return { yMin: 0, yMax: 100, labels: [100.0, 66.7, 33.3, 0.0] };
    }

    const numericValues = activeDataset.map(d => d?.val ?? 0).filter(v => !isNaN(v) && isFinite(v));
    if (numericValues.length === 0) {
      return { yMin: 0, yMax: 100, labels: [100.0, 66.7, 33.3, 0.0] };
    }

    const dataMin = Math.min(...numericValues);
    const dataMax = Math.max(...numericValues);
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
  }, [activeDataset]);

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
    }
    return goals.score - selectedGoal;
  };
  
  const goalValue = getGoalValueForMetric(selectedMetric);

  // Calculate Practice Allocation Chart values (6 categories)
  const practiceAllocationData = useMemo(() => {
    if (safeRounds.length === 0) {
      return {
        driving: 50,
        approach: 50,
        mental: 50,
        wedges: 50,
        putting: 50,
        shortGame: 50,
      };
    }

    // Driving: FIR percentage
    const totalFir = safeRounds.reduce((sum, r) => sum + (r.firHit || 0) + (r.firLeft || 0) + (r.firRight || 0), 0);
    const firHit = safeRounds.reduce((sum, r) => sum + (r.firHit || 0), 0);
    const driving = totalFir > 0 ? (firHit / totalFir) * 100 : 50;

    // Approach: GIR percentage
    const totalGir = safeRounds.reduce((sum, r) => sum + (r.totalGir || 0), 0);
    const totalHoles = safeRounds.reduce((sum, r) => sum + (r.holes || 18), 0);
    const approach = totalHoles > 0 ? (totalGir / totalHoles) * 100 : 50;

    // Mental: Based on penalties (inverse - fewer penalties = higher score)
    const totalPenalties = safeRounds.reduce((sum, r) => sum + (r.totalPenalties || 0), 0);
    const avgPenalties = safeRounds.length > 0 ? totalPenalties / safeRounds.length : 2;
    const mental = Math.max(0, Math.min(100, (1 - avgPenalties / 4) * 100));

    // Wedges: Based on chipInside6ft and upAndDown combined
    const totalChipInside6ft = safeRounds.reduce((sum, r) => sum + (r.chipInside6ft || 0), 0);
    const totalUpDownAttempts = safeRounds.reduce((sum, r) => sum + (r.upAndDownConversions || 0) + (r.missed || 0), 0);
    const upDownSuccess = safeRounds.reduce((sum, r) => sum + (r.upAndDownConversions || 0), 0);
    const avgChipInside6ft = safeRounds.length > 0 ? totalChipInside6ft / safeRounds.length : 0;
    const upDownPercent = totalUpDownAttempts > 0 ? (upDownSuccess / totalUpDownAttempts) * 100 : 50;
    // Combine chip accuracy and up&down percentage (average of normalized values)
    const wedges = (Math.min(100, (avgChipInside6ft / 5) * 100) + upDownPercent) / 2;

    // Putting: Based on average putts (inverse)
    const totalPutts = safeRounds.reduce((sum, r) => sum + (r.totalPutts || 0), 0);
    const avgPutts = safeRounds.length > 0 ? totalPutts / safeRounds.length : 32;
    const putting = Math.max(0, Math.min(100, ((36 - avgPutts) / 18) * 100));

    // Short Game: Up & Down and Bunker Saves combined
    const totalBunkerAttempts = safeRounds.reduce((sum, r) => sum + (r.bunkerAttempts || 0) + (r.bunkerSaves || 0), 0);
    const bunkerSaves = safeRounds.reduce((sum, r) => sum + (r.bunkerSaves || 0), 0);
    const bunkerSavePercent = totalBunkerAttempts > 0 ? (bunkerSaves / totalBunkerAttempts) * 100 : 50;
    const shortGame = (upDownPercent + bunkerSavePercent) / 2;

    return {
      driving: Math.round(driving),
      approach: Math.round(approach),
      mental: Math.round(mental),
      wedges: Math.round(wedges),
      putting: Math.round(putting),
      shortGame: Math.round(shortGame),
    };
  }, [safeRounds]);

  // Calculate goal values for each category based on selectedGoal
  const practiceAllocationGoals = useMemo(() => {
    return {
      driving: goals.fir,
      approach: goals.gir,
      mental: 100 - (goals.score - selectedGoal > 80 ? 30 : goals.score - selectedGoal > 70 ? 20 : 10),
      wedges: goals.upAndDown,
      putting: 100 - ((goals.putts / 36) * 100),
      shortGame: goals.upAndDown,
    };
  }, [goals, selectedGoal]);

  // Calculate recommended practice hours based on gap
  const getRecommendedPracticeHours = (current: number, goal: number): number => {
    const gap = Math.max(0, goal - current);
    // Convert gap (0-100) to hours per week (0-5 hours)
    // Larger gap = more practice needed
    return Math.min(5, (gap / 100) * 5);
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
            </div>
            {/* Generate Report Button */}
            <button
              className="px-4 py-2 rounded-lg border-2 border-white text-white text-sm font-semibold hover:bg-white/10 transition-all"
              style={{ backgroundColor: '#05412B' }}
            >
              Generate Report
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
                onChange={(e) => setSelectedGoal(parseFloat(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #014421 0%, #014421 ${((selectedGoal + 5) / 59) * 100}%, #E5E7EB ${((selectedGoal + 5) / 59) * 100}%, #E5E7EB 100%)`
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
                    return (
                      <text
                        key={`y-label-${idx}`}
                        x={35}
                        y={yPos}
                        textAnchor="end"
                        fill="#FFFFFF"
                        fontWeight="bold"
                        opacity="1"
                        fontSize="10"
                        dominantBaseline="middle"
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
                  
                  {/* Goal Trend Line - Dashed White Line synced with slider */}
                  {(() => {
                    const goalY = getY(goalValue);
                    return (
                      <line
                        x1={graphStartX}
                        y1={goalY}
                        x2={graphStartX + graphWidth}
                        y2={goalY}
                        stroke="#FFFFFF"
                        strokeWidth="2"
                        strokeDasharray="5,5"
                        opacity="0.8"
                      />
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
                        <circle
                          cx={nodeX}
                          cy={nodeY}
                          r={isHovered ? 8 : 6}
                          fill="none"
                          stroke="#FFFFFF"
                          strokeWidth="2"
                          onMouseEnter={() => setHoveredIndex(i)}
                          onMouseLeave={() => setHoveredIndex(null)}
                          style={{ cursor: 'pointer' }}
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
              <div className="space-y-0">
                <div className="flex items-center justify-between py-2">
                  <div className="text-sm text-gray-700">FIR %</div>
                  <div className="text-2xl font-bold" style={{ color: '#FF9800' }}>
                    {performanceMetrics.firPercent.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>

            {/* Driving Insights */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-xs font-bold text-black uppercase tracking-wide mb-3">DRIVING INSIGHTS</div>
              <div className="space-y-3">
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
                <div className="flex items-center justify-between py-2">
                  <div className="text-sm text-gray-700">GIR %</div>
                  <div className="text-2xl font-bold" style={{ color: '#FF9800' }}>
                    {performanceMetrics.girPercent.toFixed(1)}%
                  </div>
                </div>
                <div className="border-t border-gray-200"></div>
                <div className="flex items-center justify-between py-2">
                  <div className="text-sm text-gray-700">GIR 8ft</div>
                  <div className="text-2xl font-bold" style={{ color: '#FF9800' }}>
                    {performanceMetrics.gir8ft.toFixed(1)}
                  </div>
                </div>
                <div className="border-t border-gray-200"></div>
                <div className="flex items-center justify-between py-2">
                  <div className="text-sm text-gray-700">GIR 20ft</div>
                  <div className="text-2xl font-bold" style={{ color: '#FF9800' }}>
                    {performanceMetrics.gir20ft.toFixed(1)}
                  </div>
                </div>
              </div>
            </div>

            {/* SHORT GAME Section */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-xs font-bold text-black uppercase tracking-wide mb-3">SHORT GAME</div>
              <div className="space-y-0">
                <div className="flex items-center justify-between py-2">
                  <div className="text-sm text-gray-700">Up & Down %</div>
                  <div className="text-2xl font-bold" style={{ color: '#FF9800' }}>
                    {performanceMetrics.upAndDownPercent.toFixed(1)}%
                  </div>
                </div>
                <div className="border-t border-gray-200"></div>
                <div className="flex items-center justify-between py-2">
                  <div className="text-sm text-gray-700">Bunker Saves</div>
                  <div className="text-2xl font-bold" style={{ color: '#FF9800' }}>
                    {performanceMetrics.bunkerSaves.toFixed(1)}%
                  </div>
                </div>
                <div className="border-t border-gray-200"></div>
                <div className="flex items-center justify-between py-2">
                  <div className="text-sm text-gray-700">Chip Inside 6ft</div>
                  <div className="text-2xl font-bold" style={{ color: '#FF9800' }}>
                    {performanceMetrics.chipInside6ft.toFixed(1)}
                  </div>
                </div>
              </div>
            </div>

            {/* PUTTING PRECISION Section */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-xs font-bold text-black uppercase tracking-wide mb-3">PUTTING PRECISION</div>
              <div className="space-y-0">
                <div className="flex items-center justify-between py-2">
                  <div className="text-sm text-gray-700">Total Putts</div>
                  <div className="text-2xl font-bold" style={{ color: '#FF9800' }}>
                    {performanceMetrics.avgPutts > 0 ? performanceMetrics.avgPutts.toFixed(1) : '0.0'}
                  </div>
                </div>
                <div className="border-t border-gray-200"></div>
                <div className="flex items-center justify-between py-2">
                  <div className="text-sm text-gray-700">&lt; 6ft Make %</div>
                  <div className="text-2xl font-bold" style={{ color: '#FF9800' }}>
                    {performanceMetrics.puttsUnder6ftMake.toFixed(1)}%
                  </div>
                </div>
                <div className="border-t border-gray-200"></div>
                <div className="flex items-center justify-between py-2">
                  <div className="text-sm text-gray-700">3-Putts (Avg)</div>
                  <div className="text-2xl font-bold" style={{ color: '#FF9800' }}>
                    {performanceMetrics.avgThreePutts.toFixed(1)}
                  </div>
                </div>
              </div>
            </div>

            {/* PENALTIES Section */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-xs font-bold text-black uppercase tracking-wide mb-3">PENALTIES</div>
              <div className="space-y-0">
                <div className="flex items-center justify-between py-2">
                  <div className="text-sm text-gray-700">Tee Penalties</div>
                  <div className="text-2xl font-bold" style={{ color: '#FF9800' }}>
                    {performanceMetrics.teePenalties.toFixed(1)}
                  </div>
                </div>
                <div className="border-t border-gray-200"></div>
                <div className="flex items-center justify-between py-2">
                  <div className="text-sm text-gray-700">Approach Penalties</div>
                  <div className="text-2xl font-bold" style={{ color: '#FF9800' }}>
                    {performanceMetrics.approachPenalties.toFixed(1)}
                  </div>
                </div>
                <div className="border-t border-gray-200"></div>
                <div className="flex items-center justify-between py-2">
                  <div className="text-sm text-gray-700">Total Penalties</div>
                  <div className="text-2xl font-bold" style={{ color: '#FF9800' }}>
                    {performanceMetrics.totalPenalties.toFixed(1)}
                  </div>
                </div>
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
            <div className="flex justify-center items-center relative">
              <svg 
                width="300" 
                height="300" 
                viewBox="0 0 300 300" 
                className="mx-auto"
                onMouseLeave={() => setHoveredCategory(null)}
              >
                <defs>
                  <linearGradient id="practiceGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#FF9800" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#FF9800" stopOpacity="0.1" />
                  </linearGradient>
                </defs>
                
                {/* Grid circles */}
                {[20, 40, 60, 80, 100].map((radius, idx) => (
                  <circle
                    key={`grid-${idx}`}
                    cx="150"
                    cy="150"
                    r={radius}
                    fill="none"
                    stroke="white"
                    strokeWidth="1"
                    strokeOpacity="0.2"
                  />
                ))}
                
                {/* Grid lines (6 axes for 6 categories) */}
                {[0, 60, 120, 180, 240, 300].map((angle, idx) => {
                  const rad = (angle * Math.PI) / 180;
                  const x = 150 + 100 * Math.cos(rad - Math.PI / 2);
                  const y = 150 + 100 * Math.sin(rad - Math.PI / 2);
                  return (
                    <line
                      key={`axis-${idx}`}
                      x1="150"
                      y1="150"
                      x2={x}
                      y2={y}
                      stroke="white"
                      strokeWidth="1"
                      strokeOpacity="0.2"
                    />
                  );
                })}
                
                {/* Practice Allocation polygon */}
                {(() => {
                  const categories = ['Driving', 'Approach', 'Mental', 'Wedges', 'Putting', 'Short Game'];
                  const values = [
                    practiceAllocationData.driving,
                    practiceAllocationData.approach,
                    practiceAllocationData.mental,
                    practiceAllocationData.wedges,
                    practiceAllocationData.putting,
                    practiceAllocationData.shortGame,
                  ];
                  
                  const points = values.map((value, idx) => {
                    const angle = (idx * 60 - 90) * (Math.PI / 180);
                    const radius = (value / 100) * 100;
                    const x = 150 + radius * Math.cos(angle);
                    const y = 150 + radius * Math.sin(angle);
                    return `${x},${y}`;
                  }).join(' ');
                  
                  return (
                    <>
                      <polygon
                        points={points}
                        fill="url(#practiceGradient)"
                        stroke="#FF9800"
                        strokeWidth="2"
                        strokeOpacity="0.8"
                      />
                      {/* Interactive category segments with hover */}
                      {categories.map((category, idx) => {
                        const angle = (idx * 60 - 90) * (Math.PI / 180);
                        const value = values[idx];
                        const radius = (value / 100) * 100;
                        const labelX = 150 + 120 * Math.cos(angle);
                        const labelY = 150 + 120 * Math.sin(angle);
                        
                        // Create hover area (triangle from center to point)
                        const prevAngle = ((idx - 1 + 6) % 6 * 60 - 90) * (Math.PI / 180);
                        const nextAngle = ((idx + 1) % 6 * 60 - 90) * (Math.PI / 180);
                        const midPrevAngle = (angle + prevAngle) / 2;
                        const midNextAngle = (angle + nextAngle) / 2;
                        const hoverRadius = 100;
                        
                        const hoverPoints = [
                          '150,150',
                          `${150 + hoverRadius * Math.cos(midPrevAngle)},${150 + hoverRadius * Math.sin(midPrevAngle)}`,
                          `${150 + radius * Math.cos(angle)},${150 + radius * Math.sin(angle)}`,
                          `${150 + hoverRadius * Math.cos(midNextAngle)},${150 + hoverRadius * Math.sin(midNextAngle)}`,
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
                                const svgRect = svgElement?.viewBox?.baseVal || { width: 300, height: 300 };
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
                            <text
                              x={labelX}
                              y={labelY}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fill="white"
                              fontSize="12"
                              fontWeight="bold"
                              opacity={isHovered ? 1 : 0.8}
                            >
                              {category}
                            </text>
                            {/* Value indicator on hover */}
                            {isHovered && (
                              <circle
                                cx={150 + radius * Math.cos(angle)}
                                cy={150 + radius * Math.sin(angle)}
                                r="4"
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
                const categoryIndex = ['Driving', 'Approach', 'Mental', 'Wedges', 'Putting', 'Short Game'].indexOf(hoveredCategory);
                const currentValue = [
                  practiceAllocationData.driving,
                  practiceAllocationData.approach,
                  practiceAllocationData.mental,
                  practiceAllocationData.wedges,
                  practiceAllocationData.putting,
                  practiceAllocationData.shortGame,
                ][categoryIndex];
                const goalValue = [
                  practiceAllocationGoals.driving,
                  practiceAllocationGoals.approach,
                  practiceAllocationGoals.mental,
                  practiceAllocationGoals.wedges,
                  practiceAllocationGoals.putting,
                  practiceAllocationGoals.shortGame,
                ][categoryIndex];
                const recommendedHours = getRecommendedPracticeHours(currentValue, goalValue);
                
                return (
                  <div 
                    className="fixed bg-white rounded-lg shadow-xl p-3 z-50 border-2 border-[#FF9800] pointer-events-none"
                    style={{
                      left: `${tooltipPosition.x}px`,
                      top: `${tooltipPosition.y - 100}px`,
                      transform: 'translateX(-50%)',
                      minWidth: '180px',
                    }}
                  >
                    <div className="text-xs font-bold text-gray-900 mb-2">{hoveredCategory}</div>
                    <div className="text-xs text-gray-700 mb-1">
                      <span className="font-semibold">Skill Level:</span> {currentValue}% Mastery
                    </div>
                    <div className="text-xs text-gray-700">
                      <span className="font-semibold">Recommended Practice:</span> {recommendedHours.toFixed(1)} Hours/Week
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
