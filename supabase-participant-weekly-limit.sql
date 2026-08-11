-- 팀이 아닌 참여자 개인별로 주간 이용시간을 최대 4시간으로 제한합니다.
-- 한국시간 기준 월요일 00:00부터 다음 월요일 00:00까지 계산합니다.
-- Supabase Dashboard > SQL Editor에서 이 파일 전체를 한 번 실행하세요.

begin;

alter table public.reservation_members
add column if not exists member_email text;

-- 예약 생성 전에 각 참여자의 이번 주 누적시간을 확인하는 함수입니다.
create or replace function public.check_participant_weekly_hours(
  p_emails text[],
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns table (
  member_email text,
  used_hours numeric,
  requested_hours numeric,
  total_hours numeric,
  is_allowed boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with parameters as (
    select
      (
        date_trunc(
          'week',
          p_start_at at time zone 'Asia/Seoul'
        ) at time zone 'Asia/Seoul'
      ) as week_start,
      (
        (
          date_trunc(
            'week',
            p_start_at at time zone 'Asia/Seoul'
          ) + interval '7 days'
        ) at time zone 'Asia/Seoul'
      ) as week_end,
      greatest(
        extract(epoch from (p_end_at - p_start_at)) / 3600.0,
        0
      )::numeric as requested_hours
  ),
  supplied_emails as (
    select distinct lower(trim(supplied.input_email)) as member_email
    from unnest(coalesce(p_emails, array[]::text[]))
      as supplied(input_email)
    where nullif(trim(supplied.input_email), '') is not null
  ),
  calculated_usage as (
    select
      supplied.member_email,
      coalesce(
        (
          select sum(
            greatest(
              extract(
                epoch from (
                  reservation.end_at
                  + coalesce(
                    reservation.approved_extension_minutes,
                    0
                  ) * interval '1 minute'
                  - reservation.start_at
                )
              ) / 3600.0,
              0
            )
          )
          from public.reservation_members as member
          join public.reservations as reservation
            on reservation.id = member.reservation_id
          cross join parameters
          where lower(trim(member.member_email)) = supplied.member_email
            and reservation.status::text <> 'cancelled'
            and reservation.start_at >= parameters.week_start
            and reservation.start_at < parameters.week_end
        ),
        0
      )::numeric as used_hours,
      parameters.requested_hours
    from supplied_emails as supplied
    cross join parameters
  )
  select
    calculated.member_email,
    round(calculated.used_hours, 2) as used_hours,
    round(calculated.requested_hours, 2) as requested_hours,
    round(
      calculated.used_hours + calculated.requested_hours,
      2
    ) as total_hours,
    calculated.used_hours + calculated.requested_hours <= 4
      as is_allowed
  from calculated_usage as calculated
  order by calculated.member_email;
$$;

revoke all on function public.check_participant_weekly_hours(
  text[],
  timestamptz,
  timestamptz
) from public;

grant execute on function public.check_participant_weekly_hours(
  text[],
  timestamptz,
  timestamptz
) to authenticated;

-- 브라우저 검사를 우회해 직접 참여자를 저장해도 4시간을 넘지 못하게 합니다.
create or replace function public.enforce_participant_weekly_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start_at timestamptz;
  v_effective_end_at timestamptz;
  v_status text;
  v_week_start timestamptz;
  v_week_end timestamptz;
  v_used_hours numeric := 0;
  v_requested_hours numeric := 0;
begin
  new.member_email := lower(trim(coalesce(new.member_email, '')));

  select
    reservation.start_at,
    reservation.end_at
      + coalesce(reservation.approved_extension_minutes, 0)
      * interval '1 minute',
    reservation.status::text
  into
    v_start_at,
    v_effective_end_at,
    v_status
  from public.reservations as reservation
  where reservation.id = new.reservation_id;

  if not found then
    raise exception '예약 정보를 찾을 수 없습니다.'
      using errcode = '23503';
  end if;

  if v_status = 'cancelled' then
    return new;
  end if;

  v_week_start := (
    date_trunc(
      'week',
      v_start_at at time zone 'Asia/Seoul'
    ) at time zone 'Asia/Seoul'
  );
  v_week_end := (
    (
      date_trunc(
        'week',
        v_start_at at time zone 'Asia/Seoul'
      ) + interval '7 days'
    ) at time zone 'Asia/Seoul'
  );
  v_requested_hours := greatest(
    extract(epoch from (v_effective_end_at - v_start_at)) / 3600.0,
    0
  );

  select coalesce(
    sum(
      greatest(
        extract(
          epoch from (
            reservation.end_at
            + coalesce(
              reservation.approved_extension_minutes,
              0
            ) * interval '1 minute'
            - reservation.start_at
          )
        ) / 3600.0,
        0
      )
    ),
    0
  )
  into v_used_hours
  from public.reservation_members as member
  join public.reservations as reservation
    on reservation.id = member.reservation_id
  where lower(trim(member.member_email)) = new.member_email
    and reservation.id <> new.reservation_id
    and reservation.status::text <> 'cancelled'
    and reservation.start_at >= v_week_start
    and reservation.start_at < v_week_end;

  if v_used_hours + v_requested_hours > 4 then
    raise exception
      '참여자 %의 주간 이용시간이 4시간을 초과합니다. 기존 %시간 + 신청 %시간',
      new.member_email,
      round(v_used_hours, 2),
      round(v_requested_hours, 2)
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trigger_enforce_participant_weekly_limit
on public.reservation_members;

create trigger trigger_enforce_participant_weekly_limit
before insert or update of member_email, reservation_id
on public.reservation_members
for each row
execute function public.enforce_participant_weekly_limit();

commit;
