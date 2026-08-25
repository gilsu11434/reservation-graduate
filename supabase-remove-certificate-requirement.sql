-- 학부실험실 예약에서 수료증 제출·관리자 인증 절차를 제거합니다.
-- 기존 수료증 파일과 기록은 삭제하지 않고 더 이상 예약 절차에 사용하지 않습니다.
-- 기존 프로젝트에서는 Supabase SQL Editor에서 이 파일 전체를 한 번 실행하세요.

begin;

alter table public.reservations
alter column status set default 'ready';

-- 수료증 확인 대기로 남아 있던 예약을 일반 이용 준비 상태로 전환합니다.
update public.reservations
set status = 'ready'
where status::text = 'documents_pending';

-- 수료증 업로드·승인용 함수는 더 이상 사용하지 못하도록 제거합니다.
drop function if exists public.save_my_certificate_path(uuid, uuid, text);
drop function if exists public.admin_review_certificate(uuid, text, text);
drop function if exists public.admin_review_all_certificates(uuid, text, text);

commit;
