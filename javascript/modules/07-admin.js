/* ---------- admin panel ---------- */
async function renderAdminPanel() {
  if (!myIsAdmin || !db) return;
  const reportsList = document.getElementById("adminReportsList");
  const bannedList = document.getElementById("adminBannedList");
  reportsList.innerHTML = `<p style="color:var(--ink-soft); font-size:12.5px;">กำลังโหลด...</p>`;
  bannedList.innerHTML = `<p style="color:var(--ink-soft); font-size:12.5px;">กำลังโหลด...</p>`;

  try {
    const reportsSnap = await db
      .collection("reports")
      .where("status", "==", "open")
      .get();
    const reports = reportsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.at || 0) - (a.at || 0));
    reportsList.innerHTML = reports.length
      ? reports
          .map((r) => {
            const typeLabel = r.type === "listing" ? "🚩 ประกาศ" : "🚩 ผู้ใช้";
            const targetLine =
              r.type === "listing"
                ? esc(r.itemName || "ไม่ทราบชื่อสินค้า")
                : `${esc(r.targetName || "ไม่ทราบชื่อ")}${r.itemName ? " — " + esc(r.itemName) : ""}`;
            return `<div class="card" style="padding:12px; margin-bottom:8px;">
        <p style="margin:0 0 4px; font-size:12px; font-weight:700;">${typeLabel} · ${esc(r.reason || "")}</p>
        <p style="margin:0 0 8px; font-size:12px; color:var(--ink-soft);">${targetLine}<br>รายงานโดย ${esc(r.reporterName || "ไม่ทราบ")} · ${fmtChatTime(r.at || 0)}</p>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          ${r.itemId ? `<button class="btn btn-outline" style="margin:0; width:auto; padding:7px 10px; font-size:11.5px;" onclick="openItem('${r.itemId}')">ดูประกาศ</button>` : ""}
          ${r.itemId ? `<button class="btn btn-outline" style="margin:0; width:auto; padding:7px 10px; font-size:11.5px; color:var(--red); border-color:var(--red);" onclick="adminDeleteListing('${r.itemId}','${r.id}')">ลบประกาศ</button>` : ""}
          ${r.type === "user" && r.targetName ? `<button class="btn btn-outline" style="margin:0; width:auto; padding:7px 10px; font-size:11.5px; color:var(--red); border-color:var(--red);" onclick="adminBanFromReport('${esc(r.targetName)}','${r.id}')">แบนผู้ใช้นี้</button>` : ""}
          <button class="btn btn-outline" style="margin:0; width:auto; padding:7px 10px; font-size:11.5px;" onclick="adminResolveReport('${r.id}')">ปิดเรื่อง (ไม่ต้องแบน)</button>
        </div>
      </div>`;
          })
          .join("")
      : `<p style="color:var(--ink-soft); font-size:12.5px; text-align:center; margin:10px 0;">ไม่มีรายงานค้างอยู่ ✓</p>`;
  } catch (e) {
    reportsList.innerHTML = `<p style="color:var(--red); font-size:12.5px;">โหลดรายงานไม่สำเร็จ: ${esc(e.message || e)}</p>`;
  }

  try {
    const bannedSnap = await db.collection("bannedUsers").get();
    const banned = bannedSnap.docs.map((d) => ({ phone: d.id, ...d.data() }));
    bannedList.innerHTML = banned.length
      ? banned
          .map(
            (b) => `
      <div class="card" style="padding:10px 12px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; gap:10px;">
        <div style="min-width:0;"><p style="margin:0; font-size:12.5px; font-weight:700;">${esc(b.name || "(ไม่ทราบชื่อ)")}</p><p style="margin:2px 0 0; font-size:11px; color:var(--ink-soft);">${esc(b.phone)} · ${esc(b.reason || "ไม่ระบุเหตุผล")}</p></div>
        <button class="btn btn-outline" style="margin:0; width:auto; padding:6px 10px; font-size:11px; flex-shrink:0;" onclick="adminUnban('${b.phone}')">ยกเลิกแบน</button>
      </div>`,
          )
          .join("")
      : `<p style="color:var(--ink-soft); font-size:12.5px; text-align:center; margin:10px 0;">ไม่มีใครถูกแบนอยู่</p>`;
  } catch (e) {
    bannedList.innerHTML = `<p style="color:var(--red); font-size:12.5px;">โหลดรายชื่อที่แบนไม่สำเร็จ: ${esc(e.message || e)}</p>`;
  }
}
// admin delete bypasses ownership + the 30-min/no-bid edit window entirely — this is a
// moderation action, not the seller's own edit/delete (see deleteListing/EDIT_WINDOW_MS)
async function adminDeleteListing(itemId, reportId) {
  if (!myIsAdmin || !db) return;
  const it = findItem(itemId);
  if (
    !confirm(
      `ลบประกาศ "${it ? it.name : itemId}" ถาวรในฐานะแอดมิน?\n\nกู้คืนไม่ได้`,
    )
  )
    return;
  try {
    const subcols = ["messages", "liveSignals", "liveChat"];
    for (const sc of subcols) {
      const sub = await db.collection("items/" + itemId + "/" + sc).get();
      await Promise.all(sub.docs.map((d) => d.ref.delete()));
    }
    await db.doc("items/" + itemId).delete();
    if (reportId)
      await db
        .doc("reports/" + reportId)
        .update({
          status: "resolved",
          resolvedAt: Date.now(),
          resolvedBy: myName,
          action: "deleted",
        });
    alert("ลบประกาศแล้ว");
    renderAdminPanel();
  } catch (e) {
    alert("ลบไม่สำเร็จ: " + ((e && e.message) || e));
  }
}
// bans are phone-keyed (see checkBanned) but a report only carries the display name at the time
// it was filed — usernames aren't guaranteed unique across phones (only "1 account per phone" is
// enforced, not "1 phone per name"), so this only proceeds when the name resolves to EXACTLY one
// account; otherwise it says so and points at the manual by-phone ban instead of guessing.
async function adminBanFromReport(targetName, reportId) {
  if (!myIsAdmin || !db) return;
  const snap = await db
    .collection("users")
    .where("username", "==", targetName)
    .get();
  if (snap.size !== 1) {
    alert(
      snap.size === 0
        ? `หาบัญชีของ "${targetName}" ไม่เจอ (อาจเปลี่ยนชื่อไปแล้ว) — ลองแบนด้วยเบอร์โทรโดยตรงแทน`
        : `มีมากกว่า 1 บัญชีใช้ชื่อ "${targetName}" — ลองแบนด้วยเบอร์โทรโดยตรงแทนเพื่อความชัวร์`,
    );
    return;
  }
  const phone = snap.docs[0].id;
  if (phone === localStorage.getItem("pramoon_phone")) {
    alert("แบนเบอร์ตัวเองไม่ได้ครับ — จะทำให้ออกจากระบบไม่ได้");
    return;
  }
  if (!confirm(`แบนเบอร์ ${phone} (${targetName})?`)) return;
  await db
    .doc("bannedUsers/" + phone)
    .set({
      reason: "รายงานจากผู้ใช้",
      bannedAt: Date.now(),
      bannedBy: myName,
      name: targetName,
    });
  if (reportId)
    await db
      .doc("reports/" + reportId)
      .update({
        status: "resolved",
        resolvedAt: Date.now(),
        resolvedBy: myName,
        action: "banned",
      });
  alert("แบนแล้ว");
  renderAdminPanel();
}
async function adminResolveReport(reportId) {
  if (!myIsAdmin || !db) return;
  await db
    .doc("reports/" + reportId)
    .update({
      status: "resolved",
      resolvedAt: Date.now(),
      resolvedBy: myName,
      action: "dismissed",
    });
  renderAdminPanel();
}
async function adminBanByPhone() {
  if (!myIsAdmin || !db) return;
  const phone = document
    .getElementById("adminBanPhoneInput")
    .value.replace(/\D/g, "");
  const reason = document
    .getElementById("adminBanReasonInput")
    .value.trim()
    .slice(0, 200);
  if (!/^0\d{9}$/.test(phone)) {
    alert("กรอกเบอร์โทร 10 หลักให้ถูกต้อง เช่น 0812345678");
    return;
  }
  // banning your own phone would lock the checkBanned() gate against yourself on next login/reload
  // (see boot-time re-check) — recoverable only by another admin editing Firestore directly, so
  // refuse it outright rather than let a mis-click strand the admin
  if (phone === localStorage.getItem("pramoon_phone")) {
    alert("แบนเบอร์ตัวเองไม่ได้ครับ — จะทำให้ออกจากระบบไม่ได้");
    return;
  }
  if (!confirm(`แบนเบอร์ ${phone}?`)) return;
  await db
    .doc("bannedUsers/" + phone)
    .set({
      reason: reason || "แบนโดยแอดมิน",
      bannedAt: Date.now(),
      bannedBy: myName,
    });
  document.getElementById("adminBanPhoneInput").value = "";
  document.getElementById("adminBanReasonInput").value = "";
  renderAdminPanel();
}
async function adminUnban(phone) {
  if (!myIsAdmin || !db) return;
  if (!confirm(`ยกเลิกแบนเบอร์ ${phone}?`)) return;
  await db.doc("bannedUsers/" + phone).delete();
  renderAdminPanel();
}
// re-checked at boot and at login — a banned phone can neither log in fresh nor keep using an
// already-open session once the app reloads. Enforcement inside submitBid/buyNow/submitListing
// below is defense-in-depth for a session that's still open when the ban lands.
let myBanned = false;
// races a promise against a plain timer so a slow/stuck network call can never freeze the UI
// indefinitely — resolves to `fallback` if `ms` passes first (the original call may still finish
// later in the background; we just stop waiting on it for the UI's sake)
function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}
async function checkBanned(phone) {
  if (!db || !phone) return false;
  try {
    const snap = await withTimeout(
      db.doc("bannedUsers/" + phone).get(),
      6000,
      null,
    );
    return !!(snap && snap.exists);
  } catch (e) {
    return false;
  }
}

// admin access is granted manually (a doc added to `admins/{phone}` — no in-app "make someone
// admin" button on purpose, so it can't be self-granted or granted by mistake through the UI).
// Enforcement here is purely client-side, same trust model as the rest of the app in this
// no-real-auth phase — real security would need this checked in Firestore rules too, once there
// are rules to check it against.
let myIsAdmin = false;
async function checkAdmin(phone) {
  if (!db || !phone) return false;
  try {
    const snap = await withTimeout(db.doc("admins/" + phone).get(), 6000, null);
    return !!(snap && snap.exists);
  } catch (e) {
    return false;
  }
}
async function submitListing() {
  const err = document.getElementById("sellError");
  const name = document.getElementById("sellName").value.trim();
  const price = parseInt(document.getElementById("sellPrice").value, 10);
  const buyNowRaw = document.getElementById("sellBuyNowPrice").value.trim();
  const buyNowPrice = buyNowRaw ? parseInt(buyNowRaw, 10) : null;
  if (!db) {
    err.textContent =
      "ยังไม่ได้เชื่อมต่อฐานข้อมูล ตรวจสอบ Firebase config ก่อน";
    err.style.display = "block";
    return;
  }
  if (await checkBanned(localStorage.getItem("pramoon_phone"))) {
    err.textContent = "บัญชีนี้ถูกระงับการใช้งาน ลงประกาศไม่ได้";
    err.style.display = "block";
    return;
  }
  if (
    !name ||
    !selectedSellCat ||
    !price ||
    price <= 0 ||
    selectedSellDuration === null
  ) {
    const missing = [];
    if (!name) missing.push("ชื่อสินค้า");
    if (!selectedSellCat) missing.push("หมวดหมู่");
    if (!price || price <= 0) missing.push("ราคาเริ่มต้น");
    if (selectedSellDuration === null)
      missing.push("ระยะเวลา (ต้องเลือกใหม่ทุกครั้งที่แก้ไข)");
    err.textContent = "กรุณากรอกข้อมูลให้ครบ: " + missing.join(", ");
    err.style.display = "block";
    return;
  }
  if (buyNowRaw && (!buyNowPrice || buyNowPrice <= price)) {
    err.textContent =
      "ราคาปิดประมูลทันทีต้องสูงกว่าราคาเริ่มต้น หรือเว้นว่างไว้ถ้าไม่ต้องการ";
    err.style.display = "block";
    return;
  }
  // เพดานเดียวกับที่บิดปกติห้ามเกิน — กันตั้งราคาซื้อทันทีสูงเว่อร์จนไม่มีใครกดได้จริง (หรือพิมพ์เลขศูนย์เกิน)
  if (buyNowRaw && buyNowPrice > price * MAX_BID_MULTIPLIER) {
    err.textContent = `ราคาปิดประมูลทันทีตั้งได้ไม่เกิน ${fmtPrice(price * MAX_BID_MULTIPLIER)} (${MAX_BID_MULTIPLIER} เท่าของราคาเริ่มต้น)`;
    err.style.display = "block";
    return;
  }
  if (sellPhotos.length < MIN_PHOTOS) {
    err.textContent = `อัปโหลดรูปสินค้าอย่างน้อย ${MIN_PHOTOS} รูปก่อนลงประกาศ`;
    err.style.display = "block";
    return;
  }
  const description = document
    .getElementById("sellDescription")
    .value.trim()
    .slice(0, 1000);
  const bannedHit = findBannedKeyword(name) || findBannedKeyword(description);
  if (bannedHit) {
    err.textContent = `ลงประกาศไม่ได้ — ชื่อ/รายละเอียดสินค้ามีคำที่เข้าข่ายสิ่งของต้องห้าม ("${bannedHit}") ตรวจสอบกฎการใช้งานก่อนลงใหม่`;
    err.style.display = "block";
    return;
  }
  err.style.display = "none";
  const dur = DURATIONS[selectedSellDuration];
  if (editingItemId) {
    const itemId = editingItemId;
    try {
      // re-check against the live doc — the 30-min/no-bid edit window could have just
      // closed (e.g. someone bid a second ago) since this screen was opened
      const snap = await db.doc("items/" + itemId).get();
      if (!snap.exists) {
        err.textContent = "ประกาศนี้ถูกลบไปแล้ว";
        err.style.display = "block";
        return;
      }
      const fresh = snap.data();
      if (
        fresh.sellerName !== myName ||
        (fresh.bidCount || 0) > 0 ||
        Date.now() - (fresh.createdAt || 0) > EDIT_WINDOW_MS
      ) {
        err.textContent =
          "แก้ไขไม่ได้แล้ว — มีผู้บิดแล้วหรือเลยเวลา 30 นาทีหลังลงประกาศ";
        err.style.display = "block";
        return;
      }
      await db.doc("items/" + itemId).update({
        name,
        description,
        cat: selectedSellCat,
        subcat: selectedSellSubcat,
        price,
        startPrice: price,
        buyNowPrice,
        endsAt: Date.now() + dur.ms,
        photos: sellPhotos,
        photo: sellPhotos[0],
      });
      editingItemId = null;
      goTo("feed");
      openItem(itemId);
    } catch (e) {
      err.textContent =
        "บันทึกการแก้ไขไม่สำเร็จ ลองใหม่อีกครั้ง (" +
        ((e && e.code) || "error") +
        ")";
      err.style.display = "block";
    }
    return;
  }
  try {
    const ref = await db.collection("items").add({
      name,
      description,
      cat: selectedSellCat,
      subcat: selectedSellSubcat,
      price,
      startPrice: price,
      buyNowPrice,
      bidCount: 0,
      endsAt: Date.now() + dur.ms,
      createdAt: Date.now(),
      sellerName: myName,
      highestBidderName: null,
      status: "active",
      log: [],
      photos: sellPhotos,
      photo: sellPhotos[0],
    });
    goTo("feed");
    openItem(ref.id);
  } catch (e) {
    err.textContent =
      "ลงประกาศไม่สำเร็จ ลองใหม่อีกครั้ง (" + ((e && e.code) || "error") + ")";
    err.style.display = "block";
  }
}

