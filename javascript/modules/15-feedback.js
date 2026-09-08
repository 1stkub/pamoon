/* ---------- feedback ---------- */
let fbNps = null;
let fbTrust = null;
function openFeedback() {
  fbNps = null;
  fbTrust = null;
  document.getElementById("fbFee").value = "";
  document.getElementById("fbComment").value = "";
  document.getElementById("fbError").style.display = "none";
  renderNpsGrid();
  renderTrustGrid();
  goTo("feedback");
}
function renderNpsGrid() {
  document.getElementById("npsGrid").innerHTML = Array.from(
    { length: 11 },
    (_, n) => n,
  )
    .map(
      (n) =>
        `<div class="chip-opt" style="padding:8px 4px; ${fbNps === n ? "border-color:var(--gold); background:var(--gold-soft); font-weight:700;" : ""}" onclick="pickNps(${n})">${n}</div>`,
    )
    .join("");
}
function pickNps(n) {
  fbNps = n;
  renderNpsGrid();
}
function renderTrustGrid() {
  document.getElementById("trustGrid").innerHTML = [1, 2, 3, 4, 5]
    .map(
      (n) =>
        `<div class="chip-opt" style="${fbTrust === n ? "border-color:var(--gold); background:var(--gold-soft); font-weight:700;" : ""}" onclick="pickTrust(${n})">${n}</div>`,
    )
    .join("");
}
function pickTrust(n) {
  fbTrust = n;
  renderTrustGrid();
}
async function submitFeedback() {
  const err = document.getElementById("fbError");
  if (fbNps === null || fbTrust === null) {
    err.textContent = "กรุณาให้คะแนนทั้งสองข้อก่อนส่ง";
    err.style.display = "block";
    return;
  }
  if (!db) {
    err.textContent =
      "ยังไม่ได้เชื่อมต่อฐานข้อมูล ตรวจสอบ Firebase config ก่อน";
    err.style.display = "block";
    return;
  }
  err.style.display = "none";
  const feeTolerance =
    parseFloat(document.getElementById("fbFee").value) || null;
  const comment = document.getElementById("fbComment").value.trim();
  try {
    await db.collection("feedback").add({
      name: myName,
      nps: fbNps,
      trust: fbTrust,
      feeTolerance,
      comment,
      at: Date.now(),
    });
    goTo("mine");
    alert("ขอบคุณสำหรับฟีดแบ็ก!");
  } catch (e) {
    err.textContent = "ส่งไม่สำเร็จ ลองใหม่อีกครั้ง";
    err.style.display = "block";
  }
}

