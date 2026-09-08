/* ---------- identity (device-local, not real auth) ---------- */
// myName is used directly as a Firestore document id / path segment all over the app
// (shops/{myName}, shops/{myName}/reviews/{itemId}, items/{id}/liveSignals/{myName}) —
// "/" breaks that (splits it into extra path segments) and Firestore rejects a handful of
// other characters in a document id, so any username is sanitized before it's ever used.
// Strips characters that are unsafe in two different contexts a username ends up in: "/.#$[]"
// break a Firestore document path (usernames are used directly as doc IDs all over the app —
// shops/{myName}, etc.), and quote/angle-bracket characters ' " ` < > are stripped too because a
// LOT of this file renders names into onclick="someFn('${name}')" HTML strings (shop directory,
// recommended shops, feed subcat chips, the admin panel) — a name containing an unescaped quote
// breaks out of that attribute and can inject arbitrary onclick JS that runs in every viewer's
// browser (a real stored-XSS vector, not just a display glitch). esc() escapes these for safe
// TEXT content, but HTML-decodes back to the literal character before an attribute's own JS is
// parsed, so escaping alone does not close this — the character has to never be in the name at all.
function sanitizeUsername(s) {
  return (s || "").replace(/[\/\.\#\$\[\]'"`<>]/g, "-").trim();
}
// same onclick-breakout concern as sanitizeUsername above, applied to any other free-typed tag
// that ends up rendered into an inline onclick string — currently just the "ไอดีเกม" game name
// field, since that's the one piece of free text (not a fixed picker list) a seller can put
// straight into a subcat filter chip's onclick.
function sanitizeFreeTag(s, maxLen) {
  return (s || "")
    .replace(/['"`<>]/g, "")
    .trim()
    .slice(0, maxLen || 40);
}
let myName = sanitizeUsername(localStorage.getItem("pramoon_myname") || "");
let myRole = localStorage.getItem("pramoon_role") || null; // 'seller' | 'buyer' — drives which "ของฉัน" profile UI shows
// real Firebase Auth (email+password+verification) was tried and then explicitly rolled back —
// the founder wants real identity verification deferred to the very last step of the project,
// as originally planned, rather than mid-build. Back to the simple device-local system: any
// password "works", phone number is just the uniqueness key for "1 account per phone".
// เข้าสู่ระบบ vs สมัครสมาชิก เป็น UI คนละแท็บให้ชัดเจน แต่ตรรกะเบื้องหลังยังอิง "เบอร์นี้เคยลงทะเบียนไว้
// หรือยัง" เหมือนเดิม (ยังจำกัด 1 บัญชีต่อ 1 เบอร์) — แท็บแค่ทำให้คาดหวังผลลัพธ์ถูกทาง และกันเคส
// กด "เข้าสู่ระบบ" ทั้งที่ยังไม่เคยสมัคร (หรือกลับกัน) ไม่ให้มันทำสิ่งที่ไม่ได้ตั้งใจแบบเงียบๆ
let authMode = "login";
function setAuthMode(mode) {
  authMode = mode;
  document
    .getElementById("authTabLogin")
    .classList.toggle("active", mode === "login");
  document
    .getElementById("authTabSignup")
    .classList.toggle("active", mode === "signup");
  document.getElementById("authModeHint").textContent =
    mode === "login"
      ? "เข้าสู่ระบบด้วยชื่อ รหัสผ่าน และเบอร์ที่เคยสมัครไว้"
      : "สมัครสมาชิกใหม่ด้วยชื่อ รหัสผ่าน และเบอร์โทรของคุณ";
  document.getElementById("loginBtn").textContent =
    mode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก";
  document.getElementById("loginError").style.display = "none";
}
function togglePasswordVisibility() {
  const input = document.getElementById("loginPassword");
  const btn = document.getElementById("pwToggleBtn");
  const showing = input.type === "text";
  input.type = showing ? "password" : "text";
  btn.textContent = showing ? "👁" : "🙈";
  btn.setAttribute("aria-label", showing ? "แสดงรหัสผ่าน" : "ซ่อนรหัสผ่าน");
}
async function doLogin() {
  const err = document.getElementById("loginError");
  err.style.display = "none";
  const username = sanitizeUsername(
    document.getElementById("loginUsername").value.trim().slice(0, 24),
  );
  const password = document.getElementById("loginPassword").value;
  const phone = document.getElementById("loginPhone").value.replace(/\D/g, "");
  if (!username) {
    err.textContent = "กรอกชื่อผู้ใช้ก่อน";
    err.style.display = "block";
    return;
  }
  if (!password) {
    err.textContent = "กรอกรหัสผ่านก่อน";
    err.style.display = "block";
    return;
  }
  if (!/^0\d{9}$/.test(phone)) {
    err.textContent = "กรอกเบอร์โทร 10 หลัก ขึ้นต้นด้วย 0 เช่น 0812345678";
    err.style.display = "block";
    return;
  }
  if (!db) {
    err.textContent = "ยังไม่ได้เชื่อมต่อฐานข้อมูล รอสักครู่แล้วลองใหม่";
    err.style.display = "block";
    return;
  }
  const btn = document.getElementById("loginBtn");
  const restoreBtnText = btn.textContent;
  btn.disabled = true;
  // ให้เห็นทันทีว่ากำลังทำงานอยู่ ไม่ใช่ค้าง — เผื่อเน็ตช้าและการเชื่อมต่อ Firestore ใช้เวลาสักพัก
  btn.textContent =
    authMode === "login" ? "กำลังเข้าสู่ระบบ..." : "กำลังสมัครสมาชิก...";
  try {
    if (await checkBanned(phone)) {
      err.textContent =
        "เบอร์นี้ถูกระงับการใช้งาน — หากคิดว่าเป็นความผิดพลาด ติดต่อผู้ดูแลระบบ";
      err.style.display = "block";
      btn.disabled = false;
      btn.textContent = restoreBtnText;
      return;
    }
    const ref = db.doc("users/" + phone);
    // เน็ตช้า/หลุดกลางทางไม่ควรทำให้ค้างไม่รู้จบ — รอสูงสุด 10 วิ แล้วแจ้งให้ลองใหม่แทน
    const snap = await withTimeout(ref.get(), 10000, null);
    if (snap === null) {
      err.textContent =
        "เชื่อมต่อช้าเกินไป เช็คอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง";
      err.style.display = "block";
      btn.disabled = false;
      btn.textContent = restoreBtnText;
      return;
    }
    if (snap.exists) {
      // เบอร์นี้ลงทะเบียนไว้แล้ว — เข้าบัญชีเดิมเสมอ ไม่สร้างบัญชีที่สองซ้อนเบอร์เดียวกัน
      const data = snap.data();
      myName = sanitizeUsername(data.username);
      if (myName !== data.username) {
        // self-heal an account saved before "/" (etc.) was blocked from usernames
        await ref.update({ username: myName }).catch(() => {});
      }
      if (authMode === "signup") {
        alert(
          `เบอร์ ${phone} มีบัญชีอยู่แล้วในชื่อ "${myName}" — พาเข้าสู่ระบบให้เลย (ครั้งหน้ากดแท็บ "เข้าสู่ระบบ" ได้เลย)`,
        );
      } else if (myName !== username) {
        alert(
          `เบอร์ ${phone} ลงทะเบียนไว้แล้วในชื่อ "${myName}" — เข้าสู่ระบบด้วยชื่อนั้นให้อัตโนมัติ (จำกัด 1 บัญชีต่อ 1 เบอร์)`,
        );
      }
    } else {
      // เบอร์ยังไม่เคยสมัคร — สร้างบัญชีใหม่ให้เลยไม่ว่าจะกดแท็บไหน (แท็บมีไว้ตั้งความคาดหวัง/คำแนะนำ
      // ไม่ใช่ด่านกั้น — ไม่อยากให้คนที่กด "เข้าสู่ระบบ" เฉยๆ ต้องไปงมหาแท็บ "สมัครสมาชิก" เอง)
      if (authMode === "login") {
        alert(
          `ยังไม่เคยมีบัญชีใช้เบอร์ ${phone} มาก่อน — สมัครบัญชีใหม่ให้เลยนะ`,
        );
      }
      myName = username;
      await ref.set({ username, phone, createdAt: Date.now() });
    }
    localStorage.setItem("pramoon_myname", myName);
    localStorage.setItem("pramoon_phone", phone);
    document.getElementById("loginStep").classList.add("hidden");
    document.getElementById("roleStep").classList.remove("hidden");
  } catch (e) {
    err.textContent =
      "เข้าสู่ระบบไม่สำเร็จ ลองใหม่ (" + ((e && e.code) || "error") + ")";
    err.style.display = "block";
  }
  btn.disabled = false;
  btn.textContent = restoreBtnText;
}
function chooseRole(role) {
  localStorage.setItem("pramoon_role", role);
  document.getElementById("nameGate").classList.add("hidden");
  afterName(role);
}
function changeMyName() {
  const v = prompt("ตั้งชื่อใหม่", myName);
  if (v === null) return;
  const t = sanitizeUsername(v.trim().slice(0, 24));
  if (!t) return;
  myName = t;
  localStorage.setItem("pramoon_myname", t);
  const phone = localStorage.getItem("pramoon_phone");
  if (db && phone)
    db.doc("users/" + phone)
      .update({ username: t })
      .catch(() => {});
  renderMine();
}
function changeRole() {
  document.getElementById("loginStep").classList.add("hidden");
  document.getElementById("roleStep").classList.remove("hidden");
  document.getElementById("nameGate").classList.remove("hidden");
}
async function logout() {
  if (!confirm("ออกจากระบบ? ครั้งหน้าต้องล็อกอินด้วยเบอร์เดิมใหม่")) return;
  // if this device was mid-broadcast (now that live can sit minimized on any screen, it's easy to
  // forget one is running), give it a moment to actually mark isLive:false in Firestore before the
  // reload wipes local state — otherwise the listing would show as "live" forever with nobody there.
  if (liveItemId) {
    cleanupLive();
    await new Promise((r) => setTimeout(r, 400));
  }
  localStorage.removeItem("pramoon_myname");
  localStorage.removeItem("pramoon_phone");
  localStorage.removeItem("pramoon_role");
  location.reload();
}

