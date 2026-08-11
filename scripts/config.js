import { createClient } from
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const supabaseUrl =
  "https://lnbqbtoqcajqwhupkvid.supabase.co";

const supabasePublishableKey =
  "sb_publishable__0ybYkAl9p4aOLw5yV6Fag_ey8qQ3Oq";

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
);

export async function getCurrentUser() {
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    window.location.href = "./login.html";
    return null;
  }

  return user;
}

export async function checkApproved(userId) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role, is_approved")
    .eq("user_id", userId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function logout() {
  await supabase.auth.signOut();
  window.location.href = "./login.html";
}
