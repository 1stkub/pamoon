let detailBidWatch = null; // {itemId, bidCount, highestBidderName} — last state seen while viewing this item's detail

// a notification you've already seen stays visible as "history" in the list for this long
// afterward (grayed out, no red dot, doesn't count toward the badge) before dropping off for
// good — per user request ("อยากให้ขึ้นประวัติไว้ มีเวลาเก็บ 1 วัน ถ้าเลยก็ลบไป")
const NOTIF_HISTORY_MS = 1000 * 60 * 60 * 24;
function notifSeenAt(key) {
  return Number(localStorage.getItem("pramoon_notifSeenAt_" + key) || 0);
}
function markNotifSeenAt(key) {
  try {
    localStorage.setItem("pramoon_notifSeenAt_" + key, String(Date.now()));
  } catch (e) {}
}
function isNotifRecentlySeen(key) {
  const t = notifSeenAt(key);
  return t > 0 && Date.now() - t < NOTIF_HISTORY_MS;
}

/* ---------- bidder-mode: "you've been outbid" badge for when you're not looking at the item ---------- */
function isOutbidCandidate(it) {
  if (
    itemIsClosed(it) ||
    it.sellerName === myName ||
    it.highestBidderName === myName
  )
    return false;
  return (it.log || []).some((l) => l.name === myName);
}
function hasUnseenOutbid(it) {
  if (!isOutbidCandidate(it)) return false;
  const seenPrice = Number(
    localStorage.getItem("pramoon_seenOutbid_" + it.id) || 0,
  );
  return it.price !== seenPrice;
}
function hasRecentlySeenOutbid(it) {
  if (!isOutbidCandidate(it)) return false;
  const seenPrice = Number(
    localStorage.getItem("pramoon_seenOutbid_" + it.id) || 0,
  );
  // a newer, still-unseen outbid at a different price belongs in the unseen bucket, not history
  if (it.price !== seenPrice) return false;
  return isNotifRecentlySeen("outbid-" + it.id);
}
function markOutbidSeen(it) {
  try {
    localStorage.setItem("pramoon_seenOutbid_" + it.id, String(it.price));
  } catch (e) {}
  markNotifSeenAt("outbid-" + it.id);
  updateNotifBadge();
}
function unseenOutbidItems() {
  return allItems.filter(hasUnseenOutbid);
}

/* ---------- seller-side: "someone bid on your listing" / "you won" / "you sold it" ---------- */
function isSellerBidCandidate(it) {
  return it.sellerName === myName && !itemIsClosed(it) && it.bidCount > 0;
}
function hasUnseenSellerBid(it) {
  if (!isSellerBidCandidate(it)) return false;
  const seen = Number(
    localStorage.getItem("pramoon_seenSellerBid_" + it.id) || 0,
  );
  return (it.bidCount || 0) > seen;
}
function hasRecentlySeenSellerBid(it) {
  if (!isSellerBidCandidate(it)) return false;
  const seen = Number(
    localStorage.getItem("pramoon_seenSellerBid_" + it.id) || 0,
  );
  if ((it.bidCount || 0) > seen) return false;
  return isNotifRecentlySeen("sellerbid-" + it.id);
}
function markSellerBidSeen(it) {
  try {
    localStorage.setItem(
      "pramoon_seenSellerBid_" + it.id,
      String(it.bidCount || 0),
    );
  } catch (e) {}
  markNotifSeenAt("sellerbid-" + it.id);
  updateNotifBadge();
}
function isWonCandidate(it) {
  return it.highestBidderName === myName && itemIsClosed(it) && it.bidCount > 0;
}
function hasUnseenWon(it) {
  if (!isWonCandidate(it)) return false;
  return !localStorage.getItem("pramoon_seenWon_" + it.id);
}
function hasRecentlySeenWon(it) {
  if (!isWonCandidate(it) || !localStorage.getItem("pramoon_seenWon_" + it.id))
    return false;
  return isNotifRecentlySeen("won-" + it.id);
}
function markWonSeen(it) {
  try {
    localStorage.setItem("pramoon_seenWon_" + it.id, "1");
  } catch (e) {}
  markNotifSeenAt("won-" + it.id);
  updateNotifBadge();
}
function isSoldCandidate(it) {
  return it.sellerName === myName && itemIsClosed(it) && it.bidCount > 0;
}
function hasUnseenSold(it) {
  if (!isSoldCandidate(it)) return false;
  return !localStorage.getItem("pramoon_seenSold_" + it.id);
}
function hasRecentlySeenSold(it) {
  if (
    !isSoldCandidate(it) ||
    !localStorage.getItem("pramoon_seenSold_" + it.id)
  )
    return false;
  return isNotifRecentlySeen("sold-" + it.id);
}
function markSoldSeen(it) {
  try {
    localStorage.setItem("pramoon_seenSold_" + it.id, "1");
  } catch (e) {}
  markNotifSeenAt("sold-" + it.id);
  updateNotifBadge();
}

/* ---------- unified notification center — one bell, one list, everything that needs your attention ---------- */
let currentNotifList = [];
function buildNotifications() {
  const list = [];
  // unreadChatConvos() already restricts to items where myName is actually a party to the
  // conversation (seller xor leading bidder) — hasUnreadChat() alone doesn't, so calling it
  // directly on every item here would leak other people's chat notifications to everyone
  unreadChatConvos().forEach((it) => {
    const isSeller = it.sellerName === myName;
    const other = isSeller ? it.highestBidderName : it.sellerName;
    list.push({
      key: "chat-" + it.id,
      itemId: it.id,
      type: "chat",
      icon: "💬",
      title: `ข้อความใหม่จาก ${other}`,
      sub: it.name,
      at: it.lastMessageAt || 0,
    });
  });
  allItems.forEach((it) => {
    if (hasUnseenOutbid(it)) {
      list.push({
        key: "outbid-" + it.id,
        itemId: it.id,
        type: "outbid",
        icon: "🔻",
        title: "มีคนบิดสูงกว่าคุณแล้ว",
        sub: `${it.name} · ราคาล่าสุด ${fmtPrice(it.price)}`,
        at: it.price,
      });
    }
    if (hasUnseenSellerBid(it)) {
      list.push({
        key: "sellerbid-" + it.id,
        itemId: it.id,
        type: "sellerBid",
        icon: "🔨",
        title: "มีคนบิดสินค้าของคุณ",
        sub: `${it.name} · ราคาล่าสุด ${fmtPrice(it.price)} · ${it.bidCount} ครั้ง`,
        at: Date.now(),
      });
    }
    if (hasUnseenWon(it)) {
      list.push({
        key: "won-" + it.id,
        itemId: it.id,
        type: "won",
        icon: "🎉",
        title: "คุณชนะการประมูล!",
        sub: `${it.name} · ${fmtPrice(it.price)}`,
        at: it.closedAt || it.endsAt || 0,
      });
    }
    if (hasUnseenSold(it)) {
      list.push({
        key: "sold-" + it.id,
        itemId: it.id,
        type: "sold",
        icon: "💰",
        title: "ขายสินค้าได้แล้ว!",
        sub: `${it.name} · ${fmtPrice(it.price)}`,
        at: it.closedAt || it.endsAt || 0,
      });
    }
  });
  return list.sort((a, b) => b.at - a.at);
}
// notifications already seen, still shown as muted "history" rows for NOTIF_HISTORY_MS after
// being seen — never counted in the badge, purely for "what happened recently" recall
function buildNotifHistory() {
  const list = [];
  allItems.forEach((it) => {
    if (isChatParty(it) && !hasUnreadChat(it) && it.lastMessageAt) {
      const lastRead = Number(
        localStorage.getItem("pramoon_lastRead_" + it.id) || 0,
      );
      if (lastRead && Date.now() - lastRead < NOTIF_HISTORY_MS) {
        const isSeller = it.sellerName === myName;
        const other = isSeller ? it.highestBidderName : it.sellerName;
        list.push({
          key: "chat-" + it.id,
          itemId: it.id,
          type: "chat",
          icon: "💬",
          title: `ข้อความจาก ${other}`,
          sub: it.name,
          at: lastRead,
          seen: true,
        });
      }
    }
    if (hasRecentlySeenOutbid(it)) {
      list.push({
        key: "outbid-" + it.id,
        itemId: it.id,
        type: "outbid",
        icon: "🔻",
        title: "มีคนบิดสูงกว่าคุณแล้ว",
        sub: `${it.name} · ราคาล่าสุด ${fmtPrice(it.price)}`,
        at: notifSeenAt("outbid-" + it.id),
        seen: true,
      });
    }
    if (hasRecentlySeenSellerBid(it)) {
      list.push({
        key: "sellerbid-" + it.id,
        itemId: it.id,
        type: "sellerBid",
        icon: "🔨",
        title: "มีคนบิดสินค้าของคุณ",
        sub: `${it.name} · ราคาล่าสุด ${fmtPrice(it.price)} · ${it.bidCount} ครั้ง`,
        at: notifSeenAt("sellerbid-" + it.id),
        seen: true,
      });
    }
    if (hasRecentlySeenWon(it)) {
      list.push({
        key: "won-" + it.id,
        itemId: it.id,
        type: "won",
        icon: "🎉",
        title: "คุณชนะการประมูล!",
        sub: `${it.name} · ${fmtPrice(it.price)}`,
        at: notifSeenAt("won-" + it.id),
        seen: true,
      });
    }
    if (hasRecentlySeenSold(it)) {
      list.push({
        key: "sold-" + it.id,
        itemId: it.id,
        type: "sold",
        icon: "💰",
        title: "ขายสินค้าได้แล้ว!",
        sub: `${it.name} · ${fmtPrice(it.price)}`,
        at: notifSeenAt("sold-" + it.id),
        seen: true,
      });
    }
  });
  return list.sort((a, b) => b.at - a.at);
}
let lastNotifCount = null; // null = haven't checked yet this session; only ring the bell on a genuine INCREASE after that, not on every re-render and not on first load
function updateNotifBadge() {
  const badge = document.getElementById("notifBellBadge");
  if (!badge) return;
  const count = buildNotifications().length;
  if (count > 0) {
    badge.textContent = count > 9 ? "9+" : String(count);
    badge.classList.remove("hidden");
  } else badge.classList.add("hidden");
  if (lastNotifCount !== null && count > lastNotifCount) {
    const bell = document.getElementById("notifBellBtn");
    // restart the animation even if it's still mid-play from a moment ago
    bell.classList.remove("bell-ring");
    void bell.offsetWidth;
    bell.classList.add("bell-ring");
    badge.classList.remove("badge-pop");
    void badge.offsetWidth;
    badge.classList.add("badge-pop");
  }
  lastNotifCount = count;
}
function markNotifSeen(n) {
  const it = findItem(n.itemId);
  if (!it) return;
  if (n.type === "chat") markConversationRead(n.itemId);
  else if (n.type === "outbid") markOutbidSeen(it);
  else if (n.type === "sellerBid") markSellerBidSeen(it);
  else if (n.type === "won") markWonSeen(it);
  else if (n.type === "sold") markSoldSeen(it);
}
function renderNotifications() {
  const el = document.getElementById("notifList");
  const unseenList = buildNotifications();
  const historyList = buildNotifHistory();
  currentNotifList = unseenList.concat(historyList);
  const rowHtml = (n) => `
    <div class="notif-row ${n.seen ? "notif-seen" : ""}" onclick="handleNotifTap('${n.key}')">
      <div class="notif-icon">${n.icon}</div>
      <div class="notif-body">
        <p class="notif-title">${esc(n.title)}</p>
        <p class="notif-sub">${esc(n.sub)}</p>
      </div>
      ${n.seen ? `<span class="notif-history-tag">ดูแล้ว</span>` : `<span class="notif-dot"></span>`}
    </div>`;
  el.innerHTML = currentNotifList.length
    ? unseenList.map(rowHtml).join("") + historyList.map(rowHtml).join("")
    : `<p style="color:var(--ink-soft); font-size:13px; text-align:center; margin-top:40px;">ไม่มีการแจ้งเตือนใหม่ ✓</p>`;
  // เปิดหน้านี้ถือว่าเห็นทุกรายการที่ยังไม่เคยดูมาก่อนแล้ว — เคลียร์เลขแดงที่กระดิ่งทันที ไม่ต้องรอ
  // กดเข้าไปทีละอัน (รายการยังคงค้างให้ดูในหน้านี้เหมือนเดิม จนกว่าจะออกแล้วกลับเข้ามาใหม่ — จากนั้นจะ
  // ค้างเป็น "ประวัติ" สีจางๆ ต่ออีก 1 วันก่อนหายไปเอง ตามที่ขอ)
  unseenList.forEach(markNotifSeen);
}
function handleNotifTap(key) {
  const n = currentNotifList.find((x) => x.key === key);
  if (!n) return;
  markNotifSeen(n);
  if (n.type === "chat") openChatFull(n.itemId, "notifications");
  else openItem(n.itemId);
}
