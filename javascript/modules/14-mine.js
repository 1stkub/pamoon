/* ---------- shop management, surfaced directly on "ของฉัน" ---------- */
let mineShopEditOpen = false;
let mineShopLogoDataUrl = null;
let mineShopWallpaperDataUrl = null;
let mineShopWallpaperRemoved = false;
function renderMineShopCard() {
  const el = document.getElementById("mineShopCard");
  if (!el || !myName) return;
  const shop = allShops[myName] || {};
  const shownName = shop.displayName || myName;
  const color = shop.bannerColor || "#14171F";
  const wallpaper = shop.wallpaper;
  const bannerStyle = wallpaper
    ? `background-image:url('${wallpaper}');`
    : `background:${color};`;
  const logo = shop.logo;
  el.innerHTML = `
    <div class="shop-banner ${wallpaper ? "has-wallpaper" : ""}" style="${bannerStyle}">
      <button class="shop-edit-btn" onclick="toggleMineShopEdit()">${mineShopEditOpen ? "ปิด" : "แก้ไขข้อมูลร้านค้า"}</button>
      <div class="shop-avatar">${logo ? `<img src="${logo}">` : esc(shownName.slice(0, 1).toUpperCase())}</div>
      <p class="shop-name">${esc(shownName)}</p>
      <p class="shop-bio">${esc(shop.bio || 'แตะ "แก้ไขข้อมูลร้านค้า" เพื่อตั้งชื่อร้าน โลโก้ คำโปรย และช่องทางติดต่อ')}</p>
    </div>
    <div class="profile-link" onclick="openShop(myName,'mine')">ดูหน้าร้านแบบที่คนอื่นเห็น &rarr;</div>`;
  const panel = document.getElementById("mineShopEditPanel");
  if (mineShopEditOpen) {
    panel.classList.remove("hidden");
    const preserved = captureFormValues(
      SHOP_FORM_FIELD_SUFFIXES.map((s) => "mineShop" + s),
    );
    renderMineShopEditForm();
    restoreFormValues(preserved);
  } else panel.classList.add("hidden");
}
function toggleMineShopEdit() {
  mineShopEditOpen = !mineShopEditOpen;
  mineShopLogoDataUrl = null;
  mineShopWallpaperDataUrl = null;
  mineShopWallpaperRemoved = false;
  renderMineShopCard();
}
function renderMineShopEditForm() {
  const panel = document.getElementById("mineShopEditPanel");
  const shop = allShops[myName] || {};
  const currentColor = shop.bannerColor || "#14171F";
  panel.innerHTML = `
    <div class="field"><label>ชื่อร้าน (แสดงแทนชื่อบัญชี ปล่อยว่างไว้ถ้าไม่ต้องการ)</label>
      <input type="text" id="mineShopDisplayNameInput" maxlength="30" placeholder="เช่น ร้านเจ๊หน่อยของเก่า" value="${esc(shop.displayName || "")}"></div>
    <div class="field"><label>สีหน้าร้าน (ใช้เมื่อไม่มีวอลเปเปอร์)</label><div class="swatch-row" id="mineShopColorRow"></div></div>
    <div class="field"><label>โลโก้/รูปร้าน</label>
      <input type="file" accept="image/*" onchange="handleMineShopLogoSelect(event)"
        style="width:100%; border:1px solid var(--line); border-radius:10px; padding:10px 12px; font-size:12.5px; background:#fff;">
      <div id="mineShopLogoPreview">${mineShopLogoDataUrl ? `<img src="${mineShopLogoDataUrl}" style="width:70px; height:70px; border-radius:50%; object-fit:cover; margin-top:8px;">` : ""}</div>
    </div>
    <div class="field"><label>วอลเปเปอร์หน้าร้าน (ไม่บังคับ)</label>
      <p style="font-size:11px; color:var(--ink-soft); margin:0 0 8px;">รูปกว้างจะสวยสุด ระบบจะตัดภาพให้เต็มพื้นที่แบนเนอร์อัตโนมัติ</p>
      <input type="file" accept="image/*" onchange="handleMineShopWallpaperSelect(event)"
        style="width:100%; border:1px solid var(--line); border-radius:10px; padding:10px 12px; font-size:12.5px; background:#fff;">
      <div id="mineShopWallpaperPreview">${mineShopWallpaperDataUrl || (!mineShopWallpaperRemoved && shop.wallpaper) ? `<img src="${mineShopWallpaperDataUrl || shop.wallpaper}" style="width:100%; height:70px; object-fit:cover; border-radius:8px; margin-top:8px;">` : ""}</div>
      ${mineShopWallpaperDataUrl || (!mineShopWallpaperRemoved && shop.wallpaper) ? `<button type="button" onclick="removeMineShopWallpaper()" style="margin:6px 0 0; width:auto; padding:6px 10px; font-size:11px; background:transparent; border:1px solid var(--line); border-radius:8px; color:var(--red); cursor:pointer;">ลบวอลเปเปอร์</button>` : ""}
    </div>
    <div class="field"><label>คำโปรยสั้นๆ (ขึ้นบนสุดของหน้าร้าน)</label>
      <textarea id="mineShopBioInput" maxlength="140" placeholder="บอกลูกค้าเกี่ยวกับร้านคุณสั้นๆ">${esc(shop.bio || "")}</textarea>
    </div>
    <div class="field"><label>เกี่ยวกับร้าน (รายละเอียดเพิ่มเติม)</label>
      <textarea id="mineShopAboutInput" maxlength="500" placeholder="แนะนำร้าน ขายอะไรเป็นหลัก ขายมานานแค่ไหน ฯลฯ">${esc(shop.about || "")}</textarea>
    </div>
    <div class="field"><label>ช่องทางการติดต่อ</label>
      <textarea id="mineShopContactInput" maxlength="200" placeholder="เช่น LINE: @shopname, โทร 08x-xxx-xxxx, IG: @shopname">${esc(shop.contact || "")}</textarea>
    </div>
    <button class="btn btn-primary" onclick="saveMineShop()">บันทึกหน้าร้าน</button>`;
  document.getElementById("mineShopColorRow").innerHTML = SHOP_COLORS.map(
    (c) =>
      `<div class="swatch ${currentColor === c ? "selected" : ""}" style="background:${c};" onclick="pickMineBannerColor('${c}')"></div>`,
  ).join("");
}
function pickMineBannerColor(c) {
  allShops[myName] = Object.assign({}, allShops[myName] || {}, {
    bannerColor: c,
  });
  renderMineShopCard();
}
function handleMineShopLogoSelect(ev) {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = "";
  if (!file) return;
  openCropModal(
    file,
    { frameSize: 220, outputSize: 300, quality: 0.75 },
    (dataUrl) => {
      mineShopLogoDataUrl = dataUrl;
      document.getElementById("mineShopLogoPreview").innerHTML =
        `<img src="${dataUrl}" style="width:70px; height:70px; border-radius:50%; object-fit:cover; margin-top:8px;">`;
    },
  );
}
function handleMineShopWallpaperSelect(ev) {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = "";
  if (!file) return;
  compressImageFile(
    file,
    1000,
    0.7,
    (dataUrl) => {
      mineShopWallpaperDataUrl = dataUrl;
      mineShopWallpaperRemoved = false;
      renderMineShopEditForm();
    },
    (err) => alert(err),
  );
}
function removeMineShopWallpaper() {
  mineShopWallpaperDataUrl = null;
  mineShopWallpaperRemoved = true;
  renderMineShopEditForm();
}
async function saveMineShop() {
  if (!db || !myName) return;
  const displayName = document
    .getElementById("mineShopDisplayNameInput")
    .value.trim()
    .slice(0, 30);
  const bio = document
    .getElementById("mineShopBioInput")
    .value.trim()
    .slice(0, 140);
  const about = document
    .getElementById("mineShopAboutInput")
    .value.trim()
    .slice(0, 500);
  const contact = document
    .getElementById("mineShopContactInput")
    .value.trim()
    .slice(0, 200);
  const data = {
    bannerColor: (allShops[myName] || {}).bannerColor || "#14171F",
    displayName,
    bio,
    about,
    contact,
    updatedAt: Date.now(),
  };
  if (mineShopLogoDataUrl) data.logo = mineShopLogoDataUrl;
  if (mineShopWallpaperDataUrl) data.wallpaper = mineShopWallpaperDataUrl;
  else if (mineShopWallpaperRemoved)
    data.wallpaper = firebase.firestore.FieldValue.delete();
  try {
    await db.doc("shops/" + myName).set(data, { merge: true });
    mineShopEditOpen = false;
    mineShopLogoDataUrl = null;
    mineShopWallpaperDataUrl = null;
    mineShopWallpaperRemoved = false;
    renderMineShopCard();
  } catch (e) {
    console.error("saveMineShop failed", e);
    alert("บันทึกหน้าร้านไม่สำเร็จ: " + ((e && e.message) || e));
  }
}

/* ---------- buyer-side self profile, surfaced on "ของฉัน" instead of the shop card — deliberately
   simpler than the shop profile (just avatar + short bio, no banner/wallpaper/about/contact) since
   a bidder isn't running a storefront, per user request to visibly separate the two roles' UI ---------- */
let myProfile = {}; // cached from users/{phone}
let mineProfileEditOpen = false;
let mineProfileAvatarDataUrl = null;
function subscribeMyProfile() {
  const phone = localStorage.getItem("pramoon_phone");
  if (!db || !phone) return;
  db.doc("users/" + phone).onSnapshot((snap) => {
    myProfile = snap.exists ? snap.data() : {};
    if (
      myRole !== "seller" &&
      !document.getElementById("screen-mine").classList.contains("hidden")
    )
      renderMineProfileCard();
  });
}
function renderMineProfileCard() {
  const el = document.getElementById("mineProfileCard");
  if (!el || !myName) return;
  const avatar = myProfile.avatar;
  el.innerHTML = `
    <div class="shop-banner" style="background:#2B6350;">
      <button class="shop-edit-btn" onclick="toggleMineProfileEdit()">${mineProfileEditOpen ? "ปิด" : "แก้ไขโปรไฟล์"}</button>
      <div class="shop-avatar">${avatar ? `<img src="${avatar}">` : esc(myName.slice(0, 1).toUpperCase())}</div>
      <p class="shop-name">${esc(myName)}</p>
      <p class="shop-bio">${esc(myProfile.bio || 'แตะ "แก้ไขโปรไฟล์" เพื่อใส่รูปและข้อมูลสั้นๆ เกี่ยวกับตัวคุณ')}</p>
    </div>`;
  const panel = document.getElementById("mineProfileEditPanel");
  if (mineProfileEditOpen) {
    panel.classList.remove("hidden");
    const preserved = captureFormValues(["profileBioInput"]);
    renderMineProfileEditForm();
    restoreFormValues(preserved);
  } else panel.classList.add("hidden");
}
function toggleMineProfileEdit() {
  mineProfileEditOpen = !mineProfileEditOpen;
  mineProfileAvatarDataUrl = null;
  renderMineProfileCard();
}
function renderMineProfileEditForm() {
  const panel = document.getElementById("mineProfileEditPanel");
  panel.innerHTML = `
    <div class="profile-link" onclick="changeMyName()" style="margin-bottom:14px;">เปลี่ยนชื่อ (${esc(myName)}) &rarr;</div>
    <div class="field"><label>รูปโปรไฟล์</label>
      <input type="file" accept="image/*" onchange="handleMineProfileAvatarSelect(event)"
        style="width:100%; border:1px solid var(--line); border-radius:10px; padding:10px 12px; font-size:12.5px; background:#fff;">
      <div id="mineProfileAvatarPreview">${mineProfileAvatarDataUrl || myProfile.avatar ? `<img src="${mineProfileAvatarDataUrl || myProfile.avatar}" style="width:70px; height:70px; border-radius:50%; object-fit:cover; margin-top:8px;">` : ""}</div>
    </div>
    <div class="field"><label>เกี่ยวกับตัวคุณสั้นๆ (ไม่บังคับ)</label>
      <textarea id="profileBioInput" maxlength="140" placeholder="เช่น ชอบสะสมการ์ด โปเกมอน, ตอบแชทไว">${esc(myProfile.bio || "")}</textarea>
    </div>
    <button class="btn btn-primary" onclick="saveMineProfile()">บันทึกโปรไฟล์</button>`;
}
function handleMineProfileAvatarSelect(ev) {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = "";
  if (!file) return;
  openCropModal(
    file,
    { frameSize: 220, outputSize: 300, quality: 0.75 },
    (dataUrl) => {
      mineProfileAvatarDataUrl = dataUrl;
      document.getElementById("mineProfileAvatarPreview").innerHTML =
        `<img src="${dataUrl}" style="width:70px; height:70px; border-radius:50%; object-fit:cover; margin-top:8px;">`;
    },
  );
}
async function saveMineProfile() {
  const phone = localStorage.getItem("pramoon_phone");
  if (!db || !phone) return;
  const bio = document
    .getElementById("profileBioInput")
    .value.trim()
    .slice(0, 140);
  const data = { bio, updatedAt: Date.now() };
  if (mineProfileAvatarDataUrl) data.avatar = mineProfileAvatarDataUrl;
  try {
    await db.doc("users/" + phone).update(data);
    mineProfileEditOpen = false;
    mineProfileAvatarDataUrl = null;
  } catch (e) {
    console.error("saveMineProfile failed", e);
    alert("บันทึกโปรไฟล์ไม่สำเร็จ: " + ((e && e.message) || e));
  }
}

/* ---------- mine ---------- */
function renderMine() {
  document.getElementById("mineNameLabel").textContent = myName;
  if (document.getElementById("screen-mine").classList.contains("hidden"))
    return;
  // แยก UI ให้เด่นชัดตามบทบาท — ร้านค้าเห็น/แก้ไขหน้าร้าน, ผู้ประมูลเห็น/แก้ไขโปรไฟล์ผู้ประมูลของตัวเอง
  // (ชื่อ รูป ข้อมูลสั้นๆ) แทน ไม่ใช่หน้าร้านที่ไม่เกี่ยวกับตัวเอง
  const isSellerRole = myRole === "seller";
  document
    .getElementById("mineSellerSection")
    .classList.toggle("hidden", !isSellerRole);
  document
    .getElementById("mineBuyerSection")
    .classList.toggle("hidden", isSellerRole);
  if (isSellerRole) renderMineShopCard();
  else renderMineProfileCard();
  renderMineListingsAndBids();
}
// called on every items-collection update (a bid landing on ANYONE's listing, anywhere) — deliberately
// does NOT touch the shop/profile card at all. That card only needs to refresh from its own data
// source (subscribeShops()/subscribeMyProfile()) or when first navigating to this screen — re-rendering
// it here too, on every unrelated item change, was destroying input focus and wiping in-progress typing
// in the shop-edit form (and could cut off an async photo upload/crop mid-flight), reported as
// "แก้ไขหน้าร้านค้า...กดช่องนู้นข้อความหาย กดบันทึกกดกลับมาหาย"
function renderMineListingsAndBids() {
  if (document.getElementById("screen-mine").classList.contains("hidden"))
    return;
  const mineListings = allItems
    .filter((i) => i.sellerName === myName)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const mineBids = allItems
    .filter(
      (i) =>
        i.sellerName !== myName &&
        (i.highestBidderName === myName ||
          (i.log || []).some((l) => l.name === myName)),
    )
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const row = (i, isBidRow) => {
    const closed = itemIsClosed(i);
    const leading = i.highestBidderName === myName;
    let status = closed
      ? i.bidCount
        ? leading
          ? "คุณชนะ"
          : "ไม่ชนะ"
        : "ไม่มีผู้บิด"
      : leading
        ? "คุณนำอยู่"
        : "มีคนนำอยู่";
    return `<div class="card" style="margin-bottom:8px; display:flex; align-items:center;" onclick="openItem('${i.id}')">
      <div class="card-body" style="flex:1;">
        <p class="card-title">${esc(i.name)}</p>
        <div class="card-row"><span class="price">${fmtPrice(i.price)}</span><span class="meta">${esc(status)}</span></div>
      </div>
      ${isBidRow && hasUnseenOutbid(i) ? `<span class="convo-unread-dot"></span>` : ""}
    </div>`;
  };
  document.getElementById("mineListings").innerHTML = mineListings.length
    ? mineListings.map((i) => row(i, false)).join("")
    : `<p style="color:var(--ink-soft); font-size:12.5px;">ยังไม่มีสินค้าที่คุณลง</p>`;
  document.getElementById("mineBids").innerHTML = mineBids.length
    ? mineBids.map((i) => row(i, true)).join("")
    : `<p style="color:var(--ink-soft); font-size:12.5px;">ยังไม่มีการบิด</p>`;
}

