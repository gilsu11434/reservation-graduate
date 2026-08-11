-- 이용일 7일 전부터 열리던 예약 가능 범위를 14일 전부터로 확장합니다.
-- Supabase Dashboard > SQL Editor에서 이 파일 전체를 한 번 실행하세요.
-- 현재 설치된 create_room_reservation 함수의 다른 예약 규칙은 유지합니다.

do $migration$
declare
  target_function record;
  old_definition text;
  new_definition text;
  function_count integer := 0;
  changed_count integer := 0;
  already_updated_count integer := 0;
  condition_changed boolean;
begin
  for target_function in
    select proc.oid
    from pg_proc as proc
    join pg_namespace as ns
      on ns.oid = proc.pronamespace
    where ns.nspname = 'public'
      and proc.proname = 'create_room_reservation'
  loop
    function_count := function_count + 1;
    old_definition := pg_get_functiondef(target_function.oid);
    new_definition := old_definition;
    condition_changed := false;

    -- 현재 시각을 기준으로 작성된 예약 가능 기간 조건만 변경합니다.
    new_definition := replace(
      new_definition,
      'now() + interval ''7 days''',
      'now() + interval ''14 days'''
    );
    new_definition := replace(
      new_definition,
      'now()+interval ''7 days''',
      'now()+interval ''14 days'''
    );
    new_definition := replace(
      new_definition,
      'now() + ''7 days''::interval',
      'now() + ''14 days''::interval'
    );
    new_definition := replace(
      new_definition,
      'now()+''7 days''::interval',
      'now()+''14 days''::interval'
    );
    new_definition := replace(
      new_definition,
      'now()) + interval ''7 days''',
      'now()) + interval ''14 days'''
    );
    new_definition := replace(
      new_definition,
      'now())+interval ''7 days''',
      'now())+interval ''14 days'''
    );
    new_definition := replace(
      new_definition,
      'current_timestamp + interval ''7 days''',
      'current_timestamp + interval ''14 days'''
    );
    new_definition := replace(
      new_definition,
      'CURRENT_TIMESTAMP + INTERVAL ''7 days''',
      'CURRENT_TIMESTAMP + INTERVAL ''14 days'''
    );
    new_definition := replace(
      new_definition,
      'current_date + 7',
      'current_date + 14'
    );
    new_definition := replace(
      new_definition,
      'CURRENT_DATE + 7',
      'CURRENT_DATE + 14'
    );
    new_definition := replace(
      new_definition,
      'current_date+7',
      'current_date+14'
    );
    new_definition := replace(
      new_definition,
      'CURRENT_DATE+7',
      'CURRENT_DATE+14'
    );

    if new_definition <> old_definition then
      condition_changed := true;
    end if;

    if condition_changed then
      -- 사용자에게 표시되는 기존 오류 안내도 14일로 맞춥니다.
      new_definition := replace(new_definition, '7일 이내', '14일 이내');
      new_definition := replace(new_definition, '7일 전', '14일 전');
      new_definition := replace(new_definition, '7일 후', '14일 후');
      execute new_definition;
      changed_count := changed_count + 1;
    elsif old_definition like '%now() + interval ''14 days''%'
      or old_definition like '%now()+interval ''14 days''%'
      or old_definition like '%now() + ''14 days''::interval%'
      or old_definition like '%current_timestamp + interval ''14 days''%'
      or old_definition like '%current_date + 14%'
      or old_definition like '%CURRENT_DATE + 14%'
      or old_definition like '%14일%' then
      already_updated_count := already_updated_count + 1;
    end if;
  end loop;

  if function_count = 0 then
    raise exception 'public.create_room_reservation 함수를 찾을 수 없습니다.';
  end if;

  if changed_count = 0 and already_updated_count = 0 then
    raise exception
      'create_room_reservation 함수에서 7일 제한을 찾지 못했습니다. 함수 원문을 확인해 주세요.';
  end if;

  raise notice
    '14일 예약 범위 적용 완료: 변경 %개, 이미 적용 %개',
    changed_count,
    already_updated_count;
end;
$migration$;
