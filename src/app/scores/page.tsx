"use client";

import { useState, useEffect } from "react";
import { useStats } from "@/contexts/StatsContext";
import { ArrowLeft, Trophy, TrendingUp, Star, TrendingDown } from "lucide-react";
import { useRouter } from "next/navigation";

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
  puttsUnder6ftAttempts: number;
}

interface RoundWithBadge extends RoundData {
  badge?: {
    text: string;
    type: 'best' | 'improved' | 'consistent';
  };
  handicapChange?: number;
  previousHandicap?: number;
}

export default function ScoresPage() {
  const router = useRouter();
  const { rounds } = useStats();
  const [sortedRounds, setSortedRounds] = useState<RoundWithBadge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (rounds.length === 0) {
      setLoading(false);
      return;
    }

    // Sort rounds by date (newest first)
    const sorted = [...rounds].sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    // Calculate badges and handicap changes
    const roundsWithBadges: RoundWithBadge[] = sorted.map((round, index) => {
      const roundWithBadge: RoundWithBadge = { ...round };

      // Calculate handicap change
      if (index < sorted.length - 1 && round.handicap !== null) {
        const previousRound = sorted[index + 1];
        if (previousRound.handicap !== null) {
          roundWithBadge.previousHandicap = previousRound.handicap;
          roundWithBadge.handicapChange = round.handicap - previousRound.handicap;
        }
      }

      // Determine performance badge
      if (round.score !== null) {
        // Check if this is a personal best (lowest score)
        const allScores = sorted
          .map(r => r.score)
          .filter((s): s is number => s !== null);
        
        if (allScores.length > 0) {
          const bestScore = Math.min(...allScores);
          if (round.score === bestScore) {
            roundWithBadge.badge = {
              text: 'Personal Best',
              type: 'best',
            };
          } else if (index < sorted.length - 1) {
            // Compare with previous round (chronologically older, which is index + 1)
            const previousRound = sorted[index + 1];
            if (previousRound.score !== null) {
              const scoreDifference = previousRound.score - round.score;
              if (scoreDifference > 0) {
                roundWithBadge.badge = {
                  text: `Improved ${scoreDifference} ${scoreDifference === 1 ? 'stroke' : 'strokes'}`,
                  type: 'improved',
                };
              } else if (scoreDifference === 0) {
                roundWithBadge.badge = {
                  text: 'Consistent Performance',
                  type: 'consistent',
                };
              }
            }
          }
        }
      }

      return roundWithBadge;
    });

    setSortedRounds(roundsWithBadges);
    setLoading(false);
  }, [rounds]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    } else if (diffInDays === 1) {
      return 'Yesterday';
    } else if (diffInDays < 7) {
      return `${diffInDays}d ago`;
    } else {
      return formatDate(dateString);
    }
  };

  const getIcon = (round: RoundWithBadge) => {
    if (round.badge?.type === 'best') {
      return <Trophy className="w-5 h-5" style={{ color: '#014421' }} />;
    } else if (round.badge?.type === 'improved') {
      return <TrendingUp className="w-5 h-5" style={{ color: '#014421' }} />;
    } else if (round.badge?.type === 'consistent') {
      return <Star className="w-5 h-5" style={{ color: '#014421' }} />;
    }
    return <Star className="w-5 h-5" style={{ color: '#014421' }} />;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 pb-24 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#014421] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading scores...</p>
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
          <h1 className="text-2xl font-bold text-gray-900">My Rounds</h1>
        </div>

        {/* Scores List */}
        <div className="px-5 py-6">
          {sortedRounds.length === 0 ? (
            /* Empty State */
            <div className="text-center py-12">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(1, 68, 33, 0.1)' }}>
                <Trophy className="w-10 h-10" style={{ color: '#014421' }} />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">No rounds yet</h2>
              <p className="text-gray-600 text-sm mb-6">
                Log your first round to start tracking your progress!
              </p>
              <button
                onClick={() => router.push('/log-round')}
                className="inline-block px-6 py-3 rounded-lg font-semibold text-white transition-all hover:shadow-lg"
                style={{ backgroundColor: '#014421' }}
              >
                Log Your First Round
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedRounds.map((round, index) => {
                // Update Key Logic: Change the key to use round.id if available, otherwise use date-index combination
                const roundDate = round.date || new Date().toISOString().split('T')[0];
                const uniqueKey = round?.id ? `round-${round.id}` : `round-${roundDate}-${index}`;
                
                return (
                <div
                  key={uniqueKey}
                  className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {getIcon(round)}
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-800 font-medium truncate">
                        {round.course || 'Unknown Course'}
                      </p>
                      <p className="text-gray-400 text-sm">
                        {formatDate(round.date)}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {round.badge && (
                          <span
                            className="text-xs px-2 py-0.5 rounded whitespace-nowrap"
                            style={{
                              backgroundColor: 'rgba(255, 165, 0, 0.2)',
                              color: '#FF8C00',
                            }}
                          >
                            {round.badge.text}
                          </span>
                        )}
                        {round.handicapChange !== undefined && round.handicapChange !== 0 && (
                          <span
                            className="text-xs font-medium"
                            style={{ 
                              color: round.handicapChange < 0 ? '#16a34a' : '#dc2626' 
                            }}
                          >
                            HCP: {round.handicapChange > 0 ? '+' : ''}
                            {round.handicapChange.toFixed(1)}
                          </span>
                        )}
                        <span className="text-gray-400 text-xs">
                          • {getTimeAgo(round.date)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end ml-3">
                    {round.score !== null ? (
                      <>
                        <p
                          className="text-2xl font-bold"
                          style={{ color: '#FFA500' }}
                        >
                          {round.score}
                        </p>
                        {round.handicap !== null && (
                          <p className="text-xs text-gray-500 mt-1">
                            HCP {round.handicap.toFixed(1)}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-gray-400">No score</p>
                    )}
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

