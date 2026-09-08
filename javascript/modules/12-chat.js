/* ---------- post-auction chat (buyer & seller only, per item) — full screen, persists forever in Firestore ---------- */
let chatUnsub = null;
let chatItemId = null;
let chatReturnScreen = "messages";
let chatOtherName = null; // the other party's real (login) name — used to open their shop
function openChatFull(itemId, returnScreen) {
  chatReturnScreen = returnScreen || "messages";
  const it = findItem(itemId);
  if (it) {
    const isSeller = it.sellerName === myName;
    const other = isSeller ? it.highestBidderName : it.sellerName;
    chatOtherName = other;
    const shop = allShops[other] || {};
    const shownName = shop.displayName || other;
    document.getElementById("chatFullAvatar").innerHTML = shop.logo
      ? `<img src="${shop.logo}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`
      : esc((other || "?").slice(0, 1).toUpperCase());
    document.getElementById("chatFullTitle").textContent =
      shownName || "คู่สนทนา";
    document.getElementById("chatFullSub").textContent =
      it.name + " · " + fmtPrice(it.price);
  }
  renderChatOrderStatus(it);
  goTo("chatfull");
  if (chatItemId === itemId) return; // already subscribed to this item's chat
  if (chatUnsub) {
    chatUnsub();
    chatUnsub = null;
  }
  chatItemId = itemId;
  chatUnsub = db
    .collection("items/" + itemId + "/messages")
    .orderBy("at")
    .onSnapshot((snap) => {
      const msgs = snap.docs.map((d) => d.data());
      const box = document.getElementById("chatFullMessages");
      box.innerHTML = msgs.length
        ? msgs
            .map((m) => {
              const mine = m.name === myName;
              let content,
                extraClass = "";
              if (m.image) {
                content = `<img src="${m.image}" class="chat-bubble-img" onclick="openLightbox(['${m.image}'],0)" alt="รูปในแชท">`;
                extraClass = "has-img";
              } else if (m.fileData) {
                const fileIcon = /pdf/.test(m.fileType)
                  ? "📄"
                  : /word|doc/.test(m.fileType)
                    ? "📝"
                    : "📎";
                content = `<a href="${m.fileData}" download="${esc(m.fileName || "file")}" class="chat-file-chip">${fileIcon} <span>${esc(m.fileName || "ไฟล์แนบ")}</span> <b>ดาวน์โหลด</b></a>`;
                extraClass = "has-file";
              } else {
                content = `<span>${esc(m.text)}</span>`;
              }
              return `<div class="chat-bubble-row ${mine ? "me" : ""}"><div class="chat-bubble ${mine ? "me" : ""} ${extraClass}"><b>${esc(m.name)}</b>${content}<time>${fmtChatTime(m.at)}</time></div></div>`;
            })
            .join("")
        : `<p style="color:var(--ink-soft); font-size:12px; text-align:center; margin:10px 0;">ยังไม่มีข้อความ — ทักไปนัดชำระเงิน/จัดส่งได้เลย (แนบสลิปโอนเงินเป็นหลักฐานได้ด้วยปุ่ม 📎) ข้อความจะถูกเก็บไว้ตลอด</p>`;
      box.scrollTop = box.scrollHeight;
      markConversationRead(itemId); // viewing the thread counts as read, including messages that arrive while it's open
    });
}
function closeChat() {
  if (chatUnsub) {
    chatUnsub();
    chatUnsub = null;
  }
  chatItemId = null;
}
let chatShopReturnItemId = null,
  chatShopReturnBackScreen = "messages";
function openShopFromChat() {
  if (!chatOtherName || !chatItemId) return;
  // leaving chatfull tears down its message subscription (see goTo()) — remember exactly which
  // item's chat to resume, and where ITS OWN back button should go, so tapping back from the
  // shop page properly re-subscribes instead of just showing a frozen, no-longer-live chat screen
  chatShopReturnItemId = chatItemId;
  chatShopReturnBackScreen = chatReturnScreen;
  openShop(chatOtherName, "chatfull");
}
function shopBack() {
  if (shopReturnScreen === "chatfull" && chatShopReturnItemId) {
    const id = chatShopReturnItemId,
      back = chatShopReturnBackScreen;
    chatShopReturnItemId = null;
    openChatFull(id, back);
  } else {
    goTo(shopReturnScreen);
  }
}
let sendingChatMessage = false; // guards against a message getting sent twice (double-tap, Enter + click racing)
async function sendChatMessage() {
  const input = document.getElementById("chatFullInput");
  const text = input.value.trim();
  if (!text || !chatItemId || !db || sendingChatMessage) return;
  sendingChatMessage = true;
  input.value = "";
  const itemId = chatItemId;
  try {
    await db
      .collection("items/" + itemId + "/messages")
      .add({ name: myName, text, at: Date.now() });
    // denormalized onto the item doc so the messages list / nav badge can show an unread
    // indicator without subscribing to every conversation's messages subcollection
    await db
      .doc("items/" + itemId)
      .update({ lastMessageAt: Date.now(), lastMessageBy: myName })
      .catch(() => {});
  } catch (e) {
    /* silent — chat is best-effort */
  }
  sendingChatMessage = false;
}
// ส่งรูปในแชท — ถ่ายรูปสดหรือเลือกจากคลังก็ได้ (เบราว์เซอร์มือถือจะขึ้นตัวเลือกให้เองจาก accept="image/*"
// ไม่ต้องบังคับ capture เพราะจะตัดตัวเลือก "เลือกจากคลัง" ทิ้งไปในบางเบราว์เซอร์)
let sendingChatImage = false;
function handleChatImageSelect(ev) {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = "";
  if (!file || sendingChatImage) return;
  compressImageFile(
    file,
    900,
    0.6,
    (dataUrl) => {
      sendChatImage(dataUrl);
    },
    (err) => alert(err),
  );
}
async function sendChatImage(dataUrl) {
  if (!chatItemId || !db || sendingChatImage) return;
  sendingChatImage = true;
  const itemId = chatItemId;
  try {
    await db
      .collection("items/" + itemId + "/messages")
      .add({ name: myName, image: dataUrl, at: Date.now() });
    await db
      .doc("items/" + itemId)
      .update({ lastMessageAt: Date.now(), lastMessageBy: myName })
      .catch(() => {});
  } catch (e) {
    alert("ส่งรูปไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
  sendingChatImage = false;
}

// แนบไฟล์/หลักฐานการโอนเงินในแชท (ไม่บังคับ) — รูปยังใช้ท่อการบีบอัดเดิม (compressImageFile ที่มี
// การกันไฟล์ HEIC พังอยู่แล้ว) ส่วนไฟล์อื่น (สลิปโอนเงินแบบ PDF ฯลฯ) อ่านตรงๆ ไม่บีบอัด จึงต้องจำกัด
// ขนาดไฟล์ดิบไว้ให้เหลือที่พอสำหรับ base64 (ใหญ่กว่าไฟล์จริง ~33%) ไม่ให้ชนเพดาน 1MiB ต่อเอกสารของ Firestore
const MAX_CHAT_FILE_BYTES = 600 * 1024;
let sendingChatFile = false;
function handleChatFileSelect(ev) {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = "";
  if (!file || sendingChatFile || sendingChatImage) return;
  if (file.type && file.type.startsWith("image/")) {
    // ยังเป็นรูป — ใช้ท่อเดิมเป๊ะๆ ไม่ต้องแยกโค้ดซ้ำ
    handleChatImageSelect({ target: { files: [file], value: "" } });
    return;
  }
  if (file.size > MAX_CHAT_FILE_BYTES) {
    alert(
      `ไฟล์ใหญ่เกินไป (${Math.round(file.size / 1024)} KB) — แนบได้ไม่เกิน ${Math.round(MAX_CHAT_FILE_BYTES / 1024)} KB ลองบีบอัดไฟล์หรือถ่ายภาพหน้าจอแทน`,
    );
    return;
  }
  sendingChatFile = true;
  const reader = new FileReader();
  reader.onerror = () => {
    alert("อ่านไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง");
    sendingChatFile = false;
  };
  reader.onload = (e) => {
    sendChatFile(
      e.target.result,
      file.name,
      file.type || "application/octet-stream",
    );
  };
  reader.readAsDataURL(file);
}
async function sendChatFile(dataUrl, fileName, fileType) {
  if (!chatItemId || !db) {
    sendingChatFile = false;
    return;
  }
  const itemId = chatItemId;
  try {
    await db.collection("items/" + itemId + "/messages").add({
      name: myName,
      at: Date.now(),
      fileData: dataUrl,
      fileName: fileName.slice(0, 80),
      fileType,
    });
    await db
      .doc("items/" + itemId)
      .update({ lastMessageAt: Date.now(), lastMessageBy: myName })
      .catch(() => {});
  } catch (e) {
    alert("แนบไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง (" + ((e && e.message) || e) + ")");
  }
  sendingChatFile = false;
}

/* ---------- unread-chat indicator ---------- */
function hasUnreadChat(it) {
  if (!it.lastMessageAt || it.lastMessageBy === myName) return false;
  const lastRead = Number(
    localStorage.getItem("pramoon_lastRead_" + it.id) || 0,
  );
  return it.lastMessageAt > lastRead;
}
function markConversationRead(itemId) {
  try {
    localStorage.setItem("pramoon_lastRead_" + itemId, String(Date.now()));
  } catch (e) {}
  updateNotifBadge();
}
// a completed order's chat has exactly two parties (the seller and the winning bidder) — anyone
// else must never be treated as "in" this conversation for notification/history purposes
function isChatParty(i) {
  const isSeller = i.sellerName === myName,
    isLeader = i.highestBidderName === myName;
  return (
    itemIsClosed(i) &&
    i.bidCount > 0 &&
    (isSeller || isLeader) &&
    !(isSeller && isLeader)
  );
}
function unreadChatConvos() {
  return allItems.filter((i) => isChatParty(i) && hasUnreadChat(i));
}

/* ---------- ship / receive / review gate (unlocks the shop review, per the original spec) ---------- */
function renderChatOrderStatus(it) {
  const bar = document.getElementById("chatOrderStatus");
  if (!it) {
    bar.classList.add("hidden");
    return;
  }
  const isSeller = it.sellerName === myName;
  const isLeader = it.highestBidderName === myName;
  if (!isSeller && !isLeader) {
    bar.classList.add("hidden");
    return;
  }
  bar.classList.remove("hidden");
  bar.style.flexDirection = "column";
  bar.style.alignItems = "stretch";
  // การนัดส่ง/รับของเป็นเรื่องที่ผู้ซื้อ-ผู้ขายตกลงกันเองในแชทนี้ ไม่มีขั้นตอนแยกให้ผู้ขายกดยืนยันการส่ง
  let row;
  if (!it.receivedAt) {
    row = isLeader
      ? `<span>นัดรับ/จัดส่งกันเองในแชทนี้ได้เลย (แนบสลิปโอนเงินได้ที่ปุ่ม 📎)</span><button onclick="markReceivedAndReview('${it.id}')">ได้รับสินค้าแล้ว</button>`
      : `<span>รอผู้ซื้อกดยืนยันเมื่อได้รับสินค้า</span>`;
  } else if (isLeader && !it.reviewedBy) {
    row = `<span>ได้รับของแล้ว ✓</span><button onclick="openReviewFromChat('${it.id}')">เขียนรีวิวร้านนี้</button>`;
  } else {
    row = `<span>ทำรายการสำเร็จแล้ว ✓</span>`;
  }
  const otherName = isSeller ? it.highestBidderName : it.sellerName;
  const reasonSet = isSeller ? "user_bidder" : "user_seller";
  bar.innerHTML = `<div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">${row}</div>
    <p style="font-size:11px; color:var(--ink-soft); text-decoration:underline; cursor:pointer; margin:8px 0 0;" onclick="openReportModal('user','${esc(otherName)}','${it.id}','${esc(it.name)}','${reasonSet}')">🚩 รายงาน ${esc(otherName)}</p>`;
}
async function markReceivedAndReview(id) {
  if (!db) return;
  const it = findItem(id);
  // กันกดพลาด: ยืนยันได้รับสินค้าแล้วถือว่าจบรายการ กดแล้วปุ่มนี้จะหายไปเลย ไม่ควรกดพลาด
  if (
    !confirm(
      `ยืนยันว่าได้รับ "${it ? it.name : "สินค้า"}" แล้วใช่ไหม?\n\nกดยืนยันแล้วจะถือว่าปิดรายการนี้ ไม่สามารถย้อนกลับได้`,
    )
  )
    return;
  await db
    .doc("items/" + id)
    .update({ receivedAt: Date.now() })
    .catch(() => {});
  openReviewFromChat(id);
}

let shopReviewItemId = null;
let shopReviewStars = 5;
function openReviewFromChat(itemId) {
  shopReviewItemId = itemId;
  shopReviewStars = 5;
  const it = findItem(itemId);
  document.getElementById("shopReviewLabel").textContent = it
    ? `${it.name} · ${it.sellerName}`
    : "";
  document.getElementById("shopReviewText").value = "";
  renderShopReviewStars();
  goTo("shopreview");
}
function renderShopReviewStars() {
  document.getElementById("shopReviewStars").innerHTML = [1, 2, 3, 4, 5]
    .map(
      (n) =>
        `<span class="star ${n <= shopReviewStars ? "on" : ""}" onclick="pickShopReviewStars(${n})">★</span>`,
    )
    .join("");
}
function pickShopReviewStars(n) {
  shopReviewStars = n;
  renderShopReviewStars();
}
async function submitShopReview() {
  if (!db || !shopReviewItemId) return;
  const it = findItem(shopReviewItemId);
  if (!it) return;
  const text =
    document.getElementById("shopReviewText").value.trim().slice(0, 300) ||
    "สินค้าตรงตามที่ลงประกาศ";
  try {
    await db
      .doc("shops/" + it.sellerName + "/reviews/" + shopReviewItemId)
      .set({
        reviewerName: myName,
        stars: shopReviewStars,
        text,
        at: Date.now(),
        itemName: it.name,
      });
    await db.doc("items/" + shopReviewItemId).update({ reviewedBy: myName });
    alert("ส่งรีวิวสำเร็จ ขอบคุณสำหรับความคิดเห็น");
    goTo("messages");
  } catch (e) {
    alert("ส่งรีวิวไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
}

