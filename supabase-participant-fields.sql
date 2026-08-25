-- 예약 단계에서 참여자 이름·학번·이메일을 저장할 수 있도록 설정합니다.
-- Supabase Dashboard > SQL Editor에서 전체 내용을 한 번 실행하세요.

-- 예약을 만든 사용자가 참여자 정보를 등록하고 수정할 수 있도록 설정합니다.
drop policy if exists "reservation_members_select_by_team_leader"
on public.reservation_members;

create policy "reservation_members_select_by_team_leader"
on public.reservation_members
for select
to authenticated
using (
  exists (
    select 1
    from public.reservations r
    join public.teams t on t.id = r.team_id
    where r.id = reservation_members.reservation_id
      and t.leader_id = auth.uid()
  )
);

drop policy if exists "reservation_members_insert_by_team_leader"
on public.reservation_members;

create policy "reservation_members_insert_by_team_leader"
on public.reservation_members
for insert
to authenticated
with check (
  exists (
    select 1
    from public.reservations r
    join public.teams t on t.id = r.team_id
    where r.id = reservation_members.reservation_id
      and t.leader_id = auth.uid()
  )
);

drop policy if exists "reservation_members_update_by_team_leader"
on public.reservation_members;

create policy "reservation_members_update_by_team_leader"
on public.reservation_members
for update
to authenticated
using (
  exists (
    select 1
    from public.reservations r
    join public.teams t on t.id = r.team_id
    where r.id = reservation_members.reservation_id
      and t.leader_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.reservations r
    join public.teams t on t.id = r.team_id
    where r.id = reservation_members.reservation_id
      and t.leader_id = auth.uid()
  )
);
