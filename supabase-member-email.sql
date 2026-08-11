-- 예약자 및 참여자 이메일 저장·검증과 이메일 로그인을 위한 마이그레이션입니다.
-- Supabase Dashboard > SQL Editor에서 이 파일 전체를 한 번 실행하세요.

begin;

alter table public.reservations
add column if not exists requester_email text;

alter table public.reservation_members
add column if not exists member_email text;

-- 기존 참여자는 학번이 일치하는 회원정보가 있으면 이메일을 자동으로 채웁니다.
update public.reservation_members as member
set member_email = lower(trim(profile.email))
from public.profiles as profile
where member.member_email is null
  and member.student_id = profile.student_id
  and nullif(trim(profile.email), '') is not null;

-- 기존 학번 기반 계정과 신규 이메일 기반 계정을 모두 이메일로 로그인할 수 있게 합니다.
create or replace function public.resolve_login_email(p_email text)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    (
      select auth_user.email
      from public.profiles as profile
      join auth.users as auth_user on auth_user.id = profile.id
      where lower(trim(profile.email)) = lower(trim(p_email))
      limit 1
    ),
    lower(trim(p_email))
  );
$$;

revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

-- 입력한 이메일마다 가입 여부를 반환합니다.
create or replace function public.check_registered_participant_emails(
  p_emails text[]
)
returns table (
  member_email text,
  is_registered boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    lower(trim(supplied.input_email)) as member_email,
    exists (
      select 1
      from public.profiles as profile
      where lower(trim(profile.email)) = lower(trim(supplied.input_email))
    ) as is_registered
  from unnest(coalesce(p_emails, array[]::text[]))
    as supplied(input_email);
$$;

revoke all on function public.check_registered_participant_emails(text[])
from public;
grant execute on function public.check_registered_participant_emails(text[])
to authenticated;

-- reservation_members에 새로 저장되는 이메일은 반드시 가입된 이메일이어야 합니다.
create or replace function public.require_registered_member_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.member_email := lower(trim(coalesce(new.member_email, '')));

  if new.member_email = '' or not exists (
    select 1
    from public.profiles as profile
    where lower(trim(profile.email)) = new.member_email
  ) then
    raise exception '가입되지 않은 이메일입니다: %', new.member_email
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trigger_require_registered_member_email
on public.reservation_members;

create trigger trigger_require_registered_member_email
before insert or update of member_email
on public.reservation_members
for each row
execute function public.require_registered_member_email();

-- 예약 소유권, 인원수, 중복값과 가입 이메일을 확인한 뒤 한 번에 저장합니다.
create or replace function public.save_verified_reservation_participants(
  p_reservation_id text,
  p_requester_email text,
  p_participants jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester_email text;
  v_expected_headcount integer;
  v_participant_count integer;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  select reservation.headcount
  into v_expected_headcount
  from public.reservations as reservation
  join public.teams as team on team.id = reservation.team_id
  where reservation.id::text = p_reservation_id
    and team.leader_id = auth.uid();

  if not found then
    raise exception '예약을 찾을 수 없거나 저장 권한이 없습니다.'
      using errcode = '42501';
  end if;

  if p_participants is null
    or jsonb_typeof(p_participants) <> 'array'
    or jsonb_array_length(p_participants) = 0 then
    raise exception '참여자 정보가 없습니다.' using errcode = '22023';
  end if;

  v_participant_count := jsonb_array_length(p_participants);

  if v_participant_count <> v_expected_headcount then
    raise exception '선택한 사용 인원과 참여자 정보 수가 일치하지 않습니다.'
      using errcode = '22023';
  end if;

  v_requester_email := lower(trim(coalesce(p_requester_email, '')));

  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = auth.uid()
      and lower(trim(profile.email)) = v_requester_email
  ) then
    raise exception '예약자 이메일이 로그인 회원정보와 일치하지 않습니다.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_participants) as participant
    where trim(coalesce(participant->>'member_name', '')) = ''
      or trim(coalesce(participant->>'student_id', '')) = ''
      or trim(coalesce(participant->>'member_email', '')) = ''
  ) then
    raise exception '모든 참여자의 이름, 학번, 이메일이 필요합니다.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(p_participants) as participant
    where lower(trim(participant->>'member_email')) = v_requester_email
  ) then
    raise exception '예약자가 참여자 정보에 포함되어 있지 않습니다.'
      using errcode = '23514';
  end if;

  if (
    select count(distinct lower(trim(participant->>'member_email')))
    from jsonb_array_elements(p_participants) as participant
  ) <> v_participant_count then
    raise exception '같은 이메일을 두 번 입력할 수 없습니다.'
      using errcode = '23514';
  end if;

  if (
    select count(distinct trim(participant->>'student_id'))
    from jsonb_array_elements(p_participants) as participant
  ) <> v_participant_count then
    raise exception '같은 학번을 두 번 입력할 수 없습니다.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_participants) as participant
    where not exists (
      select 1
      from public.profiles as profile
      where lower(trim(profile.email)) =
        lower(trim(participant->>'member_email'))
    )
  ) then
    raise exception '가입되지 않은 참여자 이메일이 포함되어 있습니다.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.reservation_members as member
    join public.reservations as reservation
      on reservation.id = member.reservation_id
    where reservation.id::text = p_reservation_id
  ) then
    raise exception '이미 참여자 정보가 저장된 예약입니다.'
      using errcode = '23505';
  end if;

  update public.reservations as reservation
  set requester_email = v_requester_email
  where reservation.id::text = p_reservation_id;

  insert into public.reservation_members (
    reservation_id,
    member_name,
    student_id,
    member_email
  )
  select
    reservation.id,
    trim(participant->>'member_name'),
    trim(participant->>'student_id'),
    lower(trim(participant->>'member_email'))
  from public.reservations as reservation
  cross join jsonb_array_elements(p_participants) as participant
  where reservation.id::text = p_reservation_id;
end;
$$;

revoke all on function public.save_verified_reservation_participants(
  text,
  text,
  jsonb
) from public;

grant execute on function public.save_verified_reservation_participants(
  text,
  text,
  jsonb
) to authenticated;

commit;
