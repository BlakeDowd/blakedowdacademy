"use client";

import { createClient } from "@/lib/supabase/client";

export default function DashboardLogOutButton() {
  const handleLogOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  return (
    <button
      onClick={handleLogOut}
      className="w-full p-4 bg-gray-100 text-gray-600 rounded-lg mt-10 mb-6 hover:bg-gray-200"
    >
      Log Out
    </button>
  );
}

