import { supabase } from "./config.js";

const signupForm = document.getElementById("signup-form");
const loginForm = document.getElementById("login-form");
const signupMessage = document.getElementById("signup-message");
const loginMessage = document.getElementById("login-message");
const tabButtons = document.querySelectorAll("[data-auth-tab]");

function normalizeStudentId(value) {
  return String(value ?? "")
    .trim()
    .replaceAll(" ", "")
    .toLowerCase();
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function convertAuthError(message = "") {
  const normalized = message.toLowerCase();

  if (normalized.includes("email rate limit exceeded")) {
    return "인증메일 발송 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.";
  }

  if (normalized.includes("user already registered")) {
    return "이미 가입된 이메일입니다. 로그인 탭을 이용해 주세요.";
  }

  if (normalized.includes("invalid login credentials")) {
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  }

  if (normalized.includes("email not confirmed")) {
    return "이메일 인증이 완료되지 않았습니다. 받은 인증메일의 링크를 먼저 눌러주세요.";
  }

  if (
    normalized.includes("otp_expired") ||
    normalized.includes("token has expired")
  ) {
    return "인증 링크가 만료되었습니다. 인증메일을 다시 요청해 주세요.";
  }

  if (normalized.includes("password should be")) {
    return "비밀번호는 8자 이상으로 입력해 주세요.";
  }

  return message || "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function showFormMessage(element, message, type = "error") {
  element.textContent = message;
  element.classList.remove("success", "error");
  element.classList.add(type);
}

function setFormBusy(form, busy) {
  const submitButton = form.querySelector('button[type="submit"]');

  submitButton.disabled = busy;
  submitButton.textContent = busy
    ? "처리 중..."
    : submitButton.dataset.defaultText;
}

async function ensureUserProfile(user, signupValues = {}) {
  const metadata = user.user_metadata ?? {};
  const { data: existingProfile, error: loadError } = await supabase
    .from("profiles")
    .select(`
      id,
      email,
      full_name,
      phone,
      department,
      student_id
    `)
    .eq("id", user.id)
    .maybeSingle();

  if (loadError) {
    throw loadError;
  }

  const profile = {
    id: user.id,
    email: normalizeEmail(
      existingProfile?.email ||
      signupValues.contactEmail ||
      metadata.contact_email ||
      user.email
    ),
    full_name:
      existingProfile?.full_name ||
      signupValues.fullName ||
      metadata.full_name ||
      "",
    phone:
      existingProfile?.phone ||
      signupValues.phone ||
      metadata.phone ||
      "",
    department:
      existingProfile?.department ||
      signupValues.department ||
      metadata.department ||
      "",
    student_id:
      existingProfile?.student_id ||
      signupValues.studentId ||
      metadata.student_id ||
      "",
    updated_at: new Date().toISOString()
  };

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert(profile, { onConflict: "id" });

  if (profileError) {
    throw profileError;
  }
}

async function getSignedInDestination(userId) {
  const { data: permission, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return permission?.role === "admin"
    ? "./admin.html"
    : "./reservation.html";
}

function activateTab(tabName) {
  tabButtons.forEach((button) => {
    const active = button.dataset.authTab === tabName;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });

  document.getElementById("login-panel").hidden = tabName !== "login";
  document.getElementById("signup-panel").hidden = tabName !== "signup";

  const target = document.querySelector(
    tabName === "login" ? "#login-email" : "#signup-name"
  );

  target?.focus();
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => activateTab(button.dataset.authTab));
});

document.querySelectorAll('button[type="submit"]').forEach((button) => {
  button.dataset.defaultText = button.textContent.trim();
});

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const fullName = document.getElementById("signup-name").value.trim();
  const phone = document.getElementById("signup-phone").value.trim();
  const department = document.getElementById("signup-department").value.trim();
  const studentId = normalizeStudentId(
    document.getElementById("signup-student-id").value
  );
  const contactEmail = normalizeEmail(
    document.getElementById("signup-email").value
  );
  const password = document.getElementById("signup-password").value;
  const passwordConfirm = document.getElementById(
    "signup-password-confirm"
  ).value;

  signupMessage.textContent = "";
  signupMessage.classList.remove("success", "error");

  if (!/^[a-z0-9-]{4,20}$/.test(studentId)) {
    showFormMessage(signupMessage, "학번을 정확히 입력해 주세요.");
    return;
  }

  if (password !== passwordConfirm) {
    showFormMessage(signupMessage, "비밀번호가 서로 일치하지 않습니다.");
    return;
  }

  setFormBusy(signupForm, true);

  try {
    const { data, error } = await supabase.auth.signUp({
      email: contactEmail,
      password,
      options: {
        emailRedirectTo: new URL(
          "./login.html",
          window.location.href
        ).href,
        data: {
          full_name: fullName,
          phone,
          department,
          student_id: studentId,
          contact_email: contactEmail
        }
      }
    });

    if (error) {
      throw error;
    }

    if (!data.user) {
      throw new Error("사용자 계정이 생성되지 않았습니다.");
    }

    if (!data.session) {
      showFormMessage(
        signupMessage,
        `${contactEmail}로 인증메일을 발송했습니다. ` +
        "메일의 인증 링크를 누른 후 로그인해 주세요.",
        "success"
      );
      return;
    }

    await ensureUserProfile(data.user, {
      contactEmail,
      fullName,
      phone,
      department,
      studentId
    });

    showFormMessage(
      signupMessage,
      "회원가입이 완료되었습니다. 예약 페이지로 이동합니다.",
      "success"
    );

    window.setTimeout(() => {
      window.location.replace("./reservation.html");
    }, 500);
  } catch (error) {
    showFormMessage(signupMessage, convertAuthError(error.message));
  } finally {
    setFormBusy(signupForm, false);
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const loginEmail = normalizeEmail(
    document.getElementById("login-email").value
  );
  const password = document.getElementById("login-password").value;

  loginMessage.textContent = "";
  loginMessage.classList.remove("success", "error");
  setFormBusy(loginForm, true);

  try {
    const { data: resolvedEmail, error: resolveError } =
      await supabase.rpc("resolve_login_email", {
        p_email: loginEmail
      });

    if (resolveError) {
      throw new Error(
        `이메일 로그인 설정 오류: ${resolveError.message}`
      );
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(resolvedEmail || loginEmail),
      password
    });

    if (error) {
      throw error;
    }

    await ensureUserProfile(data.user);
    const destination = await getSignedInDestination(data.user.id);

    showFormMessage(loginMessage, "로그인되었습니다.", "success");

    window.location.replace(destination);
  } catch (error) {
    showFormMessage(loginMessage, convertAuthError(error.message));
  } finally {
    setFormBusy(loginForm, false);
  }
});

async function completeEmailConfirmation() {
  const urlParameters = new URLSearchParams(window.location.search);
  const hashParameters = new URLSearchParams(
    window.location.hash.replace(/^#/, "")
  );
  const callbackError =
    urlParameters.get("error_description") ||
    hashParameters.get("error_description");

  if (callbackError) {
    activateTab("login");
    showFormMessage(
      loginMessage,
      convertAuthError(callbackError)
    );
    return;
  }

  const {
    data: { session },
    error
  } = await supabase.auth.getSession();

  if (error || !session?.user) {
    return;
  }

  try {
    await ensureUserProfile(session.user);
    const destination = await getSignedInDestination(
      session.user.id
    );

    activateTab("login");
    showFormMessage(
      loginMessage,
      "이메일 인증이 완료되었습니다. 예약 페이지로 이동합니다.",
      "success"
    );

    window.setTimeout(() => {
      window.location.replace(destination);
    }, 800);
  } catch (confirmationError) {
    activateTab("login");
    showFormMessage(
      loginMessage,
      `인증 후 회원정보 저장 오류: ${confirmationError.message}`
    );
  }
}

completeEmailConfirmation();
