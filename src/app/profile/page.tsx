"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useStats } from "@/contexts/StatsContext";
import { createClient } from "@/lib/supabase/client";
import { updateProfile } from "./actions";
import Link from "next/link";
import { 
  Settings, 
  User, 
  Save, 
  Target, 
  Trophy, 
  Award, 
  Star, 
  Zap, 
  Flag,
  ArrowLeft,
  Check
} from "lucide-react";

// Golf-themed icons for selection
const GOLF_ICONS = [
  { id: 'target', name: 'Target', icon: Target, color: '#FFA500' },
  { id: 'trophy', name: 'Trophy', icon: Trophy, color: '#FFD700' },
  { id: 'award', name: 'Award', icon: Award, color: '#C0C0C0' },
  { id: 'star', name: 'Star', icon: Star, color: '#FFA500' },
  { id: 'zap', name: 'Zap', icon: Zap, color: '#FFA500' },
  { id: 'flag', name: 'Flag', icon: Flag, color: '#014421' },
];

export default function ProfilePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { rounds } = useStats();
  const [fullName, setFullName] = useState("");
  const [selectedIcon, setSelectedIcon] = useState<string>("target");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Get current handicap from latest round
  const getCurrentHandicap = () => {
    if (!rounds || rounds.length === 0) {
      return user?.initialHandicap || null;
    }
    const lastRound = rounds[rounds.length - 1];
    return lastRound?.handicap !== null && lastRound?.handicap !== undefined 
      ? lastRound.handicap 
      : user?.initialHandicap || null;
  };

  const currentHandicap = getCurrentHandicap();

  useEffect(() => {
    const loadProfile = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const supabase = createClient();
        // Only fetch the specific columns we need: full_name and profile_icon
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('full_name, profile_icon')
          .eq('id', user.id)
          .single();

        if (profileError) {
          console.error("Error loading profile:", profileError);
          // Fallback to user context data if available
          if (user.fullName) {
            setFullName(user.fullName);
          }
        } else {
          if (profile?.full_name) {
            setFullName(profile.full_name);
          } else if (user.fullName) {
            setFullName(user.fullName);
          }
          if (profile?.profile_icon) {
            setSelectedIcon(profile.profile_icon);
          }
        }
      } catch (err) {
        console.error("Error loading profile:", err);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    setError("");
    setSuccess(false);

    try {
      // Use server action to update profile and revalidate cache
      // Add timeout to prevent hanging
      const updatePromise = updateProfile(user.id, fullName.trim(), selectedIcon);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Request timeout")), 10000)
      );
      
      const result = await Promise.race([updatePromise, timeoutPromise]) as { success: boolean; error?: string };

      if (!result || !result.success) {
        throw new Error(result?.error || "Failed to update profile");
      }

      setSuccess(true);
      
      // Trigger a custom event to refresh AuthContext
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('profileUpdated'));
      }
      
      // Refresh the router cache and force navigation
      router.refresh();
      
      // Force a full page reload to bypass all caching
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 500);
      
    } catch (err: any) {
      console.error("Profile save error:", err);
      setError(err.message || "Failed to save profile");
    } finally {
      // Always set saving to false, even if there was an error or timeout
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#014421] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="max-w-md mx-auto bg-white min-h-screen">
        {/* Header */}
        <div className="px-5 pt-6 pb-4 border-b border-gray-200">
          <div className="flex items-center gap-3 mb-4">
            <Link
              href="/"
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div className="flex items-center gap-2">
              <Settings className="w-6 h-6 text-[#014421]" />
              <h1 className="text-2xl font-bold text-gray-900">Profile Settings</h1>
            </div>
          </div>
        </div>

        <div className="px-5 py-6 space-y-6">
          {/* Success Message */}
          {success && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
              <Check className="w-5 h-5 text-green-600" />
              <p className="text-sm text-green-800">Profile updated successfully!</p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Full Name Section */}
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-[#014421]" />
              Full Name
            </h2>
            <div className="relative">
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full pl-4 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#014421] focus:border-[#014421] outline-none transition-all"
                placeholder="Enter your full name"
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              This name will be displayed throughout the app
            </p>
          </div>

          {/* Icon Selector Section */}
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile Icon</h2>
            <p className="text-sm text-gray-600 mb-4">
              Choose an icon to represent you on leaderboards and in the app
            </p>
            <div className="grid grid-cols-3 gap-4">
              {GOLF_ICONS.map((iconData) => {
                const IconComponent = iconData.icon;
                const isSelected = selectedIcon === iconData.id;
                
                return (
                  <button
                    key={iconData.id}
                    onClick={() => setSelectedIcon(iconData.id)}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      isSelected
                        ? 'border-[#014421] bg-[#014421]/5'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div
                        className={`p-3 rounded-full ${
                          isSelected ? 'bg-[#014421]' : 'bg-gray-100'
                        }`}
                      >
                        <IconComponent
                          className={`w-6 h-6 ${
                            isSelected ? 'text-white' : 'text-gray-600'
                          }`}
                        />
                      </div>
                      <span className={`text-xs font-medium ${
                        isSelected ? 'text-[#014421]' : 'text-gray-600'
                      }`}>
                        {iconData.name}
                      </span>
                      {isSelected && (
                        <Check className="w-4 h-4 text-[#014421]" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Handicap Display Section */}
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Current Handicap</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold text-[#014421] mb-1">
                  {currentHandicap !== null && currentHandicap !== undefined
                    ? currentHandicap.toFixed(1)
                    : 'N/A'}
                </p>
                <p className="text-sm text-gray-600">
                  {currentHandicap !== null && currentHandicap !== undefined
                    ? `Max handicap: 54`
                    : 'Log a round to set your handicap'}
                </p>
              </div>
              <Link
                href="/log-round"
                className="px-4 py-2 bg-[#014421] text-white font-semibold rounded-lg hover:bg-[#01331a] transition-colors flex items-center gap-2"
              >
                <Target className="w-4 h-4" />
                Log Round
              </Link>
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="w-full py-3.5 bg-[#014421] text-white font-semibold rounded-lg hover:bg-[#01331a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Saving changes...</span>
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

