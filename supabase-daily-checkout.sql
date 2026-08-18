-- 학부실험실 내 예약 페이지의 날짜별 안전수칙 확인 및 퇴실 기능
-- 기존 프로젝트에서는 Supabase SQL Editor에서 이 파일 전체를 한 번 실행하세요.

begin;

create table if not exists public.reservation_daily_checkouts (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null
    references public.reservations(id) on delete cascade,
  checkout_date date not null,
  checked_by uuid not null,
  lights_off boolean not null,
  equipment_off boolean not null,
  doors_locked boolean not null,
  area_clean boolean not null,
  completed_at timestamptz not null default now(),
  constraint reservation_daily_checkouts_all_rules_check
    check (
      lights_off
      and equipment_off
      and doors_locked
      and area_clean
    )
);

create unique index if not exists
reservation_daily_checkouts_reservation_date_unique
on public.reservation_daily_checkouts (
  reservation_id,
  checkout_date
);

create index if not exists
reservation_daily_checkouts_checked_by_idx
on public.reservation_daily_checkouts (checked_by);

alter table public.reservation_daily_checkouts
enable row level security;

drop policy if exists "daily_checkouts_select_owner_or_admin"
on public.reservation_daily_checkouts;

create policy "daily_checkouts_select_owner_or_admin"
on public.reservation_daily_checkouts
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.reservations as reservation
    join public.teams as team
      on team.id = reservation.team_id
    where reservation.id = reservation_daily_checkouts.reservation_id
      and team.leader_id = auth.uid()
  )
);

grant select
on public.reservation_daily_checkouts
to authenticated;

revoke insert, update, delete
on public.reservation_daily_checkouts
from anon, authenticated;

create or replace function public.complete_my_daily_checkout(
  p_reservation_id uuid,
  p_checkout_date date,
  p_lights_off boolean,
  p_equipment_off boolean,
  p_doors_locked boolean,
  p_area_clean boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_checkout_id uuid;
  v_start_date date;
  v_end_date date;
  v_today date;
  v_approval_status text;
  v_reservation_status text;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.'
      using errcode = '42501';
  end if;

  select
    (reservation.start_at at time zone 'Asia/Seoul')::date,
    (reservation.end_at at time zone 'Asia/Seoul')::date,
    coalesce(reservation.approval_status::text, 'approved'),
    reservation.status::text
  into
    v_start_date,
    v_end_date,
    v_approval_status,
    v_reservation_status
  from public.reservations as reservation
  join public.teams as team
    on team.id = reservation.team_id
  where reservation.id = p_reservation_id
    and team.leader_id = auth.uid();

  if not found then
    raise exception '본인의 예약 정보를 찾을 수 없습니다.'
      using errcode = '42501';
  end if;

  if v_reservation_status = 'cancelled' then
    raise exception '취소된 예약은 퇴실 처리할 수 없습니다.'
      using errcode = '23514';
  end if;

  if v_approval_status <> 'approved' then
    raise exception '승인된 예약만 퇴실 처리할 수 있습니다.'
      using errcode = '23514';
  end if;

  if p_checkout_date is null
    or p_checkout_date < v_start_date
    or p_checkout_date > v_end_date
    or extract(isodow from p_checkout_date) not between 1 and 5 then
    raise exception '해당 예약에 포함된 평일만 퇴실 처리할 수 있습니다.'
      using errcode = '23514';
  end if;

  v_today := (now() at time zone 'Asia/Seoul')::date;

  if p_checkout_date <> v_today then
    raise exception '퇴실 처리는 해당 예약 날짜 당일에만 가능합니다.'
      using errcode = '23514';
  end if;

  if not (
    coalesce(p_lights_off, false)
    and coalesce(p_equipment_off, false)
    and coalesce(p_doors_locked, false)
    and coalesce(p_area_clean, false)
  ) then
    raise exception '안전수칙을 모두 확인한 후 퇴실해 주세요.'
      using errcode = '23514';
  end if;

  insert into public.reservation_daily_checkouts (
    reservation_id,
    checkout_date,
    checked_by,
    lights_off,
    equipment_off,
    doors_locked,
    area_clean
  )
  values (
    p_reservation_id,
    p_checkout_date,
    auth.uid(),
    true,
    true,
    true,
    true
  )
  on conflict (reservation_id, checkout_date)
  do nothing
  returning id into v_checkout_id;

  if v_checkout_id is null then
    select checkout.id
    into v_checkout_id
    from public.reservation_daily_checkouts as checkout
    where checkout.reservation_id = p_reservation_id
      and checkout.checkout_date = p_checkout_date;
  end if;

  return v_checkout_id;
end;
$$;

revoke all on function public.complete_my_daily_checkout(
  uuid,
  date,
  boolean,
  boolean,
  boolean,
  boolean
) from public;

grant execute on function public.complete_my_daily_checkout(
  uuid,
  date,
  boolean,
  boolean,
  boolean,
  boolean
) to authenticated;

commit;
