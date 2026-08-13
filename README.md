# 학부실험실 예약

학부실험실 이용 안내, 이메일 로그인, 호실 예약, 내 예약 관리 및 관리자 기능을 제공하는 웹앱입니다.

## 적용된 화면

- `index.html`: 이용 안내
- `login.html`: 이메일 로그인 및 회원가입
- `reservation.html`: 지도교수님 연구실, 602·603·702·703·704·705·708호 선택과 최대 5일의 평일 기간 예약
- `my-reservation.html`: 내 예약 기간, 수료증, 이용확인서
- `admin.html`: 사용자와 전체 예약 관리
- `suggestions.html`: 제목·가린 작성자 공개, 작성자 삭제 및 비공개 사진 첨부
- `styles/style.css`: 전체 공통 디자인
- `scripts`: Supabase 연결과 페이지 기능
- `supabase-setup.sql`: 빈 Supabase 프로젝트의 기본 테이블·함수·RLS 최초 설치
- `supabase-reservation-approval-workflow.sql`: 예약·이용확인서 관리자 승인 흐름
- `supabase-certificate-review.sql`: 수료증 경로 저장과 관리자 승인·반려
- `supabase-graduate-date-range.sql`: 졸업생용 호실별 평일 기간 예약 저장 함수와 검증

## 최초 설정

1. 기존 학생용 프로젝트와 다른 새 Supabase 프로젝트를 만듭니다.
2. `SQL Editor > New query`에서 아래 파일을 한 번에 하나씩 순서대로 실행합니다.
   1. `supabase-setup.sql`
   2. `supabase-auto-approve.sql`
   3. `supabase-participant-fields.sql`
   4. `supabase-member-email.sql`
   5. `supabase-participant-daily-limit.sql`
   6. `supabase-participant-weekly-limit.sql`
   7. `supabase-reservation-window-14-days.sql`
   8. `supabase-admin-reservation-details.sql`
   9. `supabase-suggestions.sql`
   10. `supabase-storage-buckets.sql`
   11. `supabase-usage-reports-policy.sql`
   12. `supabase-certificate-review.sql`
   13. `supabase-reservation-approval-workflow.sql`
   14. `supabase-professor-name-validation.sql`
   15. `supabase-graduate-date-range.sql`
3. 신규 프로젝트에서는 `supabase-fix-usage-reports-created-at.sql`과 `supabase-manual-usage-report-approval.sql`을 실행하지 않습니다.
   이전 버전에서 `supabase-graduate-date-range.sql`을 이미 실행했다면, 최신 호실 목록 적용을 위해 최신 파일을 다시 한 번 실행합니다.
4. Supabase의 `Authentication > Sign In / Providers > Email`에서 `Confirm email`을 켭니다.
5. `Authentication > URL Configuration`의 `Site URL`을 `https://gilsu11434.github.io/reservation-graduate/`로 설정하고, `Redirect URLs`에 `https://gilsu11434.github.io/reservation-graduate/login.html`을 추가합니다.
6. `scripts/config.js`에는 reservation-graduate 전용 Supabase URL과 Publishable key가 이미 고정되어 있습니다. reservation-student 값으로 바꾸거나 Secret key·`service_role` 키를 브라우저 코드에 넣지 않습니다.
7. VS Code에서 `index.html`을 열고 Live Server로 먼저 시험합니다.

신규 회원은 가입한 이메일로 로그인합니다. 기존 학번 기반 계정도 `profiles.email`에 저장된 이메일로 로그인할 수 있습니다.

## 이용확인서 양식

메인 페이지의 `이용확인서 양식 다운로드` 버튼을 누르면 `forms/usage-report-form.html`을 내려받을 수 있습니다.
파일을 브라우저로 열어 내용을 입력한 다음 `인쇄 · PDF로 저장` 버튼을 눌러 PDF로 저장하고, `내 예약` 페이지에서 제출하세요.

## 승인 진행 방식

1. 사용자가 예약을 신청하면 선택한 호실의 날짜 기간은 즉시 다른 사용자에게 예약 불가로 표시되고, 예약 상태는 `승인 대기`가 됩니다. 다른 호실은 같은 날짜에도 별도로 예약할 수 있습니다.
2. 관리자가 달력의 예약 건을 눌러 예약을 승인하거나 거절합니다. 거절한 예약 날짜는 다시 예약할 수 있습니다.
3. 관리자는 예약 상세화면에서 파일 제출 여부와 관계없이 참여자별 수료증을 승인·반려·승인 취소할 수 있습니다.
4. 사용자는 승인된 예약의 이용 종료 후 이용확인서를 제출합니다.
5. 관리자는 이용확인서 파일이 없어도 승인할 수 있으며, 승인하면 사용자는 다음 예약을 신청할 수 있습니다. 승인 취소 시 다음 예약 제한이 다시 적용됩니다.
6. 수료증과 이용확인서는 관리자 상세화면에서 바로 보거나 내려받을 수 있습니다.

## GitHub Pages 반영

수정 파일을 저장한 뒤 GitHub Desktop 또는 터미널에서 커밋하고 `main` 브랜치에 Push합니다. GitHub Pages가 갱신된 후 브라우저에서 강력 새로고침하세요.
