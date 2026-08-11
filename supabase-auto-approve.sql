-- 관리자 승인 없이 가입 직후 예약 페이지를 이용하기 위한 설정입니다.
-- Supabase Dashboard > SQL Editor에서 이 파일의 전체 내용을 한 번 실행하세요.

alter table public.user_roles
alter column is_approved set default true;

update public.user_roles
set is_approved = true
where is_approved = false;

create or replace function public.auto_approve_new_user_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.is_approved := true;
  return new;
end;
$$;

drop trigger if exists trigger_auto_approve_new_user_role
on public.user_roles;

create trigger trigger_auto_approve_new_user_role
before insert on public.user_roles
for each row
execute function public.auto_approve_new_user_role();
