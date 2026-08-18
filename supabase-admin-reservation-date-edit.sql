-- 관리자 페이지의 예약 시작일·종료일 변경 기능
-- 기존 프로젝트에서는 Supabase SQL Editor에서 이 파일 전체를 한 번 실행하세요.

begin;

create or replace function public.admin_update_reservation_dates(
  p_reservation_id uuid,
  p_start_date date,
  p_end_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation_mode text;
  v_status text;
  v_room_number smallint;
  v_approved_extension_minutes integer;
  v_old_start_local timestamp without time zone;
  v_old_end_local timestamp without time zone;
  v_new_start_at timestamptz;
  v_new_end_at timestamptz;
  v_new_effective_end_at timestamptz;
  v_lock_room integer;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.'
      using errcode = '42501';
  end if;

  if not public.is_admin() then
    raise exception '관리자만 예약 날짜를 변경할 수 있습니다.'
      using errcode = '42501';
  end if;

  if p_reservation_id is null then
    raise exception '변경할 예약을 선택해 주세요.'
      using errcode = '22023';
  end if;

  if p_start_date is null or p_end_date is null then
    raise exception '시작 날짜와 종료 날짜를 모두 선택해 주세요.'
      using errcode = '22023';
  end if;

  if p_end_date < p_start_date then
    raise exception '종료 날짜는 시작 날짜 이후여야 합니다.'
      using errcode = '23514';
  end if;

  select
    coalesce(reservation.reservation_mode::text, 'hourly'),
    reservation.status::text,
    reservation.room_number,
    coalesce(reservation.approved_extension_minutes, 0),
    reservation.start_at at time zone 'Asia/Seoul',
    reservation.end_at at time zone 'Asia/Seoul'
  into
    v_reservation_mode,
    v_status,
    v_room_number,
    v_approved_extension_minutes,
    v_old_start_local,
    v_old_end_local
  from public.reservations as reservation
  where reservation.id = p_reservation_id
  for update;

  if not found then
    raise exception '변경할 예약을 찾을 수 없습니다.'
      using errcode = 'P0002';
  end if;

  if v_status in ('cancelled', 'completed') then
    raise exception '완료되거나 취소된 예약은 날짜를 변경할 수 없습니다.'
      using errcode = '23514';
  end if;

  if v_reservation_mode = 'date_range' then
    if p_end_date - p_start_date > 4 then
      raise exception '한 번에 최대 연속 평일 5일까지 선택할 수 있습니다.'
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from generate_series(
        p_start_date::timestamp,
        p_end_date::timestamp,
        interval '1 day'
      ) as selected_dates(selected_date)
      where extract(isodow from selected_date) not between 1 and 5
    ) then
      raise exception '토요일과 일요일을 포함한 기간은 예약할 수 없습니다.'
        using errcode = '23514';
    end if;

    v_new_start_at := (
      p_start_date + time '10:00'
    ) at time zone 'Asia/Seoul';
    v_new_end_at := (
      p_end_date + time '18:00'
    ) at time zone 'Asia/Seoul';
  else
    if p_start_date <> p_end_date then
      raise exception '기존 시간 예약은 시작 날짜와 종료 날짜를 같은 날로 선택해 주세요.'
        using errcode = '23514';
    end if;

    v_new_start_at := (
      p_start_date + v_old_start_local::time
    ) at time zone 'Asia/Seoul';
    v_new_end_at := (
      p_end_date + v_old_end_local::time
    ) at time zone 'Asia/Seoul';
  end if;

  v_new_effective_end_at :=
    v_new_end_at
    + v_approved_extension_minutes * interval '1 minute';

  -- 신규 예약 함수와 같은 호실 잠금을 사용해 동시에 저장되는 중복 예약도 막습니다.
  -- 호실 정보가 없던 기존 예약은 모든 호실을 막으므로 전체 호실 잠금을 순서대로 획득합니다.
  if v_room_number is null then
    foreach v_lock_room in array array[602, 603, 702, 703, 704, 705, 708]
    loop
      perform pg_advisory_xact_lock(
        hashtextextended(
          'graduate-room-date-range-' || v_lock_room::text,
          0
        )
      );
    end loop;
  else
    perform pg_advisory_xact_lock(
      hashtextextended(
        'graduate-room-date-range-' || v_room_number::text,
        0
      )
    );
  end if;

  if exists (
    select 1
    from public.reservations as other_reservation
    where other_reservation.id <> p_reservation_id
      and other_reservation.status::text <> 'cancelled'
      and (
        v_room_number is null
        or other_reservation.room_number is null
        or other_reservation.room_number = v_room_number
      )
      and other_reservation.start_at < v_new_effective_end_at
      and other_reservation.effective_end_at > v_new_start_at
  ) then
    raise exception '선택한 기간에 같은 호실의 기존 예약이 있습니다.'
      using errcode = '23P01';
  end if;

  update public.reservations
  set
    start_at = v_new_start_at,
    end_at = v_new_end_at
  where id = p_reservation_id;

  -- 변경된 기간 밖의 기존 퇴실 기록만 정리하고, 겹치는 날짜의 기록은 보존합니다.
  if to_regclass('public.reservation_daily_checkouts') is not null then
    execute
      'delete from public.reservation_daily_checkouts
       where reservation_id = $1
         and (checkout_date < $2 or checkout_date > $3)'
    using p_reservation_id, p_start_date, p_end_date;
  end if;

  return p_reservation_id;
end;
$$;

revoke all on function public.admin_update_reservation_dates(
  uuid,
  date,
  date
) from public;

grant execute on function public.admin_update_reservation_dates(
  uuid,
  date,
  date
) to authenticated;

commit;
