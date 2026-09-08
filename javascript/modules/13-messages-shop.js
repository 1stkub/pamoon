/* ---------- messages / conversation list ---------- */
function renderMessages() {
  const list = document.getElementById("messagesList");
  const convos = allItems
    .filter((i) => {
      const isSeller = i.sellerName === myName,
        isLeader = i.highestBidderName === myName;
      return (
        itemIsClosed(i) &&
        i.bidCount > 0 &&
        (isSeller || isLeader) &&
        !(isSeller && isLeader)
      );
    })
    .sort((a, b) => (b.endsAt || 0) - (a.endsAt || 0));

  if (!db) {
    list.innerHTML = `<p style="color:var(--ink-soft); font-size:13px; text-align:center; margin-top:40px;">ยังไม่ได้เชื่อมต่อฐานข้อมูล</p>`;
    return;
  }
  if (!convos.length) {
    list.innerHTML = `<p style="color:var(--ink-soft); font-size:13px; text-align:center; margin-top:40px;">ยังไม่มีบทสนทนา — จะมีขึ้นอัตโนมัติเมื่อคุณชนะ/ขายของได้</p>`;
    return;
  }
  list.innerHTML = convos
    .map((i) => {
      const isSeller = i.sellerName === myName;
      const other = isSeller ? i.highestBidderName : i.sellerName;
      const c = catInfo(i.cat);
      const convoPhoto = itemPhotos(i)[0];
      const thumb = convoPhoto ? `<img src="${convoPhoto}" alt="">` : c.emoji;
      return `<div class="convo-row" onclick="openChatFull('${i.id}','messages')">
      <div class="convo-thumb">${thumb}</div>
      <div class="convo-body">
        <p class="convo-title">${esc(other)}</p>
        <p class="convo-sub">${esc(i.name)} · ${fmtPrice(i.price)}</p>
      </div>
      ${hasUnreadChat(i) ? `<span class="convo-unread-dot"></span>` : ""}
    </div>`;
    })
    .join("");
}

/* ---------- shop / seller storefront ---------- */
const SHOP_COLORS = [
  "#14171F",
  "#C8862B",
  "#C13B33",
  "#3E7A4C",
  "#2F5D8A",
  "#7A4C8C",
];
let viewingShopName = null;
let shopReturnScreen = "feed"; // where an individual shop page's back button goes
let shopsReturnScreen = "cat"; // where the shop directory's back button goes
let allShops = {}; // name -> {bannerColor, logo, bio} from the shops collection

function subscribeShops() {
  db.collection("shops").onSnapshot((snap) => {
    allShops = {};
    snap.docs.forEach((d) => {
      allShops[d.id] = d.data();
    });
    if (!document.getElementById("screen-shops").classList.contains("hidden"))
      renderShopDirectory();
    if (!document.getElementById("screen-mine").classList.contains("hidden"))
      renderMineShopCard();
    if (!document.getElementById("screen-cat").classList.contains("hidden"))
      renderRecoShops();
  });
}
function renderShopDirectory() {
  const q = document
    .getElementById("shopSearchInput")
    .value.trim()
    .toLowerCase();
  const names = new Set();
  allItems.forEach((i) => {
    if (i.sellerName) names.add(i.sellerName);
  });
  Object.keys(allShops).forEach((n) => names.add(n));
  let list = Array.from(names)
    .filter((n) => {
      const shownName = (allShops[n] || {}).displayName || n;
      return n.toLowerCase().includes(q) || shownName.toLowerCase().includes(q);
    })
    .sort((a, b) => a.localeCompare(b, "th"));
  const el = document.getElementById("shopDirectoryList");
  if (!list.length) {
    el.innerHTML = `<p style="color:var(--ink-soft); font-size:13px; text-align:center; margin-top:40px;">${q ? "ไม่พบร้านค้าที่ค้นหา" : "ยังไม่มีร้านค้าในระบบ"}</p>`;
    return;
  }
  el.innerHTML = list
    .map((n) => {
      const shop = allShops[n] || {};
      const shownName = shop.displayName || n;
      const activeCount = allItems.filter(
        (i) => i.sellerName === n && itemIsClosed(i) === false,
      ).length;
      const color = shop.bannerColor || "#14171F";
      return `<div class="shop-dir-row" onclick="openShop('${esc(n)}','shops')">
      <div class="shop-dir-avatar" style="background:${color};">${shop.logo ? `<img src="${shop.logo}">` : esc(shownName.slice(0, 1).toUpperCase())}</div>
      <div><p class="shop-dir-name">${esc(shownName)}</p><p class="shop-dir-sub">${activeCount} รายการกำลังประมูล</p></div>
    </div>`;
    })
    .join("");
}
let shopUnsub = null;
let shopData = {};
let shopTab = "active";
let shopEditOpen = false;
let shopLogoDataUrl = null;
let shopWallpaperDataUrl = null;
let shopWallpaperRemoved = false;

let shopReviews = [];
let shopReviewsUnsub = null;

function openShop(name, returnScreen) {
  if (!name) return;
  closeShop();
  viewingShopName = name;
  shopTab = "active";
  shopReturnScreen = returnScreen || "feed";
  goTo("shop");
  renderShopItems();
  if (!db) return;
  shopUnsub = db.doc("shops/" + name).onSnapshot((snap) => {
    shopData = snap.exists ? snap.data() : {};
    renderShopHeader();
  });
  shopReviewsUnsub = db
    .collection("shops/" + name + "/reviews")
    .onSnapshot((snap) => {
      shopReviews = snap.docs.map((d) => d.data());
      renderShopHeader();
    });
}
function closeShop() {
  if (shopUnsub) {
    shopUnsub();
    shopUnsub = null;
  }
  if (shopReviewsUnsub) {
    shopReviewsUnsub();
    shopReviewsUnsub = null;
  }
  viewingShopName = null;
  shopData = {};
  shopReviews = [];
  shopEditOpen = false;
  shopLogoDataUrl = null;
  shopWallpaperDataUrl = null;
  shopWallpaperRemoved = false;
}
// เกณฑ์ badge ทั้งหมดคำนวณจากพฤติกรรมจริงที่ระบบวัดเอง ไม่ใช่สิ่งที่ร้านกรอกเอง ตามคอนเซปที่วางไว้
function getTopSellerNames(limit) {
  const counts = {};
  const since = Date.now() - 1000 * 60 * 60 * 24 * 30;
  allItems.forEach((i) => {
    if (i.receivedAt && i.receivedAt >= since)
      counts[i.sellerName] = (counts[i.sellerName] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map((e) => e[0]);
}
function computeShopBadges(name, avgStars, reviewCount) {
  const badges = [];
  const items = allItems.filter((i) => i.sellerName === name);
  const firstListingAt = items.length
    ? Math.min(...items.map((i) => i.createdAt || Date.now()))
    : Date.now();
  if (
    reviewCount < 10 ||
    Date.now() - firstListingAt < 1000 * 60 * 60 * 24 * 30
  )
    badges.push("🆕 ร้านใหม่");
  if (avgStars >= 4.5 && reviewCount >= 50) badges.push("✅ ร้านน่าเชื่อถือ");
  const completed = items.filter((i) => i.receivedAt);
  // ไม่มีขั้นตอน "ผู้ขายกดยืนยันส่งของ" แยกแล้ว (นัดกันเองในแชท) ใช้ปิดประมูล→ยืนยันรับของแทนเป็นตัวชี้วัดความไว
  const durations = completed
    .filter((i) => i.closedAt)
    .map((i) => i.receivedAt - i.closedAt);
  const avgMs = durations.length
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : null;
  if (
    avgMs !== null &&
    completed.length >= 3 &&
    avgMs <= 1000 * 60 * 60 * 24 * 2
  )
    badges.push("🚚 ส่งไว");
  if (getTopSellerNames(3).includes(name)) badges.push("🏆 ขายดีประจำเดือน");
  return badges;
}
// preserves whatever the seller is mid-typing across a re-render of the shop-edit form —
// re-renders happen for reasons unrelated to what they're typing (picking a banner color,
// a Firestore snapshot ticking) and used to silently wipe the textareas/inputs
function captureFormValues(ids) {
  const vals = {};
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) vals[id] = el.value;
  });
  return vals;
}
function restoreFormValues(vals) {
  Object.keys(vals).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = vals[id];
  });
}
const SHOP_FORM_FIELD_SUFFIXES = [
  "DisplayNameInput",
  "BioInput",
  "AboutInput",
  "ContactInput",
];
function renderShopHeader() {
  const isOwn = viewingShopName === myName;
  const color = shopData.bannerColor || "#14171F";
  const wallpaper = shopData.wallpaper;
  const bannerStyle = wallpaper
    ? `background-image:url('${wallpaper}');`
    : `background:${color};`;
  const bio =
    shopData.bio ||
    (isOwn
      ? 'แตะ "แก้ไขหน้าร้าน" เพื่อเพิ่มคำโปรยร้านของคุณ'
      : "ร้านนี้ยังไม่ได้เพิ่มคำโปรย");
  const logo = shopData.logo;
  const shownName = shopData.displayName || viewingShopName;
  const avgStars = shopReviews.length
    ? shopReviews.reduce((s, r) => s + r.stars, 0) / shopReviews.length
    : 0;
  const badges = computeShopBadges(
    viewingShopName,
    avgStars,
    shopReviews.length,
  );
  document.getElementById("shopHeader").innerHTML = `
    <div class="shop-banner ${wallpaper ? "has-wallpaper" : ""}" style="${bannerStyle}">
      ${isOwn ? `<button class="shop-edit-btn" onclick="toggleShopEdit()">${shopEditOpen ? "ปิด" : "แก้ไขหน้าร้าน"}</button>` : ""}
      <div class="shop-avatar">${logo ? `<img src="${logo}">` : esc(shownName.slice(0, 1).toUpperCase())}</div>
      <p class="shop-name">${esc(shownName)}</p>
      <p class="shop-stars">${shopReviews.length ? `★ ${avgStars.toFixed(1)} (${shopReviews.length} รีวิว)` : "ยังไม่มีรีวิว"}</p>
      <p class="shop-bio">${esc(bio)}</p>
      ${badges.length ? `<div class="shop-badge-row">${badges.map((b) => `<span class="shop-pill">${b}</span>`).join("")}</div>` : ""}
    </div>
    ${shopData.about ? `<div class="info-row" style="align-items:flex-start;"><div><p style="margin:0 0 4px; font-weight:700; font-size:12.5px;">เกี่ยวกับร้าน</p><p style="margin:0; font-size:12.5px; color:var(--ink-soft); white-space:pre-wrap;">${esc(shopData.about)}</p></div></div>` : ""}
    ${shopData.contact ? `<div class="info-row" style="align-items:flex-start;"><div><p style="margin:0 0 4px; font-weight:700; font-size:12.5px;">ช่องทางการติดต่อ</p><p style="margin:0; font-size:12.5px; color:var(--ink-soft); white-space:pre-wrap;">${esc(shopData.contact)}</p></div></div>` : ""}`;
  const editPanel = document.getElementById("shopEditPanel");
  if (isOwn && shopEditOpen) {
    editPanel.classList.remove("hidden");
    const preserved = captureFormValues(
      SHOP_FORM_FIELD_SUFFIXES.map((s) => "shop" + s),
    );
    renderShopEditForm();
    restoreFormValues(preserved);
  } else editPanel.classList.add("hidden");
  renderShopReviewsList();
}
function renderShopReviewsList() {
  const el = document.getElementById("shopReviewsList");
  if (!el) return;
  if (!shopReviews.length) {
    el.innerHTML = `<p style="color:var(--ink-soft); font-size:12.5px; text-align:center; margin:10px 0 20px;">ยังไม่มีรีวิว — รีวิวเขียนได้เฉพาะคนที่ประมูลชนะและยืนยันรับสินค้าแล้วเท่านั้น</p>`;
    return;
  }
  const sorted = shopReviews.slice().sort((a, b) => b.at - a.at);
  el.innerHTML = sorted
    .map(
      (r) => `
    <div class="review-row">
      <p class="review-stars">${"★".repeat(r.stars)}${"☆".repeat(5 - r.stars)} <span class="review-item-name">${esc(r.itemName || "")}</span></p>
      <p class="review-text">${esc(r.text)}</p>
      <p class="review-meta">${esc(r.reviewerName)} · ${fmtChatTime(r.at)}</p>
    </div>`,
    )
    .join("");
}
function toggleShopEdit() {
  shopEditOpen = !shopEditOpen;
  shopLogoDataUrl = null;
  shopWallpaperDataUrl = null;
  shopWallpaperRemoved = false;
  renderShopHeader();
}
function renderShopEditForm() {
  const editPanel = document.getElementById("shopEditPanel");
  const currentColor = shopData.bannerColor || "#14171F";
  editPanel.innerHTML = `
    <div class="field"><label>ชื่อร้าน (แสดงแทนชื่อบัญชี ปล่อยว่างไว้ถ้าไม่ต้องการ)</label>
      <input type="text" id="shopDisplayNameInput" maxlength="30" placeholder="เช่น ร้านเจ๊หน่อยของเก่า" value="${esc(shopData.displayName || "")}"></div>
    <div class="field"><label>สีหน้าร้าน (ใช้เมื่อไม่มีวอลเปเปอร์)</label><div class="swatch-row" id="shopColorRow"></div></div>
    <div class="field"><label>โลโก้/รูปร้าน</label>
      <input type="file" accept="image/*" onchange="handleShopLogoSelect(event)"
        style="width:100%; border:1px solid var(--line); border-radius:10px; padding:10px 12px; font-size:12.5px; background:#fff;">
      <div id="shopLogoPreview">${shopLogoDataUrl ? `<img src="${shopLogoDataUrl}" style="width:70px; height:70px; border-radius:50%; object-fit:cover; margin-top:8px;">` : ""}</div>
    </div>
    <div class="field"><label>วอลเปเปอร์หน้าร้าน (ไม่บังคับ)</label>
      <p style="font-size:11px; color:var(--ink-soft); margin:0 0 8px;">รูปกว้างจะสวยสุด ระบบจะตัดภาพให้เต็มพื้นที่แบนเนอร์อัตโนมัติ</p>
      <input type="file" accept="image/*" onchange="handleShopWallpaperSelect(event)"
        style="width:100%; border:1px solid var(--line); border-radius:10px; padding:10px 12px; font-size:12.5px; background:#fff;">
      <div id="shopWallpaperPreview">${shopWallpaperDataUrl || (!shopWallpaperRemoved && shopData.wallpaper) ? `<img src="${shopWallpaperDataUrl || shopData.wallpaper}" style="width:100%; height:70px; object-fit:cover; border-radius:8px; margin-top:8px;">` : ""}</div>
      ${shopWallpaperDataUrl || (!shopWallpaperRemoved && shopData.wallpaper) ? `<button type="button" onclick="removeShopWallpaper()" style="margin:6px 0 0; width:auto; padding:6px 10px; font-size:11px; background:transparent; border:1px solid var(--line); border-radius:8px; color:var(--red); cursor:pointer;">ลบวอลเปเปอร์</button>` : ""}
    </div>
    <div class="field"><label>คำโปรยสั้นๆ (ขึ้นบนสุดของหน้าร้าน)</label>
      <textarea id="shopBioInput" maxlength="140" placeholder="บอกลูกค้าเกี่ยวกับร้านคุณสั้นๆ">${esc(shopData.bio || "")}</textarea>
    </div>
    <div class="field"><label>เกี่ยวกับร้าน (รายละเอียดเพิ่มเติม)</label>
      <textarea id="shopAboutInput" maxlength="500" placeholder="แนะนำร้าน ขายอะไรเป็นหลัก ขายมานานแค่ไหน ฯลฯ">${esc(shopData.about || "")}</textarea>
    </div>
    <div class="field"><label>ช่องทางการติดต่อ</label>
      <textarea id="shopContactInput" maxlength="200" placeholder="เช่น LINE: @shopname, โทร 08x-xxx-xxxx, IG: @shopname">${esc(shopData.contact || "")}</textarea>
    </div>
    <button class="btn btn-primary" onclick="saveShop()">บันทึกหน้าร้าน</button>`;
  document.getElementById("shopColorRow").innerHTML = SHOP_COLORS.map(
    (c) =>
      `<div class="swatch ${currentColor === c ? "selected" : ""}" style="background:${c};" onclick="pickBannerColor('${c}')"></div>`,
  ).join("");
}
function pickBannerColor(c) {
  shopData = Object.assign({}, shopData, { bannerColor: c });
  renderShopHeader();
}
function handleShopLogoSelect(ev) {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = "";
  if (!file) return;
  openCropModal(
    file,
    { frameSize: 220, outputSize: 300, quality: 0.75 },
    (dataUrl) => {
      shopLogoDataUrl = dataUrl;
      document.getElementById("shopLogoPreview").innerHTML =
        `<img src="${dataUrl}" style="width:70px; height:70px; border-radius:50%; object-fit:cover; margin-top:8px;">`;
    },
  );
}
// no interactive crop for wallpaper (the shared crop modal only supports a square frame) —
// just resize/compress and let CSS background-size:cover frame it, which looks fine for a banner
function handleShopWallpaperSelect(ev) {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = "";
  if (!file) return;
  compressImageFile(
    file,
    1000,
    0.7,
    (dataUrl) => {
      shopWallpaperDataUrl = dataUrl;
      shopWallpaperRemoved = false;
      renderShopEditForm();
    },
    (err) => alert(err),
  );
}
function removeShopWallpaper() {
  shopWallpaperDataUrl = null;
  shopWallpaperRemoved = true;
  renderShopEditForm();
}
async function saveShop() {
  if (!db || viewingShopName !== myName) return;
  const displayName = document
    .getElementById("shopDisplayNameInput")
    .value.trim()
    .slice(0, 30);
  const bio = document
    .getElementById("shopBioInput")
    .value.trim()
    .slice(0, 140);
  const about = document
    .getElementById("shopAboutInput")
    .value.trim()
    .slice(0, 500);
  const contact = document
    .getElementById("shopContactInput")
    .value.trim()
    .slice(0, 200);
  const data = {
    bannerColor: shopData.bannerColor || "#14171F",
    displayName,
    bio,
    about,
    contact,
    updatedAt: Date.now(),
  };
  if (shopWallpaperDataUrl) data.wallpaper = shopWallpaperDataUrl;
  else if (shopWallpaperRemoved)
    data.wallpaper = firebase.firestore.FieldValue.delete();
  if (shopLogoDataUrl) data.logo = shopLogoDataUrl;
  try {
    await db.doc("shops/" + myName).set(data, { merge: true });
    shopEditOpen = false;
    shopLogoDataUrl = null;
    shopWallpaperDataUrl = null;
    shopWallpaperRemoved = false;
  } catch (e) {
    console.error("saveShop failed", e);
    alert("บันทึกหน้าร้านไม่สำเร็จ: " + ((e && e.message) || e));
  }
}
function setShopTab(t) {
  shopTab = t;
  renderShopItems();
}
function renderShopItems() {
  if (!viewingShopName) return;
  document.getElementById("shopTabs").innerHTML = [
    { id: "active", label: "กำลังประมูล" },
    { id: "closed", label: "ปิดแล้ว" },
  ]
    .map(
      (t) =>
        `<div class="tab ${shopTab === t.id ? "active" : ""}" onclick="setShopTab('${t.id}')">${t.label}</div>`,
    )
    .join("");
  const items = allItems
    .filter(
      (i) =>
        i.sellerName === viewingShopName &&
        (shopTab === "closed" ? itemIsClosed(i) : !itemIsClosed(i)),
    )
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  document.getElementById("shopItemList").innerHTML = items.length
    ? items
        .map((i) => {
          const closed = itemIsClosed(i);
          const remain = itemRemain(i);
          const c = catInfo(i.cat);
          const firstPhoto = itemPhotos(i)[0];
          const thumbContent = firstPhoto
            ? `<img src="${firstPhoto}" alt="${esc(i.name)}">`
            : c.emoji;
          return `<div class="card" onclick="openItem('${i.id}')">
      <div class="thumb">${thumbContent}</div>
      <div class="card-body">
        <p class="card-title">${esc(i.name)}</p>
        <div class="card-row"><span class="price">${fmtPrice(i.price)}</span><span class="meta">${closed ? "จบแล้ว" : fmtTime(remain)}</span></div>
      </div>
    </div>`;
        })
        .join("")
    : `<p style="color:var(--ink-soft); font-size:13px; text-align:center; margin-top:20px;">ไม่มีสินค้าในหมวดนี้</p>`;
}

