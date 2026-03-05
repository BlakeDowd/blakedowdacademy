"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { User, CheckCircle2 } from "lucide-react";

export default function FinishProfile() {
  const { user, isAuthenticated, loading, profileLoading, refreshUser } = useAuth();
  const router = useRouter();
  
  const [fullName, setFullName] = useState("");
  const [handicap, setHandicap] = useState("18");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // If not authenticated or still loading, do nothing
    if (loading || profileLoading) return;
    
    if (!isAuthenticated || !user) {
      router.push("/login");
      return;
    }

    // Pre-fill the full name if it's available and not just 'User'
    if (user.fullName && user.fullName !== 'User') {
      setFullName(user.fullName);
    }
  }, [user, isAuthenticated, loading, profileLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setError("");
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      
      const parsedHandicap = parseInt(handicap, 10);
      if (isNaN(parsedHandicap)) {
        throw new Error("Please enter a valid number for your handicap.");
      }

      // Update the profile row
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          handicap: parsedHandicap,
          starting_handicap: parsedHandicap,
        })
        .eq('id', user.id);

      if (error) {
        alert(`Database Error: ${error.message}`);
        setIsSubmitting(false);
        return;
      }

      if (!error) {
        // Make sure the handicap is also recorded in the handicap_history table
        const { error: historyError } = await supabase
          .from('handicap_history')
          .insert({
            user_id: user.id,
            score: 0,
            new_handicap: parsedHandicap,
            created_at: new Date().toISOString()
          });

        if (historyError) {
          console.warn('Failed to insert initial handicap history, continuing anyway:', historyError);
        }

        // Refresh the session and context so it has the new name/handicap
        await supabase.auth.refreshSession();
        await refreshUser();
        
        // Force a router refresh (panic redirect to / removed - stay on page)
        router.refresh();
      }
    } catch (err: any) {
      console.error("Error updating profile:", err);
      setError(err.message || "Failed to complete setup. Please try again.");
      setIsSubmitting(false);
    }
  };

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#014421]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FFA500]"></div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden"
      style={{ 
        backgroundColor: '#014421',
        backgroundImage: 'linear-gradient(135deg, rgba(1, 68, 33, 0.95) 0%, rgba(1, 90, 46, 0.95) 100%)'
      }}
    >
      <div 
        className="absolute inset-0"
        style={{ background: 'linear-gradient(to bottom right, rgba(20, 83, 45, 0.2), rgba(22, 101, 52, 0.2))' }}
      />
      
      <div className="relative z-10 w-full max-w-md px-4">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img src="/logo.png" alt="Logo" className="h-12 w-auto object-contain" />
          </div>
          <div 
            className="text-4xl font-bold mb-2"
            style={{ 
              color: '#FFA500',
              fontFamily: 'Georgia, serif',
            }}
          >
            Complete Setup
          </div>
          <p className="text-white/80 text-sm">
            We need a few details to customize your experience
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {error && (
            <div className="mb-4 p-3 border rounded-lg bg-red-50 border-red-200">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#014421] focus:border-[#014421] outline-none transition-all"
                  placeholder="John Doe"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="handicap" className="block text-sm font-medium text-gray-700 mb-1.5">
                Current Handicap
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="handicap"
                  type="number"
                  value={handicap}
                  onChange={(e) => setHandicap(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#014421] focus:border-[#014421] outline-none transition-all"
                  placeholder="e.g. 18"
                  min="0"
                  max="54"
                  step="0.1"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !fullName}
              className={`w-full flex items-center justify-center py-3.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white transition-all ${
                isSubmitting || !fullName 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-[#014421] hover:bg-[#013318] hover:shadow-lg transform hover:-translate-y-0.5'
              }`}
            >
              {isSubmitting ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Saving...
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[#FFA500]">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Complete Setup</span>
                </div>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}