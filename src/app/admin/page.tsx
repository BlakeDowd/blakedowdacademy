"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { Save, Loader2 } from "lucide-react";

// Admin email - update this to your email
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "your-email@example.com";

export default function AdminPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  
  const [formData, setFormData] = useState({
    title: "",
    category: "",
    videoUrl: "",
  });

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/login");
      return;
    }

    // Check if user is admin
    if (user.email && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      setIsAuthorized(true);
      setCheckingAuth(false);
    } else {
      // Redirect non-admin users to home
      router.push("/");
    }
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess(false);

    try {
      const supabase = createClient();

      // Insert drill into Supabase
      const { data, error: insertError } = await supabase
        .from("drills")
        .insert({
          title: formData.title,
          category: formData.category,
          source: formData.videoUrl,
          type: "video",
          description: "", // Optional field
          xp_value: 50, // Default XP value
          estimated_minutes: 10, // Default minutes
          level: "Foundation", // Default level
          access_type: "free", // Default access type
          complexity: 2, // Default complexity
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(insertError.message || "Failed to save drill");
      }

      setSuccess(true);
      setFormData({ title: "", category: "", videoUrl: "" });
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || "An error occurred while saving");
    } finally {
      setSaving(false);
    }
  };

  if (checkingAuth || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#014421] mx-auto mb-4" />
          <p className="text-gray-600">Checking authorization...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
          <p className="text-gray-600 mb-8">Add new drills to the library</p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title Field */}
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                Title *
              </label>
              <input
                id="title"
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#014421] focus:border-[#014421] outline-none transition-all"
                placeholder="e.g., Mastering Your Short Game"
                required
              />
            </div>

            {/* Category Field */}
            <div>
              <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-2">
                Category *
              </label>
              <input
                id="category"
                type="text"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#014421] focus:border-[#014421] outline-none transition-all"
                placeholder="e.g., Short Game, Driving, Putting"
                required
              />
            </div>

            {/* Video URL Field */}
            <div>
              <label htmlFor="videoUrl" className="block text-sm font-medium text-gray-700 mb-2">
                Video URL *
              </label>
              <input
                id="videoUrl"
                type="url"
                value={formData.videoUrl}
                onChange={(e) => setFormData({ ...formData, videoUrl: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#014421] focus:border-[#014421] outline-none transition-all"
                placeholder="e.g., https://www.youtube.com/embed/VIDEO_ID"
                required
              />
              <p className="mt-2 text-sm text-gray-500">
                Use YouTube embed URL format: https://www.youtube.com/embed/VIDEO_ID
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-600">Drill saved successfully!</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 px-6 rounded-lg font-semibold text-white transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ backgroundColor: '#014421' }}
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Save Drill
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

