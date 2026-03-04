"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, Save, Plus, Minus, RotateCcw } from "lucide-react";
import { logActivity } from "@/lib/activity";
import { InfoBubble } from "@/components/InfoBubble";

interface RoundData {
  // Scoring Card
  date: string;
  course: string;
  handicap: number | null; // Supports decimals
  holes: number;
  score: number | null; // Supports decimals
  nett: number | null; // Calculated with one decimal place
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doubleBogeys: number;
  
  // Tee & Approach Card
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
  
  // Short Game Card
  upAndDownConversions: number;
  missed: number;
  bunkerAttempts: number;
  bunkerSaves: number;
  chipInside6ft: number;
  doubleChips: number;
  
  // Putting Card
  totalPutts: number;
  threePutts: number;
  made6ftAndIn: number;
  puttsUnder6ftAttempts: number; // Total attempts from < 6ft
}

export default function LogRoundPage() {
  const router = useRouter();
  const { user } = useAuth();
  const today = new Date().toISOString().split('T')[0];
  const [isSaving, setIsSaving] = useState(false);
  
  const [roundData, setRoundData] = useState<RoundData>({
    date: today,
    course: '',
    handicap: null,
    holes: 18,
    score: null,
    nett: null,
    eagles: 0,
    birdies: 0,
    pars: 0,
    bogeys: 0,
    doubleBogeys: 0,
    firLeft: 0,
    firHit: 0,
    firRight: 0,
    totalGir: 0,
    totalPenalties: 0,
    teePenalties: 0,
    approachPenalties: 0,
    goingForGreen: 0,
    gir8ft: 0,
    gir20ft: 0,
    upAndDownConversions: 0,
    missed: 0,
    bunkerAttempts: 0,
    bunkerSaves: 0,
    chipInside6ft: 0,
    doubleChips: 0,
    totalPutts: 0,
    threePutts: 0,
    made6ftAndIn: 0,
    puttsUnder6ftAttempts: 0,
  });


  const updateField = (field: keyof RoundData, value: any) => {
    setRoundData(prev => {
      const updated = { ...prev, [field]: value };
      // Auto-calculate Nett if Score and Handicap are set
      if (field === 'score' || field === 'handicap') {
        if (updated.score !== null && updated.handicap !== null) {
          // Calculate Nett with one decimal place
          updated.nett = Math.round((updated.score - updated.handicap) * 10) / 10;
        } else {
          updated.nett = null;
        }
      }
      return updated;
    });
  };

  const incrementCounter = (field: keyof RoundData) => {
    setRoundData(prev => {
      const newValue = (prev[field] as number) + 1;
      
      // If we're incrementing Made < 6ft, ensure it doesn't exceed Attempts
      if (field === 'made6ftAndIn' && newValue > prev.puttsUnder6ftAttempts) {
        return prev;
      }
      
      return {
        ...prev,
        [field]: newValue
      };
    });
  };

  const decrementCounter = (field: keyof RoundData) => {
    setRoundData(prev => {
      const newValue = Math.max(0, (prev[field] as number) - 1);
      
      // If we're decrementing Attempts, ensure Made < 6ft doesn't exceed the new Attempts value
      if (field === 'puttsUnder6ftAttempts' && prev.made6ftAndIn > newValue) {
        return {
          ...prev,
          [field]: newValue,
          made6ftAndIn: newValue
        };
      }
      
      return {
        ...prev,
        [field]: newValue
      };
    });
  };

  const clearTeeApproach = () => {
    setRoundData(prev => ({
      ...prev,
      firLeft: 0,
      firHit: 0,
      firRight: 0,
      totalGir: 0,
      totalPenalties: 0,
      teePenalties: 0,
      approachPenalties: 0,
      goingForGreen: 0,
      gir8ft: 0,
      gir20ft: 0,
    }));
  };

  const clearShortGame = () => {
    setRoundData(prev => ({
      ...prev,
      upAndDownConversions: 0,
      missed: 0,
      bunkerAttempts: 0,
      bunkerSaves: 0,
      chipInside6ft: 0,
      doubleChips: 0,
    }));
  };

  const handleSaveRound = async () => {
    // Validate required fields
    if (!roundData.course || roundData.score === null || roundData.totalPutts === 0) {
      alert('Please fill in all required fields (Course, Score, Total Putts)');
      return;
    }

    if (!user?.id) {
      console.error('User not authenticated - user.id is missing:', user);
      alert('User not authenticated. Please log in and try again.');
      return;
    }

    // Explicitly validate and set user_id before saving
    const currentUserId = user.id;
    if (!currentUserId) {
      console.error('User ID is missing or invalid:', { user, userId: currentUserId });
      alert('User ID is missing. Please log out and log back in, then try again.');
      setIsSaving(false);
      return;
    }

    console.log('Saving round with explicit user_id:', currentUserId);
    setIsSaving(true);

    try {
      // Save to database only - no localStorage
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();

      // Prepare insert data with ALL fields - every UI input mapped to database
      // Complete mapping of all stats including Proximity, Short Game, and 3-Putt
      const insertData: Record<string, any> = {
        user_id: currentUserId, // Explicitly set to logged-in user's ID
        date: roundData.date || today,
        course_name: roundData.course, // Database expects course_name, not course
        handicap: roundData.handicap,
        holes: roundData.holes,
        score: roundData.score,
        nett: roundData.nett,
        // Scoring stats
        eagles: roundData.eagles,
        birdies: roundData.birdies,
        pars: roundData.pars,
        bogeys: roundData.bogeys,
        double_bogeys: roundData.doubleBogeys, // Maps '2+ Bogey' from UI to database column
        // Tee & Approach stats
        fir_left: roundData.firLeft,
        fir_hit: roundData.firHit,
        fir_right: roundData.firRight,
        total_gir: roundData.totalGir,
        going_for_green: roundData.goingForGreen,
        // Proximity stats (GIR Proximity)
        gir_8ft: roundData.gir8ft, // Proximity: Inside 8ft
        gir_20ft: roundData.gir20ft, // Proximity: Inside 20ft
        // Penalty stats
        total_penalties: roundData.totalPenalties,
        tee_penalties: roundData.teePenalties,
        approach_penalties: roundData.approachPenalties,
        // Short Game stats
        up_and_down_conversions: roundData.upAndDownConversions, // Conversions under Up & Down
        conversions: roundData.upAndDownConversions, // Also map to conversions column
        up_and_down_missed: roundData.missed, // Missed under Up & Down maps to up_and_down_missed
        missed: roundData.missed, // Also keep missed for backward compatibility
        bunker_attempts: roundData.bunkerAttempts,
        bunker_saves: roundData.bunkerSaves,
        chip_ins: roundData.doubleChips || 0, // Chip ins
        chip_inside_6ft: roundData.chipInside6ft, // Chips ending inside 6ft
        double_chips: roundData.doubleChips,
        // Putting stats
        total_putts: roundData.totalPutts,
        three_putts: roundData.threePutts, // 3-Putt stat
        made_under_6ft: roundData.made6ftAndIn,
        putts_under_6ft_attempts: roundData.puttsUnder6ftAttempts,
      };

      console.log('Attempting to save round with user_id:', currentUserId);
      console.log('Verified user_id before insert:', insertData.user_id);
      console.log('Complete round data being inserted (ALL FIELDS):', {
        user_id: insertData.user_id,
        date: insertData.date,
        course_name: insertData.course_name,
        score: insertData.score,
        // Scoring
        eagles: insertData.eagles,
        birdies: insertData.birdies,
        pars: insertData.pars,
        bogeys: insertData.bogeys,
        double_bogeys: insertData.double_bogeys,
        // Approach & Proximity
        total_gir: insertData.total_gir,
        gir_8ft: insertData.gir_8ft,
        gir_20ft: insertData.gir_20ft,
        going_for_green: insertData.going_for_green,
        // Penalties
        tee_penalties: insertData.tee_penalties,
        approach_penalties: insertData.approach_penalties,
        // Short Game
        up_and_down_conversions: insertData.up_and_down_conversions,
        conversions: insertData.conversions,
        up_and_down_missed: insertData.up_and_down_missed,
        missed: insertData.missed,
        bunker_attempts: insertData.bunker_attempts,
        bunker_saves: insertData.bunker_saves,
        chip_ins: insertData.chip_ins,
        chip_inside_6ft: insertData.chip_inside_6ft,
        // Putting (including 3-Putt)
        total_putts: insertData.total_putts,
        three_putts: insertData.three_putts,
        made_under_6ft: insertData.made_under_6ft, // Made < 6ft
        putts_under_6ft_attempts: insertData.putts_under_6ft_attempts,
      });

      const { data, error } = await supabase
        .from('rounds')
        .insert(insertData)
        .select();

      if (error) {
        console.error('Database error saving round:', error);
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        
        // Check for missing column errors (PGRST204)
        if (error.code === 'PGRST204' || error.message?.includes('column') || error.message?.includes('does not exist')) {
          console.warn('WARNING: Database column mismatch detected. The database schema may be missing some columns.');
          console.warn('Insert data attempted:', Object.keys(insertData));
          console.warn('This is a schema mismatch issue. Some columns may need to be added to the database.');
        }
        
        alert(`Failed to save round: ${error.message || 'Unknown error'}. Please check the console for details.`);
        setIsSaving(false);
        return;
      }

      console.log('Round saved successfully!', data);
      console.log('Round saved successfully');

      // Log activity to database
      await logActivity(user.id, 'round', `Posted a round of ${roundData.score}`);

      // Update handicap history and profile if a handicap was provided
      if (roundData.handicap !== null && roundData.handicap !== undefined) {
        // 1. Insert into handicap_history
        const { error: historyError } = await supabase
          .from('handicap_history')
          .insert({
            user_id: currentUserId,
            score: roundData.score,
            new_handicap: roundData.handicap
          });
          
        if (historyError) {
          console.error('Error saving handicap history:', historyError);
        }
        
        // 2. Update profiles table with new handicap
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ handicap: roundData.handicap })
          .eq('id', currentUserId);
          
        if (profileError) {
          console.error('Error updating profile handicap:', profileError);
        }
      }

      // Dispatch event to refresh rounds from database
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('roundsUpdated'));
        // Force Academy Leaderboard refresh by dispatching a custom event
        window.dispatchEvent(new Event('academyLeaderboardRefresh'));
      }

      // Navigate to academy page to see the updated leaderboard
      router.push('/academy');
    } catch (error) {
      console.error('Unexpected error saving round:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      alert(`Failed to save round: ${error instanceof Error ? error.message : 'Unknown error'}. Please check the console for details.`);
      setIsSaving(false);
    }
  };

  const isRequiredFilled = roundData.course && roundData.score !== null && roundData.totalPutts > 0;

  return (
    <div className="flex-1 w-full flex flex-col bg-[#014421]">
      {/* Header */}
      <div className="shrink-0 px-4 pt-6 pb-4 flex items-center gap-4 sticky top-0 z-10" style={{ backgroundColor: '#014421' }}>
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg text-white hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">Round Performance Entry</h1>
          <p className="text-white/80 text-sm">Enter your performance metrics</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-4 pb-32">
        <div className="max-w-md mx-auto">
          <div className="space-y-4 pb-6">
          {/* Scoring Card */}
          <div className="bg-white rounded-2xl p-4 shadow-lg">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Scoring</h2>
            
            <div className="space-y-3">
              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={roundData.date}
                  onChange={(e) => updateField('date', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#FFA500] focus:outline-none text-gray-900"
                />
              </div>

              {/* Course */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Course *</label>
                <input
                  type="text"
                  value={roundData.course}
                  onChange={(e) => updateField('course', e.target.value)}
                  placeholder="Enter course name"
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#FFA500] focus:outline-none text-gray-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Handicap */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Handicap</label>
                  <input
                    type="number"
                    step="0.1"
                    value={roundData.handicap !== null ? roundData.handicap : ''}
                    onChange={(e) => updateField('handicap', e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder="0.0"
                    className="w-full px-4 py-3 rounded-xl border-2 focus:outline-none transition-colors"
                    style={{ 
                      color: roundData.handicap !== null ? '#FFA500' : '#6B7280',
                      borderColor: roundData.handicap !== null ? '#FFA500' : '#E5E7EB'
                    }}
                  />
                </div>

                {/* Holes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Holes</label>
                  <select
                    value={roundData.holes}
                    onChange={(e) => updateField('holes', parseInt(e.target.value))}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#FFA500] focus:outline-none text-gray-900"
                  >
                    <option value={9}>9 Holes</option>
                    <option value={18}>18 Holes</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Score */}
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <label className="block text-sm font-medium text-gray-700">Score *</label>
                    <InfoBubble content="Total gross score for the round." />
                  </div>
                  <input
                    type="number"
                    step="0.1"
                    value={roundData.score !== null ? roundData.score : ''}
                    onChange={(e) => updateField('score', e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder="0"
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#FFA500] focus:outline-none text-gray-900"
                  />
                </div>

                {/* Nett */}
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <label className="block text-sm font-medium text-gray-700">Nett</label>
                    <InfoBubble content="Gross score minus handicap." />
                  </div>
                  <input
                    type="number"
                    step="0.1"
                    value={roundData.nett !== null ? roundData.nett.toFixed(1) : ''}
                    readOnly
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 bg-gray-50"
                    style={{ color: roundData.nett !== null ? '#FFA500' : '#9CA3AF' }}
                  />
                </div>
              </div>

              {/* Hole Results - 2 Column Grid */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Hole Results</label>
                <div className="grid grid-cols-2 gap-4">
                  {/* Eagle */}
                  <div className="flex flex-col items-center p-3 rounded-lg border border-gray-200">
                    <span className="text-xs font-medium text-gray-600 mb-2">Eagle</span>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => decrementCounter('eagles')}
                        className="w-10 h-10 rounded-lg flex items-center justify-center border border-gray-300 hover:bg-gray-50 transition-colors"
                        style={{ minWidth: '44px', minHeight: '44px' }}
                      >
                        <Minus className="w-4 h-4 text-gray-600" />
                      </button>
                      <span 
                        className="text-lg font-bold w-10 text-center"
                        style={{ color: roundData.eagles > 0 ? '#FFA500' : '#111827' }}
                      >
                        {roundData.eagles}
                      </span>
                      <button
                        onClick={() => incrementCounter('eagles')}
                        className="w-10 h-10 rounded-lg flex items-center justify-center border border-gray-300 hover:bg-gray-50 transition-colors"
                        style={{ minWidth: '44px', minHeight: '44px' }}
                      >
                        <Plus className="w-4 h-4 text-gray-600" />
                      </button>
                    </div>
                  </div>

                  {/* Birdie */}
                  <div className="flex flex-col items-center p-3 rounded-lg border border-gray-200">
                    <span className="text-xs font-medium text-gray-600 mb-2">Birdie</span>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => decrementCounter('birdies')}
                        className="w-10 h-10 rounded-lg flex items-center justify-center border border-gray-300 hover:bg-gray-50 transition-colors"
                        style={{ minWidth: '44px', minHeight: '44px' }}
                      >
                        <Minus className="w-4 h-4 text-gray-600" />
                      </button>
                      <span 
                        className="text-lg font-bold w-10 text-center"
                        style={{ color: roundData.birdies > 0 ? '#FFA500' : '#111827' }}
                      >
                        {roundData.birdies}
                      </span>
                      <button
                        onClick={() => incrementCounter('birdies')}
                        className="w-10 h-10 rounded-lg flex items-center justify-center border border-gray-300 hover:bg-gray-50 transition-colors"
                        style={{ minWidth: '44px', minHeight: '44px' }}
                      >
                        <Plus className="w-4 h-4 text-gray-600" />
                      </button>
                    </div>
                  </div>

                  {/* Par */}
                  <div className="flex flex-col items-center p-3 rounded-lg border border-gray-200">
                    <span className="text-xs font-medium text-gray-600 mb-2">Par</span>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => decrementCounter('pars')}
                        className="w-10 h-10 rounded-lg flex items-center justify-center border border-gray-300 hover:bg-gray-50 transition-colors"
                        style={{ minWidth: '44px', minHeight: '44px' }}
                      >
                        <Minus className="w-4 h-4 text-gray-600" />
                      </button>
                      <span 
                        className="text-lg font-bold w-10 text-center"
                        style={{ color: roundData.pars > 0 ? '#FFA500' : '#111827' }}
                      >
                        {roundData.pars}
                      </span>
                      <button
                        onClick={() => incrementCounter('pars')}
                        className="w-10 h-10 rounded-lg flex items-center justify-center border border-gray-300 hover:bg-gray-50 transition-colors"
                        style={{ minWidth: '44px', minHeight: '44px' }}
                      >
                        <Plus className="w-4 h-4 text-gray-600" />
                      </button>
                    </div>
                  </div>

                  {/* Bogey */}
                  <div className="flex flex-col items-center p-3 rounded-lg border border-gray-200">
                    <span className="text-xs font-medium text-gray-600 mb-2">Bogey</span>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => decrementCounter('bogeys')}
                        className="w-10 h-10 rounded-lg flex items-center justify-center border border-gray-300 hover:bg-gray-50 transition-colors"
                        style={{ minWidth: '44px', minHeight: '44px' }}
                      >
                        <Minus className="w-4 h-4 text-gray-600" />
                      </button>
                      <span 
                        className="text-lg font-bold w-10 text-center"
                        style={{ color: roundData.bogeys > 0 ? '#FFA500' : '#111827' }}
                      >
                        {roundData.bogeys}
                      </span>
                      <button
                        onClick={() => incrementCounter('bogeys')}
                        className="w-10 h-10 rounded-lg flex items-center justify-center border border-gray-300 hover:bg-gray-50 transition-colors"
                        style={{ minWidth: '44px', minHeight: '44px' }}
                      >
                        <Plus className="w-4 h-4 text-gray-600" />
                      </button>
                    </div>
                  </div>

                  {/* 2+ Bogey */}
                  <div className="flex flex-col items-center p-3 rounded-lg border border-gray-200">
                    <span className="text-xs font-medium text-gray-600 mb-2">2+ Bogey</span>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => decrementCounter('doubleBogeys')}
                        className="w-10 h-10 rounded-lg flex items-center justify-center border border-gray-300 hover:bg-gray-50 transition-colors"
                        style={{ minWidth: '44px', minHeight: '44px' }}
                      >
                        <Minus className="w-4 h-4 text-gray-600" />
                      </button>
                      <span 
                        className="text-lg font-bold w-10 text-center"
                        style={{ color: roundData.doubleBogeys > 0 ? '#FFA500' : '#111827' }}
                      >
                        {roundData.doubleBogeys}
                      </span>
                      <button
                        onClick={() => incrementCounter('doubleBogeys')}
                        className="w-10 h-10 rounded-lg flex items-center justify-center border border-gray-300 hover:bg-gray-50 transition-colors"
                        style={{ minWidth: '44px', minHeight: '44px' }}
                      >
                        <Plus className="w-4 h-4 text-gray-600" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tee & Approach Card */}
          <div className="bg-white rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Tee & Approach</h2>
              <button
                onClick={clearTeeApproach}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                title="Clear all"
              >
                <RotateCcw className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            
            <div className="space-y-4">
              {/* FIR */}
              <div>
                <div className="flex items-center gap-1 mb-3">
                  <label className="block text-sm font-medium text-gray-700">Fairways in Regulation</label>
                  <InfoBubble content="The tee shot lands on the fairway on Par 4s and Par 5s." />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {/* FIR Left */}
                  <div
                    className={`p-3 rounded-xl border-2 transition-all ${
                      roundData.firLeft > 0
                        ? 'border-[#FFA500]'
                        : 'border-gray-200'
                    }`}
                    style={{
                      backgroundColor: roundData.firLeft > 0 ? '#FFA500' : 'white'
                    }}
                  >
                    <div className="text-xs font-medium mb-2 text-center" style={{ color: roundData.firLeft > 0 ? '#014421' : '#6B7280' }}>
                      Left
                    </div>
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => decrementCounter('firLeft')}
                        className="w-8 h-8 rounded-lg flex items-center justify-center border-2 transition-colors"
                        style={{
                          borderColor: roundData.firLeft > 0 ? '#014421' : '#D1D5DB',
                          color: roundData.firLeft > 0 ? '#014421' : '#6B7280',
                          minWidth: '32px',
                          minHeight: '32px'
                        }}
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span
                        className="text-xl font-bold w-10 text-center"
                        style={{ color: roundData.firLeft > 0 ? '#014421' : '#111827' }}
                      >
                        {roundData.firLeft}
                      </span>
                      <button
                        onClick={() => incrementCounter('firLeft')}
                        className="w-8 h-8 rounded-lg flex items-center justify-center border-2 transition-colors"
                        style={{
                          borderColor: roundData.firLeft > 0 ? '#014421' : '#D1D5DB',
                          color: roundData.firLeft > 0 ? '#014421' : '#6B7280',
                          minWidth: '32px',
                          minHeight: '32px'
                        }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* FIR Hit */}
                  <div
                    className={`p-3 rounded-xl border-2 transition-all ${
                      roundData.firHit > 0
                        ? 'border-[#FFA500]'
                        : 'border-gray-200'
                    }`}
                    style={{
                      backgroundColor: roundData.firHit > 0 ? '#FFA500' : 'white'
                    }}
                  >
                    <div className="text-xs font-medium mb-2 text-center" style={{ color: roundData.firHit > 0 ? '#014421' : '#6B7280' }}>
                      Hit
                    </div>
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => decrementCounter('firHit')}
                        className="w-9 h-9 rounded-lg flex items-center justify-center border-2 transition-colors"
                        style={{
                          borderColor: roundData.firHit > 0 ? '#014421' : '#D1D5DB',
                          color: roundData.firHit > 0 ? '#014421' : '#6B7280',
                          minWidth: '32px',
                          minHeight: '32px'
                        }}
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span
                        className="text-xl font-bold w-10 text-center"
                        style={{ color: roundData.firHit > 0 ? '#014421' : '#111827' }}
                      >
                        {roundData.firHit}
                      </span>
                      <button
                        onClick={() => incrementCounter('firHit')}
                        className="w-9 h-9 rounded-lg flex items-center justify-center border-2 transition-colors"
                        style={{
                          borderColor: roundData.firHit > 0 ? '#014421' : '#D1D5DB',
                          color: roundData.firHit > 0 ? '#014421' : '#6B7280',
                          minWidth: '32px',
                          minHeight: '32px'
                        }}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* FIR Right */}
                  <div
                    className={`p-3 rounded-xl border-2 transition-all ${
                      roundData.firRight > 0
                        ? 'border-[#FFA500]'
                        : 'border-gray-200'
                    }`}
                    style={{
                      backgroundColor: roundData.firRight > 0 ? '#FFA500' : 'white'
                    }}
                  >
                    <div className="text-xs font-medium mb-2 text-center" style={{ color: roundData.firRight > 0 ? '#014421' : '#6B7280' }}>
                      Right
                    </div>
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => decrementCounter('firRight')}
                        className="w-9 h-9 rounded-lg flex items-center justify-center border-2 transition-colors"
                        style={{
                          borderColor: roundData.firRight > 0 ? '#014421' : '#D1D5DB',
                          color: roundData.firRight > 0 ? '#014421' : '#6B7280',
                          minWidth: '32px',
                          minHeight: '32px'
                        }}
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span
                        className="text-xl font-bold w-10 text-center"
                        style={{ color: roundData.firRight > 0 ? '#014421' : '#111827' }}
                      >
                        {roundData.firRight}
                      </span>
                      <button
                        onClick={() => incrementCounter('firRight')}
                        className="w-9 h-9 rounded-lg flex items-center justify-center border-2 transition-colors"
                        style={{
                          borderColor: roundData.firRight > 0 ? '#014421' : '#D1D5DB',
                          color: roundData.firRight > 0 ? '#014421' : '#6B7280',
                          minWidth: '32px',
                          minHeight: '32px'
                        }}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Penalties */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Penalties</label>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-row justify-between gap-2">
                    {/* Total Penalties */}
                    <div
                      className={`flex-1 p-2 rounded-xl border-2 transition-all ${
                        roundData.totalPenalties > 0
                          ? 'border-[#FFA500]'
                          : 'border-gray-200'
                      }`}
                      style={{
                        backgroundColor: roundData.totalPenalties > 0 ? '#FFA500' : 'white'
                      }}
                    >
                      <div className="text-[10px] font-medium mb-2 text-center whitespace-nowrap" style={{ color: roundData.totalPenalties > 0 ? '#014421' : '#6B7280' }}>
                        Total
                      </div>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => decrementCounter('totalPenalties')}
                          className="w-7 h-7 rounded-md flex items-center justify-center border-2 transition-colors"
                          style={{
                            borderColor: roundData.totalPenalties > 0 ? '#014421' : '#D1D5DB',
                            color: roundData.totalPenalties > 0 ? '#014421' : '#6B7280',
                            minWidth: '28px',
                            minHeight: '28px'
                          }}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span
                          className="text-sm font-bold w-6 text-center"
                          style={{ color: roundData.totalPenalties > 0 ? '#014421' : '#111827' }}
                        >
                          {roundData.totalPenalties}
                        </span>
                        <button
                          onClick={() => incrementCounter('totalPenalties')}
                          className="w-7 h-7 rounded-md flex items-center justify-center border-2 transition-colors"
                          style={{
                            borderColor: roundData.totalPenalties > 0 ? '#014421' : '#D1D5DB',
                            color: roundData.totalPenalties > 0 ? '#014421' : '#6B7280',
                            minWidth: '28px',
                            minHeight: '28px'
                          }}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Tee Penalties */}
                    <div
                      className={`flex-1 p-2 rounded-xl border-2 transition-all ${
                        roundData.teePenalties > 0
                          ? 'border-[#FFA500]'
                          : 'border-gray-200'
                      }`}
                      style={{
                        backgroundColor: roundData.teePenalties > 0 ? '#FFA500' : 'white'
                      }}
                    >
                      <div className="text-[10px] font-medium mb-2 text-center whitespace-nowrap" style={{ color: roundData.teePenalties > 0 ? '#014421' : '#6B7280' }}>
                        Tee
                      </div>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => decrementCounter('teePenalties')}
                          className="w-7 h-7 rounded-md flex items-center justify-center border-2 transition-colors"
                          style={{
                            borderColor: roundData.teePenalties > 0 ? '#014421' : '#D1D5DB',
                            color: roundData.teePenalties > 0 ? '#014421' : '#6B7280',
                            minWidth: '28px',
                            minHeight: '28px'
                          }}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span
                          className="text-sm font-bold w-6 text-center"
                          style={{ color: roundData.teePenalties > 0 ? '#014421' : '#111827' }}
                        >
                          {roundData.teePenalties}
                        </span>
                        <button
                          onClick={() => incrementCounter('teePenalties')}
                          className="w-7 h-7 rounded-md flex items-center justify-center border-2 transition-colors"
                          style={{
                            borderColor: roundData.teePenalties > 0 ? '#014421' : '#D1D5DB',
                            color: roundData.teePenalties > 0 ? '#014421' : '#6B7280',
                            minWidth: '28px',
                            minHeight: '28px'
                          }}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-row justify-between gap-2">
                    {/* Approach Penalties */}
                    <div
                      className={`flex-1 p-2 rounded-xl border-2 transition-all ${
                        roundData.approachPenalties > 0
                          ? 'border-[#FFA500]'
                          : 'border-gray-200'
                      }`}
                      style={{
                        backgroundColor: roundData.approachPenalties > 0 ? '#FFA500' : 'white'
                      }}
                    >
                      <div className="text-[10px] font-medium mb-2 text-center whitespace-nowrap" style={{ color: roundData.approachPenalties > 0 ? '#014421' : '#6B7280' }}>
                        Approach
                      </div>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => decrementCounter('approachPenalties')}
                          className="w-7 h-7 rounded-md flex items-center justify-center border-2 transition-colors"
                          style={{
                            borderColor: roundData.approachPenalties > 0 ? '#014421' : '#D1D5DB',
                            color: roundData.approachPenalties > 0 ? '#014421' : '#6B7280',
                            minWidth: '28px',
                            minHeight: '28px'
                          }}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span
                          className="text-sm font-bold w-6 text-center"
                          style={{ color: roundData.approachPenalties > 0 ? '#014421' : '#111827' }}
                        >
                          {roundData.approachPenalties}
                        </span>
                        <button
                          onClick={() => incrementCounter('approachPenalties')}
                          className="w-7 h-7 rounded-md flex items-center justify-center border-2 transition-colors"
                          style={{
                            borderColor: roundData.approachPenalties > 0 ? '#014421' : '#D1D5DB',
                            color: roundData.approachPenalties > 0 ? '#014421' : '#6B7280',
                            minWidth: '28px',
                            minHeight: '28px'
                          }}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    {/* Spacer */}
                    <div className="flex-1 p-2"></div>
                  </div>
                </div>
              </div>

              {/* Greens in Regulation */}
              <div>
                <div className="flex items-center gap-1 mb-2">
                  <label className="block text-sm font-medium text-gray-700">Greens in Regulation</label>
                  <InfoBubble content="A green is hit in regulation if any part of the ball is on the putting surface in Par - 2 strokes." tooltipClassName="left-0 bottom-full mb-2 w-64" />
                </div>
                <div className="flex flex-col gap-2">
                  {/* Row 1: Total GIR and Inside 8ft */}
                  <div className="flex flex-row justify-between gap-2">
                    {/* Total GIR */}
                    <div
                      className={`flex-1 p-2 rounded-xl border-2 transition-all ${
                        roundData.totalGir > 0
                          ? 'border-[#FFA500]'
                          : 'border-gray-200'
                      }`}
                      style={{
                        backgroundColor: roundData.totalGir > 0 ? '#FFA500' : 'white'
                      }}
                    >
                      <div className="text-[10px] font-medium mb-2 text-center whitespace-nowrap" style={{ color: roundData.totalGir > 0 ? '#014421' : '#6B7280' }}>
                        Total GIR
                      </div>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => decrementCounter('totalGir')}
                          className="w-7 h-7 rounded-md flex items-center justify-center border-2 transition-colors"
                          style={{
                            borderColor: roundData.totalGir > 0 ? '#014421' : '#D1D5DB',
                            color: roundData.totalGir > 0 ? '#014421' : '#6B7280',
                            minWidth: '28px',
                            minHeight: '28px'
                          }}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span
                          className="text-sm font-bold w-6 text-center"
                          style={{ color: roundData.totalGir > 0 ? '#014421' : '#111827' }}
                        >
                          {roundData.totalGir}
                        </span>
                        <button
                          onClick={() => incrementCounter('totalGir')}
                          className="w-7 h-7 rounded-md flex items-center justify-center border-2 transition-colors"
                          style={{
                            borderColor: roundData.totalGir > 0 ? '#014421' : '#D1D5DB',
                            color: roundData.totalGir > 0 ? '#014421' : '#6B7280',
                            minWidth: '28px',
                            minHeight: '28px'
                          }}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Inside 8ft */}
                    <div
                      className={`flex-1 p-2 rounded-xl border-2 transition-all ${
                        roundData.gir8ft > 0
                          ? 'border-[#FFA500]'
                          : 'border-gray-200'
                      }`}
                      style={{
                        backgroundColor: roundData.gir8ft > 0 ? '#FFA500' : 'white'
                      }}
                    >
                      <div className="flex items-center justify-center gap-1 mb-2">
                        <span className="text-[10px] font-medium text-center whitespace-nowrap" style={{ color: roundData.gir8ft > 0 ? '#014421' : '#6B7280' }}>
                          Inside 8ft
                        </span>
                        <InfoBubble
                          content="2.4m"
                          buttonClassName="w-3 h-3 rounded-full bg-white/50 flex items-center justify-center text-[8px] font-bold cursor-help border"
                          buttonStyle={{ borderColor: roundData.gir8ft > 0 ? '#014421' : '#E5E7EB', color: roundData.gir8ft > 0 ? '#014421' : '#9CA3AF' }}
                          tooltipClassName="left-1/2 -translate-x-1/2 bottom-full mb-2 w-24 text-center p-1.5"
                        />
                      </div>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => decrementCounter('gir8ft')}
                          className="w-7 h-7 rounded-md flex items-center justify-center border-2 transition-colors"
                          style={{
                            borderColor: roundData.gir8ft > 0 ? '#014421' : '#D1D5DB',
                            color: roundData.gir8ft > 0 ? '#014421' : '#6B7280',
                            minWidth: '28px',
                            minHeight: '28px'
                          }}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span
                          className="text-sm font-bold w-6 text-center"
                          style={{ color: roundData.gir8ft > 0 ? '#014421' : '#111827' }}
                        >
                          {roundData.gir8ft}
                        </span>
                        <button
                          onClick={() => incrementCounter('gir8ft')}
                          className="w-7 h-7 rounded-md flex items-center justify-center border-2 transition-colors"
                          style={{
                            borderColor: roundData.gir8ft > 0 ? '#014421' : '#D1D5DB',
                            color: roundData.gir8ft > 0 ? '#014421' : '#6B7280',
                            minWidth: '28px',
                            minHeight: '28px'
                          }}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Inside 20ft and Going for Green */}
                  <div className="flex flex-row justify-between gap-2">
                    {/* Inside 20ft */}
                    <div
                      className={`flex-1 p-2 rounded-xl border-2 transition-all ${
                        roundData.gir20ft > 0
                          ? 'border-[#FFA500]'
                          : 'border-gray-200'
                      }`}
                      style={{
                        backgroundColor: roundData.gir20ft > 0 ? '#FFA500' : 'white'
                      }}
                    >
                      <div className="flex items-center justify-center gap-1 mb-2">
                        <span className="text-[10px] font-medium text-center whitespace-nowrap" style={{ color: roundData.gir20ft > 0 ? '#014421' : '#6B7280' }}>
                          Inside 20ft
                        </span>
                        <InfoBubble
                          content="6.1m. Note: Also includes shots inside 8ft."
                          buttonClassName="w-3 h-3 rounded-full bg-white/50 flex items-center justify-center text-[8px] font-bold cursor-help border"
                          buttonStyle={{ borderColor: roundData.gir20ft > 0 ? '#014421' : '#E5E7EB', color: roundData.gir20ft > 0 ? '#014421' : '#9CA3AF' }}
                          tooltipClassName="left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 text-center p-1.5"
                        />
                      </div>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => decrementCounter('gir20ft')}
                          className="w-7 h-7 rounded-md flex items-center justify-center border-2 transition-colors"
                          style={{
                            borderColor: roundData.gir20ft > 0 ? '#014421' : '#D1D5DB',
                            color: roundData.gir20ft > 0 ? '#014421' : '#6B7280',
                            minWidth: '28px',
                            minHeight: '28px'
                          }}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span
                          className="text-sm font-bold w-6 text-center"
                          style={{ color: roundData.gir20ft > 0 ? '#014421' : '#111827' }}
                        >
                          {roundData.gir20ft}
                        </span>
                        <button
                          onClick={() => incrementCounter('gir20ft')}
                          className="w-7 h-7 rounded-md flex items-center justify-center border-2 transition-colors"
                          style={{
                            borderColor: roundData.gir20ft > 0 ? '#014421' : '#D1D5DB',
                            color: roundData.gir20ft > 0 ? '#014421' : '#6B7280',
                            minWidth: '28px',
                            minHeight: '28px'
                          }}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Going for Green */}
                    <div
                      className={`flex-1 p-2 rounded-xl border-2 transition-all ${
                        roundData.goingForGreen > 0
                          ? 'border-[#FFA500]'
                          : 'border-gray-200'
                      }`}
                      style={{
                        backgroundColor: roundData.goingForGreen > 0 ? '#FFA500' : 'white'
                      }}
                    >
                      <div className="flex items-center justify-center gap-1 mb-2">
                        <span className="text-[10px] font-medium text-center whitespace-nowrap" style={{ color: roundData.goingForGreen > 0 ? '#014421' : '#6B7280' }}>
                          Going for Green
                        </span>
                        <InfoBubble
                          content="Attempts to reach a Par 4 in 1 stroke or a Par 5 in 2 strokes."
                          buttonClassName="w-3 h-3 rounded-full bg-white/50 flex items-center justify-center text-[8px] font-bold cursor-help border"
                          buttonStyle={{ borderColor: roundData.goingForGreen > 0 ? '#014421' : '#E5E7EB', color: roundData.goingForGreen > 0 ? '#014421' : '#9CA3AF' }}
                          tooltipClassName="left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 text-center p-1.5"
                        />
                      </div>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => decrementCounter('goingForGreen')}
                          className="w-7 h-7 rounded-md flex items-center justify-center border-2 transition-colors"
                          style={{
                            borderColor: roundData.goingForGreen > 0 ? '#014421' : '#D1D5DB',
                            color: roundData.goingForGreen > 0 ? '#014421' : '#6B7280',
                            minWidth: '28px',
                            minHeight: '28px'
                          }}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span
                          className="text-sm font-bold w-6 text-center"
                          style={{ color: roundData.goingForGreen > 0 ? '#014421' : '#111827' }}
                        >
                          {roundData.goingForGreen}
                        </span>
                        <button
                          onClick={() => incrementCounter('goingForGreen')}
                          className="w-7 h-7 rounded-md flex items-center justify-center border-2 transition-colors"
                          style={{
                            borderColor: roundData.goingForGreen > 0 ? '#014421' : '#D1D5DB',
                            color: roundData.goingForGreen > 0 ? '#014421' : '#6B7280',
                            minWidth: '28px',
                            minHeight: '28px'
                          }}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Short Game Card */}
          <div className="bg-white rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Short Game</h2>
              <button
                onClick={clearShortGame}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                title="Clear all"
              >
                <RotateCcw className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Up & Down Conversions */}
              <div>
                <div className="flex items-center gap-1 mb-3">
                  <label className="block text-sm font-medium text-gray-700">Up & Down Conversions</label>
                  <InfoBubble content="Missing the GIR but still making Par or better (The 'Up & Down' %)." tooltipClassName="left-0 bottom-full mb-2 w-64" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {/* Up & Down Attempts */}
                  <div
                    className={`p-3 rounded-xl border-2 transition-all ${
                      roundData.missed > 0
                        ? 'border-[#FFA500]'
                        : 'border-gray-200'
                    }`}
                    style={{
                      backgroundColor: roundData.missed > 0 ? '#FFA500' : 'white'
                    }}
                  >
                    <div className="text-xs font-medium mb-2 text-center" style={{ color: roundData.missed > 0 ? '#014421' : '#6B7280' }}>
                      Attempts
                    </div>
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => decrementCounter('missed')}
                        className="w-8 h-8 rounded-lg flex items-center justify-center border-2 transition-colors"
                        style={{
                          borderColor: roundData.missed > 0 ? '#014421' : '#D1D5DB',
                          color: roundData.missed > 0 ? '#014421' : '#6B7280',
                          minWidth: '32px',
                          minHeight: '32px'
                        }}
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span
                        className="text-xl font-bold w-10 text-center"
                        style={{ color: roundData.missed > 0 ? '#014421' : '#111827' }}
                      >
                        {roundData.missed}
                      </span>
                      <button
                        onClick={() => incrementCounter('missed')}
                        className="w-8 h-8 rounded-lg flex items-center justify-center border-2 transition-colors"
                        style={{
                          borderColor: roundData.missed > 0 ? '#014421' : '#D1D5DB',
                          color: roundData.missed > 0 ? '#014421' : '#6B7280',
                          minWidth: '32px',
                          minHeight: '32px'
                        }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Up & Down Made */}
                  <div
                    className={`p-3 rounded-xl border-2 transition-all ${
                      roundData.upAndDownConversions > 0
                        ? 'border-[#FFA500]'
                        : 'border-gray-200'
                    }`}
                    style={{
                      backgroundColor: roundData.upAndDownConversions > 0 ? '#FFA500' : 'white'
                    }}
                  >
                    <div className="text-xs font-medium mb-2 text-center" style={{ color: roundData.upAndDownConversions > 0 ? '#014421' : '#6B7280' }}>
                      Made
                    </div>
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => decrementCounter('upAndDownConversions')}
                        className="w-8 h-8 rounded-lg flex items-center justify-center border-2 transition-colors"
                        style={{
                          borderColor: roundData.upAndDownConversions > 0 ? '#014421' : '#D1D5DB',
                          color: roundData.upAndDownConversions > 0 ? '#014421' : '#6B7280',
                          minWidth: '32px',
                          minHeight: '32px'
                        }}
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span
                        className="text-xl font-bold w-10 text-center"
                        style={{ color: roundData.upAndDownConversions > 0 ? '#014421' : '#111827' }}
                      >
                        {roundData.upAndDownConversions}
                      </span>
                      <button
                        onClick={() => {
                          if (roundData.upAndDownConversions < roundData.missed) {
                            incrementCounter('upAndDownConversions');
                          }
                        }}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center border-2 transition-colors ${
                          roundData.upAndDownConversions >= roundData.missed ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                        style={{
                          borderColor: roundData.upAndDownConversions > 0 ? '#014421' : '#D1D5DB',
                          color: roundData.upAndDownConversions > 0 ? '#014421' : '#6B7280',
                          minWidth: '32px',
                          minHeight: '32px'
                        }}
                        disabled={roundData.upAndDownConversions >= roundData.missed}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bunker Saves */}
              <div>
                <div className="flex items-center gap-1 mb-3">
                  <label className="block text-sm font-medium text-gray-700">Bunker Saves</label>
                  <InfoBubble content="Greenside only." tooltipClassName="left-0 bottom-full mb-2 w-64" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {/* Bunker Attempts */}
                  <div
                    className={`p-3 rounded-xl border-2 transition-all ${
                      roundData.bunkerAttempts > 0
                        ? 'border-[#FFA500]'
                        : 'border-gray-200'
                    }`}
                    style={{
                      backgroundColor: roundData.bunkerAttempts > 0 ? '#FFA500' : 'white'
                    }}
                  >
                    <div className="text-xs font-medium mb-2 text-center" style={{ color: roundData.bunkerAttempts > 0 ? '#014421' : '#6B7280' }}>
                      Attempts
                    </div>
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => decrementCounter('bunkerAttempts')}
                        className="w-8 h-8 rounded-lg flex items-center justify-center border-2 transition-colors"
                        style={{
                          borderColor: roundData.bunkerAttempts > 0 ? '#014421' : '#D1D5DB',
                          color: roundData.bunkerAttempts > 0 ? '#014421' : '#6B7280',
                          minWidth: '32px',
                          minHeight: '32px'
                        }}
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span
                        className="text-xl font-bold w-10 text-center"
                        style={{ color: roundData.bunkerAttempts > 0 ? '#014421' : '#111827' }}
                      >
                        {roundData.bunkerAttempts}
                      </span>
                      <button
                        onClick={() => incrementCounter('bunkerAttempts')}
                        className="w-8 h-8 rounded-lg flex items-center justify-center border-2 transition-colors"
                        style={{
                          borderColor: roundData.bunkerAttempts > 0 ? '#014421' : '#D1D5DB',
                          color: roundData.bunkerAttempts > 0 ? '#014421' : '#6B7280',
                          minWidth: '32px',
                          minHeight: '32px'
                        }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Bunker Saves */}
                  <div
                    className={`p-3 rounded-xl border-2 transition-all ${
                      roundData.bunkerSaves > 0
                        ? 'border-[#FFA500]'
                        : 'border-gray-200'
                    }`}
                    style={{
                      backgroundColor: roundData.bunkerSaves > 0 ? '#FFA500' : 'white'
                    }}
                  >
                    <div className="text-xs font-medium mb-2 text-center" style={{ color: roundData.bunkerSaves > 0 ? '#014421' : '#6B7280' }}>
                      Made
                    </div>
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => decrementCounter('bunkerSaves')}
                        className="w-8 h-8 rounded-lg flex items-center justify-center border-2 transition-colors"
                        style={{
                          borderColor: roundData.bunkerSaves > 0 ? '#014421' : '#D1D5DB',
                          color: roundData.bunkerSaves > 0 ? '#014421' : '#6B7280',
                          minWidth: '32px',
                          minHeight: '32px'
                        }}
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span
                        className="text-xl font-bold w-10 text-center"
                        style={{ color: roundData.bunkerSaves > 0 ? '#014421' : '#111827' }}
                      >
                        {roundData.bunkerSaves}
                      </span>
                      <button
                        onClick={() => {
                          if (roundData.bunkerSaves < roundData.bunkerAttempts) {
                            incrementCounter('bunkerSaves');
                          }
                        }}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center border-2 transition-colors ${
                          roundData.bunkerSaves >= roundData.bunkerAttempts ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                        style={{
                          borderColor: roundData.bunkerSaves > 0 ? '#014421' : '#D1D5DB',
                          color: roundData.bunkerSaves > 0 ? '#014421' : '#6B7280',
                          minWidth: '32px',
                          minHeight: '32px'
                        }}
                        disabled={roundData.bunkerSaves >= roundData.bunkerAttempts}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Chip Inside 6ft and Double Chips - Side by Side */}
              <div>
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <div className="flex items-center gap-1">
                    <label className="text-sm font-medium text-gray-700">Chip Inside 6ft</label>
                    <InfoBubble content="Approx. 1.8 metres" buttonClassName="w-3.5 h-3.5 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-[9px] font-bold cursor-help border border-gray-200" tooltipClassName="left-1/2 -translate-x-1/2 bottom-full mb-2 w-32 text-center" />
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="text-sm font-medium text-gray-700">Double Chips</label>
                    <InfoBubble content="Any instance where an initial chip or pitch failed to reach the putting surface, requiring a second chip." buttonClassName="w-3.5 h-3.5 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-[9px] font-bold cursor-help border border-gray-200" tooltipClassName="left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 text-center" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {/* Chip Inside 6ft */}
                  <div
                    className={`p-3 rounded-xl border-2 transition-all ${
                      roundData.chipInside6ft > 0
                        ? 'border-[#FFA500]'
                        : 'border-gray-200'
                    }`}
                    style={{
                      backgroundColor: roundData.chipInside6ft > 0 ? '#FFA500' : 'white'
                    }}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => decrementCounter('chipInside6ft')}
                        className="w-8 h-8 rounded-lg flex items-center justify-center border-2 transition-colors"
                        style={{
                          borderColor: roundData.chipInside6ft > 0 ? '#014421' : '#D1D5DB',
                          color: roundData.chipInside6ft > 0 ? '#014421' : '#6B7280',
                          minWidth: '32px',
                          minHeight: '32px'
                        }}
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span
                        className="text-xl font-bold w-10 text-center"
                        style={{ color: roundData.chipInside6ft > 0 ? '#014421' : '#111827' }}
                      >
                        {roundData.chipInside6ft}
                      </span>
                      <button
                        onClick={() => incrementCounter('chipInside6ft')}
                        className="w-8 h-8 rounded-lg flex items-center justify-center border-2 transition-colors"
                        style={{
                          borderColor: roundData.chipInside6ft > 0 ? '#014421' : '#D1D5DB',
                          color: roundData.chipInside6ft > 0 ? '#014421' : '#6B7280',
                          minWidth: '32px',
                          minHeight: '32px'
                        }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Double Chips */}
                  <div
                    className={`p-3 rounded-xl border-2 transition-all ${
                      roundData.doubleChips > 0
                        ? 'border-[#FFA500]'
                        : 'border-gray-200'
                    }`}
                    style={{
                      backgroundColor: roundData.doubleChips > 0 ? '#FFA500' : 'white'
                    }}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => decrementCounter('doubleChips')}
                        className="w-8 h-8 rounded-lg flex items-center justify-center border-2 transition-colors"
                        style={{
                          borderColor: roundData.doubleChips > 0 ? '#014421' : '#D1D5DB',
                          color: roundData.doubleChips > 0 ? '#014421' : '#6B7280',
                          minWidth: '32px',
                          minHeight: '32px'
                        }}
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span
                        className="text-xl font-bold w-10 text-center"
                        style={{ color: roundData.doubleChips > 0 ? '#014421' : '#111827' }}
                      >
                        {roundData.doubleChips}
                      </span>
                      <button
                        onClick={() => incrementCounter('doubleChips')}
                        className="w-8 h-8 rounded-lg flex items-center justify-center border-2 transition-colors"
                        style={{
                          borderColor: roundData.doubleChips > 0 ? '#014421' : '#D1D5DB',
                          color: roundData.doubleChips > 0 ? '#014421' : '#6B7280',
                          minWidth: '32px',
                          minHeight: '32px'
                        }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Putting Card */}
          <div className="bg-white rounded-2xl p-4 shadow-lg">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Putting</h2>
            
            <div className="space-y-4">
              {/* Putting Grid */}
              <div className="flex flex-col gap-2">
                {/* Row 1: Total Putts and 3-Putts */}
                <div className="flex flex-row justify-between gap-2">
                  {/* Total Putts */}
                  <div
                    className={`flex-1 p-2 rounded-xl border-2 transition-all ${
                      roundData.totalPutts > 0
                        ? 'border-[#FFA500]'
                        : 'border-gray-200'
                    }`}
                    style={{
                      backgroundColor: roundData.totalPutts > 0 ? '#FFA500' : 'white'
                    }}
                  >
                    <div className="flex items-center justify-center gap-1 mb-2">
                      <span className="text-[10px] font-medium text-center whitespace-nowrap" style={{ color: roundData.totalPutts > 0 ? '#014421' : '#6B7280' }}>
                        Total *
                      </span>
                      <InfoBubble
                        content="Only strokes taken once the ball is on the putting surface."
                        buttonClassName="w-3 h-3 rounded-full bg-white/50 flex items-center justify-center text-[8px] font-bold cursor-help border"
                        buttonStyle={{ borderColor: roundData.totalPutts > 0 ? '#014421' : '#E5E7EB', color: roundData.totalPutts > 0 ? '#014421' : '#9CA3AF' }}
                        tooltipClassName="left-1/2 -translate-x-1/2 bottom-full mb-2 w-32 text-center p-1.5"
                      />
                    </div>
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => updateField('totalPutts', Math.max(0, roundData.totalPutts - 1))}
                        className="w-7 h-7 rounded-md flex items-center justify-center border-2 transition-colors"
                        style={{
                          borderColor: roundData.totalPutts > 0 ? '#014421' : '#D1D5DB',
                          color: roundData.totalPutts > 0 ? '#014421' : '#6B7280',
                          minWidth: '28px',
                          minHeight: '28px'
                        }}
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span
                        className="text-sm font-bold w-6 text-center"
                        style={{ color: roundData.totalPutts > 0 ? '#014421' : '#111827' }}
                      >
                        {roundData.totalPutts}
                      </span>
                      <button
                        onClick={() => updateField('totalPutts', roundData.totalPutts + 1)}
                        className="w-7 h-7 rounded-md flex items-center justify-center border-2 transition-colors"
                        style={{
                          borderColor: roundData.totalPutts > 0 ? '#014421' : '#D1D5DB',
                          color: roundData.totalPutts > 0 ? '#014421' : '#6B7280',
                          minWidth: '28px',
                          minHeight: '28px'
                        }}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* 3-Putt Counter */}
                  <div
                    className={`flex-1 p-2 rounded-xl border-2 transition-all ${
                      roundData.threePutts > 0
                        ? 'border-[#FFA500]'
                        : 'border-gray-200'
                    }`}
                    style={{
                      backgroundColor: roundData.threePutts > 0 ? '#FFA500' : 'white'
                    }}
                  >
                    <div className="flex items-center justify-center gap-1 mb-2">
                      <span className="text-[10px] font-medium text-center whitespace-nowrap" style={{ color: roundData.threePutts > 0 ? '#014421' : '#6B7280' }}>
                        3-Putts
                      </span>
                      <InfoBubble
                        content="Any hole where 3 or more strokes were taken once the ball reached the putting surface."
                        buttonClassName="w-3 h-3 rounded-full bg-white/50 flex items-center justify-center text-[8px] font-bold cursor-help border"
                        buttonStyle={{ borderColor: roundData.threePutts > 0 ? '#014421' : '#E5E7EB', color: roundData.threePutts > 0 ? '#014421' : '#9CA3AF' }}
                        tooltipClassName="left-1/2 -translate-x-1/2 bottom-full mb-2 w-32 text-center p-1.5"
                      />
                    </div>
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => decrementCounter('threePutts')}
                        className="w-7 h-7 rounded-md flex items-center justify-center border-2 transition-colors"
                        style={{
                          borderColor: roundData.threePutts > 0 ? '#014421' : '#D1D5DB',
                          color: roundData.threePutts > 0 ? '#014421' : '#6B7280',
                          minWidth: '28px',
                          minHeight: '28px'
                        }}
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span
                        className="text-sm font-bold w-6 text-center"
                        style={{ color: roundData.threePutts > 0 ? '#014421' : '#111827' }}
                      >
                        {roundData.threePutts}
                      </span>
                      <button
                        onClick={() => incrementCounter('threePutts')}
                        className="w-7 h-7 rounded-md flex items-center justify-center border-2 transition-colors"
                        style={{
                          borderColor: roundData.threePutts > 0 ? '#014421' : '#D1D5DB',
                          color: roundData.threePutts > 0 ? '#014421' : '#6B7280',
                          minWidth: '28px',
                          minHeight: '28px'
                        }}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Row 2: < 6ft Group */}
                <div className="flex flex-row justify-between gap-2">
                  {/* Attempts */}
                  <div
                    className={`flex-1 p-2 rounded-xl border-2 transition-all ${
                      roundData.puttsUnder6ftAttempts > 0
                        ? 'border-[#FFA500]'
                        : 'border-gray-200'
                    }`}
                    style={{
                      backgroundColor: roundData.puttsUnder6ftAttempts > 0 ? '#FFA500' : 'white'
                    }}
                  >
                    <div className="flex items-center justify-center gap-1 mb-2">
                      <span className="text-[10px] font-medium text-center whitespace-nowrap" style={{ color: roundData.puttsUnder6ftAttempts > 0 ? '#014421' : '#6B7280' }}>
                        &lt; 6ft Att
                      </span>
                    </div>
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => decrementCounter('puttsUnder6ftAttempts')}
                        className="w-7 h-7 rounded-md flex items-center justify-center border-2 transition-colors"
                        style={{
                          borderColor: roundData.puttsUnder6ftAttempts > 0 ? '#014421' : '#D1D5DB',
                          color: roundData.puttsUnder6ftAttempts > 0 ? '#014421' : '#6B7280',
                          minWidth: '28px',
                          minHeight: '28px'
                        }}
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span
                        className="text-sm font-bold w-6 text-center"
                        style={{ color: roundData.puttsUnder6ftAttempts > 0 ? '#014421' : '#111827' }}
                      >
                        {roundData.puttsUnder6ftAttempts}
                      </span>
                      <button
                        onClick={() => incrementCounter('puttsUnder6ftAttempts')}
                        className="w-7 h-7 rounded-md flex items-center justify-center border-2 transition-colors"
                        style={{
                          borderColor: roundData.puttsUnder6ftAttempts > 0 ? '#014421' : '#D1D5DB',
                          color: roundData.puttsUnder6ftAttempts > 0 ? '#014421' : '#6B7280',
                          minWidth: '28px',
                          minHeight: '28px'
                        }}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  
                  {/* Made */}
                  <div
                    className={`flex-1 p-2 rounded-xl border-2 transition-all ${
                      roundData.made6ftAndIn > 0
                        ? 'border-[#FFA500]'
                        : 'border-gray-200'
                    }`}
                    style={{
                      backgroundColor: roundData.made6ftAndIn > 0 ? '#FFA500' : 'white'
                    }}
                  >
                    <div className="flex items-center justify-center gap-1 mb-2">
                      <span className="text-[10px] font-medium text-center whitespace-nowrap" style={{ color: roundData.made6ftAndIn > 0 ? '#014421' : '#6B7280' }}>
                        &lt; 6ft Made
                      </span>
                    </div>
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => decrementCounter('made6ftAndIn')}
                        className="w-7 h-7 rounded-md flex items-center justify-center border-2 transition-colors"
                        style={{
                          borderColor: roundData.made6ftAndIn > 0 ? '#014421' : '#D1D5DB',
                          color: roundData.made6ftAndIn > 0 ? '#014421' : '#6B7280',
                          minWidth: '28px',
                          minHeight: '28px'
                        }}
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span
                        className="text-sm font-bold w-6 text-center"
                        style={{ color: roundData.made6ftAndIn > 0 ? '#014421' : '#111827' }}
                      >
                        {roundData.made6ftAndIn}
                      </span>
                      <button
                        onClick={() => {
                          if (roundData.made6ftAndIn < roundData.puttsUnder6ftAttempts) {
                            incrementCounter('made6ftAndIn');
                          }
                        }}
                        className={`w-7 h-7 rounded-md flex items-center justify-center border-2 transition-colors ${
                          roundData.made6ftAndIn >= roundData.puttsUnder6ftAttempts ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                        style={{
                          borderColor: roundData.made6ftAndIn > 0 ? '#014421' : '#D1D5DB',
                          color: roundData.made6ftAndIn > 0 ? '#014421' : '#6B7280',
                          minWidth: '28px',
                          minHeight: '28px'
                        }}
                        disabled={roundData.made6ftAndIn >= roundData.puttsUnder6ftAttempts}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSaveRound}
            disabled={!isRequiredFilled || isSaving}
            className="w-full py-4 rounded-xl text-lg font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg mb-6"
            style={{ backgroundColor: '#FFA500' }}
          >
            {isSaving ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save Round
              </>
            )}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
