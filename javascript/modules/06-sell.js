/* ---------- sell ---------- */
function openSell() {
  editingItemId = null;
  selectedSellCat = null;
  selectedSellSubcat = null;
  selectedSellDuration = null;
  sellPhotos = [];
  document.getElementById("sellName").value = "";
  document.getElementById("sellDescription").value = "";
  document.getElementById("sellPrice").value = "";
  document.getElementById("sellBuyNowPrice").value = "";
  document.getElementById("sellPhotoInput").value = "";
  document.getElementById("sellError").style.display = "none";
  document.getElementById("sellAsName").textContent = myName;
  document.getElementById("sellScreenTitle").textContent =
    "ลงประกาศสินค้าประมูล";
  document.getElementById("sellSubmitBtn").textContent = "ลงประกาศ";
  document.getElementById("sellBackBtn").onclick = () => goTo("feed");
  document.getElementById("sellDurationEditHint").classList.add("hidden");
  renderSellCatGrid();
  renderSellSubcatGrid();
  renderSellDurationGrid();
  renderSellPhotoGrid();
  document.getElementById("sellFeeNote").textContent =
    "เลือกหมวดหมู่เพื่อดูค่าคอมมิชชั่นตัวอย่าง (เดโม ยังไม่หักเงินจริง)";
  goTo("sell");
}
// seller-only: edit an existing listing within its 30-min/no-bids-yet window (see EDIT_WINDOW_MS) —
// reuses the same sell form/screen, just pre-filled and writing back to the same doc on submit
function openEditListing(itemId) {
  const it = findItem(itemId);
  if (!it || it.sellerName !== myName) return;
  if (
    (it.bidCount || 0) > 0 ||
    Date.now() - (it.createdAt || 0) > EDIT_WINDOW_MS
  ) {
    alert("แก้ไขไม่ได้แล้ว — เลยเวลา 30 นาทีหลังลงประกาศ หรือมีผู้บิดแล้ว");
    return;
  }
  editingItemId = itemId;
  selectedSellCat = it.cat;
  selectedSellSubcat = it.subcat || null;
  selectedSellDuration = null; // duration re-picked fresh; editing restarts the countdown from now
  sellPhotos = itemPhotos(it).slice();
  document.getElementById("sellName").value = it.name || "";
  document.getElementById("sellDescription").value = it.description || "";
  document.getElementById("sellPrice").value = it.startPrice || it.price || "";
  document.getElementById("sellBuyNowPrice").value = it.buyNowPrice || "";
  document.getElementById("sellPhotoInput").value = "";
  document.getElementById("sellError").style.display = "none";
  document.getElementById("sellAsName").textContent = myName;
  document.getElementById("sellScreenTitle").textContent = "แก้ไขประกาศ";
  document.getElementById("sellSubmitBtn").textContent = "บันทึกการแก้ไข";
  document.getElementById("sellBackBtn").onclick = () => openItem(itemId);
  document.getElementById("sellDurationEditHint").classList.remove("hidden");
  renderSellCatGrid();
  renderSellSubcatGrid();
  renderSellDurationGrid();
  renderSellPhotoGrid();
  const c = catInfo(it.cat);
  document.getElementById("sellFeeNote").textContent =
    `หมวด "${c.name}" ค่าคอมมิชชั่นตัวอย่าง ${c.fee}% ของราคาปิดประมูล (เดโม — ยังไม่เชื่อมระบบชำระเงินจริง จึงยังไม่หักจริง)`;
  goTo("sell");
}
async function deleteListing(itemId) {
  const it = findItem(itemId);
  if (!it || it.sellerName !== myName || !db) return;
  if (
    (it.bidCount || 0) > 0 ||
    Date.now() - (it.createdAt || 0) > EDIT_WINDOW_MS
  ) {
    alert("ลบไม่ได้แล้ว — เลยเวลา 30 นาทีหลังลงประกาศ หรือมีผู้บิดแล้ว");
    return;
  }
  if (!confirm(`ลบประกาศ "${it.name}" ถาวร? — กู้คืนไม่ได้`)) return;
  try {
    // re-check against the live doc right before deleting — the 30-min/no-bid window could
    // have just closed (e.g. someone bid a second ago) since this screen last rendered
    const snap = await db.doc("items/" + itemId).get();
    if (!snap.exists) {
      goTo("feed");
      return;
    }
    const fresh = snap.data();
    if (
      (fresh.bidCount || 0) > 0 ||
      Date.now() - (fresh.createdAt || 0) > EDIT_WINDOW_MS
    ) {
      alert("ลบไม่ได้แล้ว — มีผู้บิดแล้วหรือเลยเวลาที่กำหนด");
      return;
    }
    await db.doc("items/" + itemId).delete();
    goTo("mine");
  } catch (e) {
    alert("ลบไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
}
function renderSellCatGrid() {
  document.getElementById("sellCatGrid").innerHTML = CATS.map(
    (c) =>
      `<div class="chip-opt ${selectedSellCat === c.id ? "selected" : ""}" onclick="pickSellCat('${c.id}')">${c.emoji} ${esc(c.name)}<br><span style="font-size:10.5px; color:var(--ink-soft);">ค่าคอม ${c.fee}%</span></div>`,
  ).join("");
}
function pickSellCat(id) {
  selectedSellCat = id;
  selectedSellSubcat = null; // switching category always clears any previously picked subcat
  renderSellCatGrid();
  renderSellSubcatGrid();
  const c = catInfo(id);
  document.getElementById("sellFeeNote").textContent =
    `หมวด "${c.name}" ค่าคอมมิชชั่นตัวอย่าง ${c.fee}% ของราคาปิดประมูล (เดโม — ยังไม่เชื่อมระบบชำระเงินจริง จึงยังไม่หักจริง)`;
}
function renderSellSubcatGrid() {
  const field = document.getElementById("sellSubcatField");
  const grid = document.getElementById("sellSubcatGrid");
  const textInput = document.getElementById("sellSubcatText");
  const label = document.getElementById("sellSubcatLabel");
  if (FREE_TEXT_SUBCAT_CATS.includes(selectedSellCat)) {
    field.classList.remove("hidden");
    label.textContent = "ชื่อเกม";
    grid.classList.add("hidden");
    grid.innerHTML = "";
    textInput.classList.remove("hidden");
    textInput.value = selectedSellSubcat || "";
    return;
  }
  textInput.classList.add("hidden");
  grid.classList.remove("hidden");
  label.textContent = "ประเภทย่อย (ไม่บังคับ)";
  const list = SUBCATS[selectedSellCat];
  if (!list) {
    field.classList.add("hidden");
    return;
  }
  field.classList.remove("hidden");
  grid.innerHTML = list
    .map(
      (s) =>
        `<div class="chip-opt ${selectedSellSubcat === s ? "selected" : ""}" onclick="pickSellSubcat('${esc(s)}')">${esc(s)}</div>`,
    )
    .join("");
}
function pickSellSubcat(s) {
  selectedSellSubcat = selectedSellSubcat === s ? null : s;
  renderSellSubcatGrid();
}
function renderSellDurationGrid() {
  document.getElementById("sellDurationGrid").innerHTML = DURATIONS.map(
    (d, idx) =>
      `<div class="chip-opt ${selectedSellDuration === idx ? "selected" : ""}" onclick="pickSellDuration(${idx})">${d.label}</div>`,
  ).join("");
}
function pickSellDuration(idx) {
  selectedSellDuration = idx;
  renderSellDurationGrid();
}

// first-layer, keyword-only content screening — catches obviously-named banned items
// (matches the categories already listed on the "กฎการใช้งาน" screen) before a listing is
// even created. This is text matching only: it cannot see what's actually in a photo, so it
// is not real content moderation — flagged to the user as a first layer, not a complete one.
const BANNED_KEYWORDS = [
  "ปืนจริง",
  "ปืนสั้น",
  "ปืนยาว",
  "กระสุนจริง",
  "ซองกระสุน",
  "ระเบิด",
  "วัตถุระเบิด",
  "ปืนไทยประดิษฐ์",
  "ยาเสพติด",
  "ยาบ้า",
  "ยาไอซ์",
  "ไอซ์เสพ",
  "โคเคน",
  "เฮโรอีน",
  "ยาอี ",
  "ยาเค ",
  "กัญชาเสพ",
  "ของปลอมแบรนด์",
  "ก็อปเกรดเอ",
  "เกรดเอเอเอ",
  "แบรนด์เนมปลอม",
  "ก๊อปแท้",
  "ของโจร",
  "ของขโมย",
  "สัตว์ป่าคุ้มครอง",
  "งาช้างแท้",
  "นอแรด",
  "คลิปโป๊",
  "หนังโป๊",
  "ภาพโป๊",
  "ขายบริการทางเพศ",
  "อวัยวะเพศ",
  "รูปหลุด",
  "คลิปหลุด",
  "วีดีโอหลุด",
  "เอวี ",
  "18+",
  "porn",
  "xxx nude",
  "child porn",
  "explosive",
  "firearm ammo",
];
function findBannedKeyword(text) {
  const lower = (text || "").toLowerCase();
  return BANNED_KEYWORDS.find((k) => lower.includes(k.toLowerCase())) || null;
}

/* ---------- community reporting — anti joke-listing / joke-bidding, closed-testing phase -----------
   Deliberately simple for this phase: anyone can flag a listing or the other party in a completed
   order, straight into a `reports` collection. There's no in-app admin screen yet — with a small
   closed friend-group, the founder reviews `reports` and adds bans directly via the Firestore
   console (see pramoon-project memory notes) rather than building a moderation UI before it's
   needed. Bans are keyed by PHONE NUMBER (`bannedUsers/{phone}`), not username, since a banned
   person could otherwise dodge a name-keyed ban with "เปลี่ยนชื่อ" — phone is the one identity that
   can't be changed without a new SIM (matches the existing "1 account per phone" model). -----------*/
let reportCtx = null; // { type:'listing'|'user', targetName, itemId, itemName }
const REPORT_REASONS = {
  listing: [
    "ประกาศปลอม/ไม่มีของขายจริง",
    "สินค้าผิดกฎ/ต้องห้าม",
    "สแปม/กวนเมือง",
    "หลอกลวง/เข้าข่ายฉ้อโกง",
    "อื่นๆ",
  ],
  user_seller: [
    "ขายแล้วไม่ส่งของ",
    "ของไม่ตรงปก/ปลอม",
    "เงียบหาย ติดต่อไม่ได้",
    "หลอกลวง/เข้าข่ายฉ้อโกง",
    "อื่นๆ",
  ],
  user_bidder: [
    "บิดเล่น ชนะแล้วไม่จ่าย",
    "เงียบหาย ติดต่อไม่ได้",
    "พฤติกรรมไม่เหมาะสมในแชท",
    "อื่นๆ",
  ],
};
function openReportModal(type, targetName, itemId, itemName, reasonSet) {
  reportCtx = {
    type,
    targetName,
    itemId,
    itemName,
    reasonSet: reasonSet || (type === "listing" ? "listing" : "user_seller"),
  };
  document.getElementById("reportTitle").textContent =
    type === "listing" ? "รายงานประกาศนี้" : `รายงาน "${targetName}"`;
  document.getElementById("reportSub").textContent =
    "เลือกเหตุผลที่ตรงที่สุด ทีมงานจะตรวจสอบให้ (ไม่ระบุตัวตนผู้รายงานให้อีกฝ่ายเห็น)";
  document.getElementById("reportReasonList").innerHTML = REPORT_REASONS[
    reportCtx.reasonSet
  ]
    .map(
      (r) =>
        `<button class="report-reason-btn" onclick="submitReport('${esc(r)}')">${esc(r)}</button>`,
    )
    .join("");
  document.getElementById("reportOverlay").classList.remove("hidden");
}
function closeReportModal() {
  document.getElementById("reportOverlay").classList.add("hidden");
  reportCtx = null;
}
async function submitReport(reason) {
  if (!reportCtx || !db) return;
  const ctx = reportCtx;
  closeReportModal();
  try {
    await db.collection("reports").add({
      type: ctx.type,
      reason,
      targetName: ctx.targetName || null,
      itemId: ctx.itemId || null,
      itemName: ctx.itemName || null,
      reporterName: myName,
      status: "open",
      at: Date.now(),
    });
    alert(
      "ส่งรายงานแล้ว ขอบคุณที่ช่วยดูแลชุมชน — ทีมงานจะตรวจสอบให้เร็วที่สุด",
    );
  } catch (e) {
    alert("ส่งรายงานไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
}

