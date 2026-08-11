import { createClient } from
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// reservation-graduate 전용 Supabase 설정입니다.
// reservation-student 프로젝트의 URL/Key로 교체하지 마세요.
const supabaseUrl =
  "https://aiisywurrvvipihwklcd.supabase.co";

const supabasePublishableKey =
  "sb_publishable_4gWGQfB_N49el7t6v6UPUg_jeQjCAZh";

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
