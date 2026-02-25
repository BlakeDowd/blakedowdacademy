"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, TrendingDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface HandicapHistoryRow {
  id: string;
  user_id: string;
  date?: string;
  score: number | null;
  new_handicap: number;
  created_at: string;
}

export default function HandicapHistoryPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading } = useAuth();
  
  const [history, setHistory] = useState<HandicapHistoryRow[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push("/login");
      return;
    }

    if (user?.id) {
      fetchHandicapHistory();
    }
  }, [user?.id, isAuthenticated, loading, router]);

  const fetchHandicapHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const supabase = createClient();
      
      // Verify session directly from Supabase for maximum security
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user?.id) {
        console.error('No authenticated session found for fetch');
        setHistory([]);
        return;
      }
      
      const { data, error } = await supabase
        .from('handicap_history')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
        
      if (error) {
        console.error(`Error fetching handicap history: ${error?.message || JSON.stringify(error)}`);
        console.error('Error details:', error?.details, error?.hint);
        setHistory([]);
      } else if (data) {
        setHistory(data);
      }
    } catch (err) {
      console.error('Failed to fetch handicap history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#014421] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const currentHandicap = user?.currentHandicap ?? user?.startingHandicap;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white px-5 py-4 flex items-center justify-between sticky top-0 z-10 border-b border-gray-100">
        <button 
          onClick={() => router.push('/')}
          className="p-2 -ml-2 rounded-full hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft className="w-6 h-6 text-gray-800" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Handicap History</h1>
        <div className="w-10"></div> {/* Spacer for centering */}
      </div>

      <div className="px-5 py-6 max-w-lg mx-auto">
        
        {/* Current Handicap Summary */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 mb-6 flex flex-col items-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3 bg-orange-50">
            <TrendingDown className="w-6 h-6 text-[#FFA500]" />
          </div>
          <h2 className="text-gray-500 text-sm font-medium mb-1">Current Handicap</h2>
          <p className="text-4xl font-bold" style={{ color: '#FFA500', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            {currentHandicap !== null && currentHandicap !== undefined ? Number(currentHandicap).toFixed(1) : '--'}
          </p>
          {user?.startingHandicap !== undefined && user?.startingHandicap !== null && (
            <p className="text-gray-400 text-xs mt-2">Starting Handicap: {Number(user.startingHandicap).toFixed(1)}</p>
          )}
        </div>

        {/* History Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-50 bg-gray-50/50">
            <h3 className="font-semibold text-gray-800">History Log</h3>
          </div>
          
          {isLoadingHistory ? (
            <div className="p-8 flex justify-center">
              <div className="w-6 h-6 border-2 border-[#014421] border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : history.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/50 text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100">
                    <th className="p-3 font-medium">Date</th>
                    <th className="p-3 font-medium text-center">Score</th>
                    <th className="p-3 font-medium text-right">Handicap</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {history.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="p-3 text-sm text-gray-800">
                        {new Date(row.created_at || new Date()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="p-3 text-sm text-center font-medium text-gray-700">
                        {row.score !== null ? row.score : '--'}
                      </td>
                      <td className="p-3 text-sm text-right font-bold" style={{ color: '#014421' }}>
                        {row.new_handicap.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center">
              <p className="text-gray-500 text-sm">No handicap history recorded yet.</p>
              <p className="text-gray-400 text-xs mt-2">Log a round to see your handicap history.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
