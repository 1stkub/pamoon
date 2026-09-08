/* ---------- feed ---------- */
function renderTabs() {
  const tabs = [
    { id: "all", label: "ทั้งหมด" },
    { id: "hot", label: "🔥 ร้อนแรง" },
    { id: "ending", label: "ใกล้หมดเวลา" },
    { id: "closed", label: "ปิดแล้ว" },
  ];
  document.getElementById("feedTabs").innerHTML = tabs
    .map(
      (t) =>
        `<div class="tab ${activeTab === t.id ? "active" : ""}" onclick="setTab('${t.id}')">${t.label}</div>`,
    )
    .join("");
}
function setTab(t) {
  activeTab = t;
  renderFeed();
}
// บิดต่อนาทีนับตั้งแต่ลงประกาศ — ไม่ใช่แค่ราคาสูงสุด ตามคอนเซปที่วางไว้
function hotScore(it) {
  const ageMin = Math.max(
    1,
    (Date.now() - (it.createdAt || Date.now())) / 60000,
  );
  return (it.bidCount || 0) / ageMin;
}
function isHotItem(it) {
  return !itemIsClosed(it) && (it.bidCount || 0) >= 3 && hotScore(it) > 0.3;
}
function filterCat(id) {
  activeCat = id;
  activeSubcat = null;
  goTo("feed");
}
function pickFeedSubcat(s) {
  activeSubcat = activeSubcat === s ? null : s;
  renderFeed();
}
function setSortOrder(v) {
  sortOrder = v;
  renderFeed();
}
let feedView =
  localStorage.getItem("pramoon_feedView") === "grid" ? "grid" : "list";
function setFeedView(v) {
  feedView = v;
  try {
    localStorage.setItem("pramoon_feedView", v);
  } catch (e) {}
  renderFeed();
}

function itemRemain(it) {
  return (it.endsAt || 0) - Date.now();
}
function itemIsClosed(it) {
  return it.status === "closed" || itemRemain(it) <= 0;
}
const FEED_CLOSED_RETENTION_MS = 1000 * 60 * 60 * 24; // ปิดประมูลแล้วอยู่ในฟีดหลักต่ออีก 1 วัน ก่อนหายไป (หน้าร้านยังเห็นเสมอ)
function itemClosedAt(it) {
  return it.closedAt || it.endsAt || 0;
}
function itemVisibleInFeed(it) {
  if (!itemIsClosed(it)) return true;
  return Date.now() - itemClosedAt(it) < FEED_CLOSED_RETENTION_MS;
}

function renderFeed() {
  renderTabs();
  // ปิดประมูลแล้วอยู่ในฟีดหลักได้อีกแค่ 1 วัน หลังจากนั้นหายไปเลย (หน้าร้านของผู้ขายยังเห็นได้เสมอ)
  let list = allItems.filter(itemVisibleInFeed);
  const searchInput = document.getElementById("feedSearchInput");
  const q = searchInput ? searchInput.value.trim().toLowerCase() : "";
  if (q) list = list.filter((i) => (i.name || "").toLowerCase().includes(q));
  const catBar = document.getElementById("catFilterBar");
  if (activeCat) {
    const c = catInfo(activeCat);
    catBar.style.display = "flex";
    catBar.innerHTML = `<span>กำลังกรอง: <b>${esc(c.name)}</b></span><span style="cursor:pointer; font-weight:700;" onclick="homeTab()">ล้างตัวกรอง ✕</span>`;
    list = list.filter((i) => i.cat === activeCat);
    const subs = FREE_TEXT_SUBCAT_CATS.includes(activeCat)
      ? getDynamicSubcats(activeCat)
      : SUBCATS[activeCat];
    if (subs && subs.length) {
      const chips = subs
        .map(
          (s) =>
            `<span class="subcat-chip ${activeSubcat === s ? "active" : ""}" style="cursor:pointer; padding:4px 10px; margin-right:6px; border-radius:999px; border:1px solid ${activeSubcat === s ? "var(--brand,#e0562f)" : "#ddd"}; background:${activeSubcat === s ? "var(--brand,#e0562f)" : "#fff"}; color:${activeSubcat === s ? "#fff" : "#333"}; font-size:13px; white-space:nowrap;" onclick="pickFeedSubcat('${esc(s)}')">${esc(s)}</span>`,
        )
        .join("");
      catBar.innerHTML += `<div style="width:100%; overflow-x:auto; white-space:nowrap; margin-top:8px; padding-bottom:2px;">${chips}</div>`;
    }
    if (activeSubcat) list = list.filter((i) => i.subcat === activeSubcat);
  } else {
    catBar.style.display = "none";
    activeSubcat = null;
  }

  // สินค้าที่ปิดประมูลแล้วจะไม่โผล่ในฟีดหลัก ต้องกดแท็บ "ปิดแล้ว" ถึงจะเห็น
  if (activeTab === "closed") list = list.filter((i) => itemIsClosed(i));
  else list = list.filter((i) => !itemIsClosed(i));
  if (activeTab === "ending")
    list = list.filter((i) => itemRemain(i) < 1000 * 300);

  if (activeTab === "hot")
    list.sort((a, b) => hotScore(b) - hotScore(a)); // hot tab is always ranked by hot-score, independent of the sort dropdown below
  else if (sortOrder === "oldest")
    list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  else if (sortOrder === "priceLow")
    list.sort((a, b) => (a.price || 0) - (b.price || 0));
  else if (sortOrder === "priceHigh")
    list.sort((a, b) => (b.price || 0) - (a.price || 0));
  else list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); // 'newest' (default)
  if (activeTab === "hot") list = list.filter(isHotItem);

  document.getElementById("sortSelect").value = sortOrder;
  document
    .getElementById("feedList")
    .classList.toggle("grid-mode", feedView === "grid");
  document
    .getElementById("viewListBtn")
    .classList.toggle("active", feedView === "list");
  document
    .getElementById("viewGridBtn")
    .classList.toggle("active", feedView === "grid");

  if (!db) {
    document.getElementById("feedList").innerHTML =
      `<p style="color:var(--ink-soft); font-size:13px; text-align:center; margin-top:40px;">ยังไม่ได้เชื่อมต่อฐานข้อมูล — ดูข้อความด้านบนสำหรับวิธีแก้</p>`;
    return;
  }

  document.getElementById("feedList").innerHTML = list.length
    ? list
        .map((i) => {
          const closed = itemIsClosed(i);
          const remain = itemRemain(i);
          const c = catInfo(i.cat);
          let badge = "";
          if (closed) badge = `<div class="badge closed">ปิดประมูลแล้ว</div>`;
          else if (i.isLive)
            badge = `<div class="badge live-badge">🔴 LIVE</div>`;
          else if (i.sellerName === myName)
            badge = `<div class="badge mine">ของคุณ</div>`;
          else if (isHotItem(i))
            badge = `<div class="badge hot">🔥 ร้อนแรง</div>`;
          else if (remain < 1000 * 300)
            badge = `<div class="badge ending">เหลือ ${fmtTime(remain)}</div>`;
          const firstPhoto = itemPhotos(i)[0];
          const thumbContent = firstPhoto
            ? `<img src="${firstPhoto}" alt="${esc(i.name)}">`
            : c.emoji;
          return `<div class="card" onclick="openItem('${i.id}')">
      <div class="thumb">${thumbContent}${badge}</div>
      <div class="card-body">
        <p class="card-title">${esc(i.name)}</p>
        <p class="card-sub">${i.bidCount || 0} บิด · โดย <span onclick="event.stopPropagation(); openShop('${esc(i.sellerName)}')" style="text-decoration:underline;">${esc(i.sellerName)}</span></p>
        <div class="card-row">
          <span class="price">${fmtPrice(i.price)}</span>
          <span class="meta">${closed ? "จบแล้ว" : fmtTime(remain)}</span>
        </div>
      </div>
    </div>`;
        })
        .join("")
    : `<p style="color:var(--ink-soft); font-size:13px; text-align:center; margin-top:40px;">ยังไม่มีสินค้า — กด "ลงขาย" เพื่อเป็นคนแรก</p>`;
}

function renderCats() {
  document.getElementById("catGrid").innerHTML = CATS.map(
    (c) =>
      `<div class="cat-card" onclick="filterCat('${c.id}')">
      <div style="font-size:26px; margin-bottom:8px;">${c.emoji}</div>
      <p class="cat-name">${esc(c.name)}</p>
      <p class="cat-desc">${esc(c.desc)}</p>
    </div>`,
  ).join("");
}

/* ---------- category screen: recommended shops / items — built from data already loaded
   (top sellers by recent completed sales, active sellers, hot/newest items), no extra
   Firestore listener needed ---------- */
function getRecommendedShops(limit) {
  const topNames = getTopSellerNames(limit);
  const activeSellerNames = Array.from(
    new Set(allItems.filter((i) => !itemIsClosed(i)).map((i) => i.sellerName)),
  );
  const combined = [
    ...topNames,
    ...activeSellerNames.filter((n) => !topNames.includes(n)),
  ];
  return combined.slice(0, limit);
}
function renderRecoShops() {
  const el = document.getElementById("recoShopScroll");
  if (!el) return;
  const names = getRecommendedShops(8);
  if (!names.length) {
    el.innerHTML = `<p class="reco-empty">ยังไม่มีร้านค้าให้แนะนำตอนนี้</p>`;
    return;
  }
  el.innerHTML = names
    .map((n) => {
      const shop = allShops[n] || {};
      const shownName = shop.displayName || n;
      const color = shop.bannerColor || "#14171F";
      const activeCount = allItems.filter(
        (i) => i.sellerName === n && !itemIsClosed(i),
      ).length;
      return `<div class="reco-shop-card" onclick="openShop('${esc(n)}','cat')">
      <div class="reco-shop-avatar" style="background:${color};">${shop.logo ? `<img src="${shop.logo}">` : esc(shownName.slice(0, 1).toUpperCase())}</div>
      <p class="reco-shop-name">${esc(shownName)}</p>
      <p class="reco-shop-sub">${activeCount} รายการ</p>
    </div>`;
    })
    .join("");
}
function getRecommendedItems(limit) {
  const hot = allItems
    .filter(isHotItem)
    .sort((a, b) => hotScore(b) - hotScore(a));
  const hotIds = new Set(hot.map((i) => i.id));
  const rest = allItems
    .filter((i) => !itemIsClosed(i) && !hotIds.has(i.id))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return [...hot, ...rest].slice(0, limit);
}
function renderRecoItems() {
  const el = document.getElementById("recoItemScroll");
  if (!el) return;
  const items = getRecommendedItems(8);
  if (!items.length) {
    el.innerHTML = `<p class="reco-empty">ยังไม่มีสินค้าให้แนะนำตอนนี้</p>`;
    return;
  }
  el.innerHTML = items
    .map((i) => {
      const c = catInfo(i.cat);
      const firstPhoto = itemPhotos(i)[0];
      return `<div class="reco-item-card" onclick="openItem('${i.id}')">
      <div class="reco-item-thumb">${firstPhoto ? `<img src="${firstPhoto}" alt="${esc(i.name)}">` : c.emoji}</div>
      <div class="reco-item-body">
        <p class="reco-item-title">${esc(i.name)}</p>
        <p class="reco-item-price">${fmtPrice(i.price)}</p>
      </div>
    </div>`;
    })
    .join("");
}

