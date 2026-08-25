import {
  supabase,
  getCurrentUser,
  logout
} from "./config.js";

const SEOUL_TIME_ZONE = "Asia/Seoul";
const MAX_RANGE_DAYS = 5;
const ALLOWED_ROOM_NUMBERS = new Set([
  "602", "603", "702", "703", "704", "705", "708"
]);

const reservationForm = document.getElementById("reservation-form");
const requesterNameInput = document.getElementById("requester-name");
const requesterEmailInput = document.getElementById("requester-email");
const requesterPhoneInput = document.getElementById("requester-phone");
const departmentInput = document.getElementById("department");
const studentIdInput = document.getElementById("student-id");
const graduationProfessorInput = document.getElementById(
  "graduation-professor"
);
const roomNumberInput = document.getElementById("room-number");
const roomButtons = document.querySelectorAll("[data-room-number]");
const equipmentInput = document.getElementById("equipment");
const purposeInput = document.getElementById("purpose");
const rulesAgreedInput = document.getElementById("rules-agreed");
const reservationMessage = document.getElementById("reservation-message");

const reservationCalendar = document.getElementById("reservation-calendar");
const calendarStartToggle = document.getElementById("calendar-start-toggle");
const calendarEndToggle = document.getElementById("calendar-end-toggle");
const calendarToggles = [calendarStartToggle, calendarEndToggle];
const calendarStartValue = document.getElementById("calendar-start-value");
const calendarEndValue = document.getElementById("calendar-end-value");
const calendarPopover = document.getElementById("calendar-popover");
const calendarMonth = document.getElementById("calendar-month");
const calendarDays = document.getElementById("calendar-days");
const calendarPrev = document.getElementById("calendar-prev");
const calendarNext = document.getElementById("calendar-next");
const reservationStartDateInput = document.getElementById(
  "reservation-start-date"
);
const reservationEndDateInput = document.getElementById(
  "reservation-end-date"
);
const selectedDateSummary = document.getElementById(
  "selected-date-summary"
);
const dateRangeMessage = document.getElementById("date-range-message");

let currentUser = null;
let currentTeamId = null;
let currentProfile = null;
let calendarMinimumDate = null;
let calendarMaximumDate = null;
let calendarViewDate = null;
let selectedStartDate = "";
let selectedEndDate = "";
let activeDateField = "start";
let selectedRoomNumber = "";
let professorNameComposing = false;
let activeReservationErrorInput = null;

document
  .getElementById("logout-button")
  .addEventListener("click", logout);

graduationProfessorInput.addEventListener("compositionstart", () => {
  professorNameComposing = true;
});

graduationProfessorInput.addEventListener("compositionend", () => {
  professorNameComposing = false;
  graduationProfessorInput.value = sanitizeProfessorName(
    graduationProfessorInput.value
  );
});

graduationProfessorInput.addEventListener("input", () => {
  if (!professorNameComposing) {
    graduationProfessorInput.value = sanitizeProfessorName(
      graduationProfessorInput.value
    );
  }
});

graduationProfessorInput.addEventListener("blur", () => {
  graduationProfessorInput.value = normalizeProfessorName(
    graduationProfessorInput.value
  );
});

reservationForm.addEventListener("input", clearEditedFieldError);
reservationForm.addEventListener("change", clearEditedFieldError);

roomButtons.forEach((button) => {
  button.setAttribute("aria-checked", "false");

  button.addEventListener("click", () => {
    selectRoomNumber(button.dataset.roomNumber);
  });
});

calendarStartToggle.addEventListener("click", () => {
  toggleReservationCalendar("start");
});

calendarEndToggle.addEventListener("click", () => {
  if (!selectedStartDate) {
    dateRangeMessage.textContent = "시작 날짜를 먼저 선택해 주세요.";
    dateRangeMessage.classList.remove("success");
    dateRangeMessage.classList.add("error");
    calendarStartToggle.focus();
    return;
  }

  toggleReservationCalendar("end");
});

calendarPrev.addEventListener("click", () => {
  moveCalendarMonth(-1);
});

calendarNext.addEventListener("click", () => {
  moveCalendarMonth(1);
});

document.addEventListener("click", (event) => {
  if (!reservationCalendar.contains(event.target)) {
    closeReservationCalendar();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !calendarPopover.hidden) {
    const activeToggle = activeDateField === "end"
      ? calendarEndToggle
      : calendarStartToggle;
    closeReservationCalendar();
    activeToggle.focus();
  }
});

function clearEditedFieldError(event) {
  const input = event.target;

  input.removeAttribute?.("aria-invalid");

  if (activeReservationErrorInput === input) {
    activeReservationErrorInput = null;
    reservationMessage.textContent = "";
    reservationMessage.classList.remove("error");
  }
}

function syncRoomSelection() {
  roomNumberInput.value = selectedRoomNumber;

  roomButtons.forEach((button) => {
    const selected = button.dataset.roomNumber === selectedRoomNumber;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-checked", String(selected));
    button.setAttribute("aria-pressed", String(selected));
  });
}

function resetRoomSelection() {
  selectedRoomNumber = "";
  syncRoomSelection();
  resetDateRangeSelection();
  renderReservationCalendar();
}

function selectRoomNumber(roomNumber) {
  if (
    !ALLOWED_ROOM_NUMBERS.has(roomNumber) ||
    roomNumber === selectedRoomNumber
  ) {
    return;
  }

  selectedRoomNumber = roomNumber;
  syncRoomSelection();

  const selectedButton = document.querySelector(
    `[data-room-number="${roomNumber}"]`
  );
  selectedButton?.removeAttribute("aria-invalid");

  if (activeReservationErrorInput?.matches?.("[data-room-number]")) {
    activeReservationErrorInput.removeAttribute("aria-invalid");
    activeReservationErrorInput = null;
    reservationMessage.textContent = "";
    reservationMessage.classList.remove("error");
  }

  resetDateRangeSelection();
  renderReservationCalendar();
}

function sanitizeProfessorName(value) {
  return String(value ?? "")
    .replace(/\s*교수님\s*연구실\s*$/g, "")
    .replace(/\s*교수님\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .slice(0, 30);
}

function normalizeProfessorName(value) {
  return sanitizeProfessorName(value).trim();
}

function isValidProfessorName(value) {
  const letters = value.match(/[가-힣a-zA-Z]/g) ?? [];

  return (
    letters.length >= 2 &&
    Array.from(value).length <= 30 &&
    /^[가-힣a-zA-Z·ㆍ ]+$/.test(value)
  );
}

function isValidDescriptiveText(value) {
  return (value.match(/[가-힣a-zA-Z]/g) ?? []).length >= 2;
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function showReservationFieldError(input, text) {
  if (
    activeReservationErrorInput &&
    activeReservationErrorInput !== input
  ) {
    activeReservationErrorInput.removeAttribute("aria-invalid");
  }

  activeReservationErrorInput = input;
  reservationMessage.textContent = text;
  reservationMessage.classList.remove("success");
  reservationMessage.classList.add("error");
  input.setAttribute("aria-invalid", "true");
  input.focus();
}

function createReservationValidationError(text, input) {
  const error = new Error(text);
  error.input = input;
  return error;
}

function getSeoulDateValue(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function parseDateValue(dateValue) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function toDateValue(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function addDays(dateValue, amount) {
  const date = parseDateValue(dateValue);
  date.setUTCDate(date.getUTCDate() + amount);
  return toDateValue(date);
}

function getDateValuesInRange(startDate, endDate) {
  if (!startDate || !endDate || endDate < startDate) {
    return [];
  }

  const values = [];
  let currentDate = startDate;

  while (currentDate <= endDate && values.length <= 31) {
    values.push(currentDate);
    currentDate = addDays(currentDate, 1);
  }

  return values;
}

function getDateWeekday(dateValue) {
  return parseDateValue(dateValue).getUTCDay();
}

function formatKoreanDate(dateValue) {
  if (!dateValue) {
    return "";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    timeZone: "UTC"
  }).format(parseDateValue(dateValue));
}

function getMonthIndex(date) {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

function setDateLimits() {
  const today = getSeoulDateValue();
  const minimumValue = addDays(today, 1);
  const maximumValue = addDays(today, 14);

  calendarMinimumDate = parseDateValue(minimumValue);
  calendarMaximumDate = parseDateValue(maximumValue);
  calendarViewDate = new Date(
    Date.UTC(
      calendarMinimumDate.getUTCFullYear(),
      calendarMinimumDate.getUTCMonth(),
      1,
      12
    )
  );

  resetDateRangeSelection();
}

function setCalendarViewFromDate(dateValue) {
  if (!dateValue) {
    return;
  }

  const date = parseDateValue(dateValue);
  calendarViewDate = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12)
  );
}

function toggleReservationCalendar(field) {
  const isSameFieldOpen =
    !calendarPopover.hidden && activeDateField === field;

  if (isSameFieldOpen) {
    closeReservationCalendar();
    return;
  }

  activeDateField = field;
  calendarPopover.hidden = false;
  calendarPopover.classList.toggle("align-end", field === "end");
  calendarPopover.setAttribute(
    "aria-label",
    field === "end" ? "종료 날짜 선택 달력" : "시작 날짜 선택 달력"
  );

  calendarToggles.forEach((toggle) => {
    const expanded =
      (field === "start" && toggle === calendarStartToggle) ||
      (field === "end" && toggle === calendarEndToggle);
    toggle.setAttribute("aria-expanded", String(expanded));
  });

  setCalendarViewFromDate(
    field === "end"
      ? selectedEndDate || selectedStartDate
      : selectedStartDate
  );
  renderReservationCalendar();
}

function closeReservationCalendar() {
  calendarPopover.hidden = true;
  calendarPopover.classList.remove("align-end");
  calendarToggles.forEach((toggle) => {
    toggle.setAttribute("aria-expanded", "false");
  });
}

function moveCalendarMonth(direction) {
  if (!calendarViewDate) {
    return;
  }

  const nextMonth = new Date(
    Date.UTC(
      calendarViewDate.getUTCFullYear(),
      calendarViewDate.getUTCMonth() + direction,
      1,
      12
    )
  );
  const minimumMonth = getMonthIndex(calendarMinimumDate);
  const maximumMonth = getMonthIndex(calendarMaximumDate);
  const nextMonthIndex = getMonthIndex(nextMonth);

  if (nextMonthIndex < minimumMonth || nextMonthIndex > maximumMonth) {
    return;
  }

  calendarViewDate = nextMonth;
  renderReservationCalendar();
}

function getDateStatus(dateValue) {
  const minimumValue = toDateValue(calendarMinimumDate);
  const maximumValue = toDateValue(calendarMaximumDate);

  if (dateValue < minimumValue || dateValue > maximumValue) {
    return { available: false, label: "예약 기간 외" };
  }

  const weekday = getDateWeekday(dateValue);

  if (weekday === 0 || weekday === 6) {
    return { available: false, label: "주말 선택 불가" };
  }

  if (!selectedRoomNumber) {
    return { available: false, label: "호실 선택 필요" };
  }

  return { available: true, label: "예약 가능" };
}

function validateDateRange(startDate, endDate) {
  const dates = getDateValuesInRange(startDate, endDate);

  if (dates.length === 0) {
    return { valid: false, message: "종료 날짜는 시작 날짜 이후여야 합니다." };
  }

  if (dates.length > MAX_RANGE_DAYS) {
    return {
      valid: false,
      message: "한 번에 최대 연속 평일 5일까지 선택할 수 있습니다."
    };
  }

  const unavailableDate = dates.find(
    (dateValue) => !getDateStatus(dateValue).available
  );

  if (unavailableDate) {
    return {
      valid: false,
      message: `${formatKoreanDate(unavailableDate)}은(는) 선택할 수 없습니다. 주말이나 예약 기간 외 날짜를 포함하지 않도록 다시 선택해 주세요.`
    };
  }

  return { valid: true, dates };
}

function selectReservationDate(dateValue) {
  const status = getDateStatus(dateValue);

  if (!status.available) {
    return;
  }

  dateRangeMessage.classList.remove("error", "success");

  if (activeDateField === "start") {
    selectedStartDate = dateValue;
    selectedEndDate = "";
    syncDateRangeSelection();
    renderReservationCalendar();
    closeReservationCalendar();
    calendarStartToggle.focus();
    return;
  }

  if (!selectedStartDate) {
    dateRangeMessage.textContent = "시작 날짜를 먼저 선택해 주세요.";
    dateRangeMessage.classList.add("error");
    closeReservationCalendar();
    calendarStartToggle.focus();
    return;
  }

  const validation = validateDateRange(selectedStartDate, dateValue);

  if (!validation.valid) {
    dateRangeMessage.textContent = validation.message;
    dateRangeMessage.classList.add("error");
    return;
  }

  selectedEndDate = dateValue;
  syncDateRangeSelection();
  renderReservationCalendar();
  closeReservationCalendar();
  calendarEndToggle.focus();
}

function resetDateRangeSelection() {
  selectedStartDate = "";
  selectedEndDate = "";
  activeDateField = "start";
  closeReservationCalendar();
  syncDateRangeSelection();
}

function syncDateRangeSelection() {
  reservationStartDateInput.value = selectedStartDate;
  reservationEndDateInput.value = selectedEndDate;
  calendarStartValue.textContent = selectedStartDate
    ? formatKoreanDate(selectedStartDate)
    : "시작날짜";
  calendarEndValue.textContent = selectedEndDate
    ? formatKoreanDate(selectedEndDate)
    : "종료날짜";
  calendarStartToggle.classList.toggle(
    "has-value",
    Boolean(selectedStartDate)
  );
  calendarEndToggle.classList.toggle(
    "has-value",
    Boolean(selectedEndDate)
  );
  selectedDateSummary.parentElement.classList.toggle(
    "complete",
    Boolean(selectedEndDate)
  );
  dateRangeMessage.classList.remove("error", "success");

  if (!selectedStartDate) {
    selectedDateSummary.textContent = "선택 전";

    if (!selectedRoomNumber) {
      dateRangeMessage.textContent = "사용할 호실을 먼저 선택해 주세요.";
    } else {
      dateRangeMessage.textContent = "시작 날짜를 선택해 주세요.";
    }
    return;
  }

  if (!selectedEndDate) {
    const startLabel = formatKoreanDate(selectedStartDate);
    selectedDateSummary.textContent = `${startLabel} ~ 종료 날짜 선택 필요`;
    dateRangeMessage.textContent =
      "오른쪽 종료날짜를 선택해 주세요. 하루 예약은 시작날짜와 같은 날짜를 선택하세요.";
    return;
  }

  const dates = getDateValuesInRange(selectedStartDate, selectedEndDate);
  const startLabel = formatKoreanDate(selectedStartDate);
  const endLabel = formatKoreanDate(selectedEndDate);
  const rangeLabel = selectedStartDate === selectedEndDate
    ? startLabel
    : `${startLabel} ~ ${endLabel}`;

  selectedDateSummary.textContent = `${rangeLabel} (${dates.length}일)`;
  dateRangeMessage.textContent = "예약 날짜가 선택되었습니다.";
  dateRangeMessage.classList.add("success");
}

function renderReservationCalendar() {
  if (!calendarViewDate || !calendarMinimumDate || !calendarMaximumDate) {
    return;
  }

  const year = calendarViewDate.getUTCFullYear();
  const month = calendarViewDate.getUTCMonth();
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const selectedDates = new Set(
    selectedEndDate
      ? getDateValuesInRange(selectedStartDate, selectedEndDate)
      : selectedStartDate
        ? [selectedStartDate]
        : []
  );
  const cells = [];

  calendarMonth.textContent = `${year}년 ${month + 1}월`;
  calendarPrev.disabled =
    getMonthIndex(calendarViewDate) <= getMonthIndex(calendarMinimumDate);
  calendarNext.disabled =
    getMonthIndex(calendarViewDate) >= getMonthIndex(calendarMaximumDate);

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push('<span class="calendar-day-empty" aria-hidden="true"></span>');
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateValue = [
      year,
      String(month + 1).padStart(2, "0"),
      String(day).padStart(2, "0")
    ].join("-");
    const status = getDateStatus(dateValue);
    const isSelected = selectedDates.has(dateValue);
    const classes = ["calendar-day"];

    if (isSelected) {
      classes.push("selected", "in-range");
    }

    if (dateValue === selectedStartDate) {
      classes.push("range-start");
    }

    if (dateValue === selectedEndDate) {
      classes.push("range-end");
    }

    cells.push(`
      <button
        type="button"
        class="${classes.join(" ")}"
        data-date="${dateValue}"
        aria-label="${formatKoreanDate(dateValue)} ${status.label}${isSelected ? ", 선택됨" : ""}"
        aria-pressed="${isSelected}"
        ${status.available ? "" : "disabled"}
      >${day}</button>
    `);
  }

  calendarDays.innerHTML = cells.join("");
  calendarDays.querySelectorAll("[data-date]").forEach((button) => {
    button.addEventListener("click", () => {
      selectReservationDate(button.dataset.date);
    });
  });
}

async function loadProfile() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .single();

  if (error) {
    throw new Error(`회원정보를 불러오지 못했습니다: ${error.message}`);
  }

  currentProfile = data;
  fillProfile(data);
  return data;
}

function fillProfile(profile) {
  requesterNameInput.value = profile.full_name ?? "";
  requesterEmailInput.value = normalizeEmail(
    profile.email ?? currentUser?.email ?? ""
  );
  requesterPhoneInput.value = profile.phone ?? "";
  departmentInput.value = profile.department || "전자전기공학부";
  studentIdInput.value = profile.student_id ?? "";
}

async function ensureReservationTeam(profile) {
  const { data: existingTeams, error: loadError } = await supabase
    .from("teams")
    .select("id")
    .eq("leader_id", currentUser.id)
    .order("created_at", { ascending: true })
    .limit(1);

  if (loadError) {
    throw new Error(`예약 정보 준비 오류: ${loadError.message}`);
  }

  if (existingTeams.length > 0) {
    currentTeamId = existingTeams[0].id;
    return;
  }

  const defaultTeamName =
    `${profile.student_id || currentUser.id.slice(0, 8)} 예약`;
  const { data: createdTeam, error: createError } = await supabase
    .from("teams")
    .insert({
      team_name: defaultTeamName,
      leader_id: currentUser.id
    })
    .select("id")
    .single();

  if (createError) {
    throw new Error(`예약 정보 준비 오류: ${createError.message}`);
  }

  currentTeamId = createdTeam.id;
}

function collectReservationValues() {
  const values = {
    requesterName: requesterNameInput.value.trim(),
    requesterEmail: normalizeEmail(requesterEmailInput.value),
    requesterPhone: requesterPhoneInput.value.trim(),
    department: departmentInput.value.trim(),
    studentId: studentIdInput.value.trim(),
    graduationProfessor: normalizeProfessorName(
      graduationProfessorInput.value
    ),
    roomNumber: selectedRoomNumber,
    equipment: equipmentInput.value.trim(),
    purpose: purposeInput.value.trim(),
    startDate: selectedStartDate,
    endDate: selectedEndDate,
    rulesAgreed: rulesAgreedInput.checked
  };

  const requiredFields = [
    [values.requesterName, requesterNameInput, "예약자 이름을 입력해 주세요."],
    [values.requesterPhone, requesterPhoneInput, "전화번호를 입력해 주세요."],
    [values.department, departmentInput, "학과를 입력해 주세요."],
    [values.studentId, studentIdInput, "학번을 입력해 주세요."]
  ];

  for (const [value, input, message] of requiredFields) {
    if (!value) {
      throw createReservationValidationError(message, input);
    }
  }

  if (!isValidEmail(values.requesterEmail)) {
    throw createReservationValidationError(
      "예약자 이메일을 확인할 수 없습니다. 회원정보의 이메일을 확인해 주세요.",
      requesterEmailInput
    );
  }

  if (!isValidProfessorName(values.graduationProfessor)) {
    throw createReservationValidationError(
      "지도교수님 이름은 완성형 한글 또는 영문으로 2글자 이상 입력해 주세요. (예: 홍길동)",
      graduationProfessorInput
    );
  }

  if (!ALLOWED_ROOM_NUMBERS.has(values.roomNumber)) {
    throw createReservationValidationError(
      "사용할 호실을 선택해 주세요.",
      roomButtons[0]
    );
  }

  if (!isValidDescriptiveText(values.equipment)) {
    throw createReservationValidationError(
      "사용할 장비를 두 글자 이상 입력해 주세요. 장비가 없으면 '없음'이라고 입력해 주세요.",
      equipmentInput
    );
  }

  if (!isValidDescriptiveText(values.purpose)) {
    throw createReservationValidationError(
      "사용 목적을 두 글자 이상 입력해 주세요.",
      purposeInput
    );
  }

  if (!values.startDate) {
    throw createReservationValidationError(
      "시작 날짜를 선택해 주세요.",
      calendarStartToggle
    );
  }

  if (!values.endDate) {
    throw createReservationValidationError(
      "종료 날짜를 선택해 주세요.",
      calendarEndToggle
    );
  }

  const rangeValidation = validateDateRange(
    values.startDate,
    values.endDate
  );

  if (!rangeValidation.valid) {
    throw createReservationValidationError(
      rangeValidation.message,
      calendarEndToggle
    );
  }

  if (!values.rulesAgreed) {
    throw createReservationValidationError(
      "이용수칙과 책임 규정에 동의해 주세요.",
      rulesAgreedInput
    );
  }

  return values;
}

function setSubmitting(isSubmitting) {
  const submitButton = reservationForm.querySelector('[type="submit"]');
  submitButton.disabled = isSubmitting;
  submitButton.textContent = isSubmitting ? "처리 중..." : "예약 신청하기";
}

reservationForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  reservationMessage.textContent = "";
  reservationMessage.classList.remove("error", "success");

  let values;

  try {
    values = collectReservationValues();
  } catch (error) {
    showReservationFieldError(
      error.input ?? calendarStartToggle,
      error.message
    );
    return;
  }

  if (!currentTeamId) {
    showReservationFieldError(
      calendarStartToggle,
      "예약 정보를 준비하지 못했습니다. 페이지를 새로고침해 주세요."
    );
    return;
  }

  setSubmitting(true);

  try {
    const { error } = await supabase.rpc(
      "create_graduate_date_range_reservation",
      {
        p_team_id: currentTeamId,
        p_requester_name: values.requesterName,
        p_requester_email: values.requesterEmail,
        p_requester_phone: values.requesterPhone,
        p_department: values.department,
        p_student_id: values.studentId,
        p_graduation_professor: values.graduationProfessor,
        p_room_number: Number(values.roomNumber),
        p_purpose: values.purpose,
        p_equipment: values.equipment,
        p_start_date: values.startDate,
        p_end_date: values.endDate,
        p_rules_agreed: values.rulesAgreed
      }
    );

    if (error) {
      throw error;
    }

    reservationMessage.textContent =
      "예약 신청이 접수되었습니다. 관리자 승인 대기 중입니다.";
    reservationMessage.classList.add("success");

    reservationForm.reset();
    activeReservationErrorInput = null;

    if (currentProfile) {
      fillProfile(currentProfile);
    }

    setDateLimits();
    resetRoomSelection();
  } catch (error) {
    reservationMessage.textContent = error.message;
    reservationMessage.classList.add("error");
  } finally {
    setSubmitting(false);
  }
});

async function initialize() {
  try {
    currentUser = await getCurrentUser();

    if (!currentUser) {
      return;
    }

    const profile = await loadProfile();
    setDateLimits();
    await ensureReservationTeam(profile);
    resetRoomSelection();
  } catch (error) {
    reservationMessage.textContent = error.message;
    reservationMessage.classList.add("error");
  }
}

initialize();
