-- 관리자가 예약 상세화면에서 참여자 정보를 조회할 수 있도록 허용합니다.
-- Supabase Dashboard > SQL Editor에서 전체 내용을 한 번 실행하세요.

drop policy if exists "reservation_members_select_by_admin"
on public.reservation_members;

create policy "reservation_members_select_by_admin"
on public.reservation_members
for select
to authenticated
using (
  exists (
    select 1
    from public.user_roles as user_role
    where user_role.user_id = auth.uid()
      and user_role.role::text = 'admin'
  )
);
