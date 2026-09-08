function findItem(id) {
  return allItems.find((i) => i.id === id);
}

// the bid bar (or, when it's hidden, the bottom nav bar) is the fixed-to-bottom footer on this
// screen — it grows taller as more of its own content shows (outbid/leading status strip, the
// buy-now button, the bid box, quick-bid pills, a success/error message can all be visible at
// once) but the scrollable content above it had a hand-picked static padding-bottom that kept
// falling out of date every time something new was added to the bar, letting the bar visually
// cover the tail end of the scrollable content (most visibly the bid log) — reported as "เวลาบิด
// ราคา จะขึ้นทับ กับหน้าประกาศรายชื่อการบิด". Measuring the footer's REAL rendered height here
// instead means this can never drift out of sync again, no matter what gets added to either bar later.
function syncDetailFooterPadding() {
  const screen = document.getElementById("screen-detail");
  const bidbar = document.getElementById("bidbar");
  const navbar = document.getElementById("navbar");
  const activeFooter = bidbar.classList.contains("hidden") ? navbar : bidbar;
  const h = activeFooter ? activeFooter.offsetHeight : 0;
  screen.style.paddingBottom = h + 30 + "px";
}
function renderDetail() {
  const it = findItem(currentItemId);
  if (!it) {
    document.getElementById("detailTitle").textContent =
      "ไม่พบสินค้านี้ (อาจถูกลบ)";
    document.getElementById("bidbar").classList.add("hidden");
    document.getElementById("navbar").classList.remove("hidden");
    return;
  }
  const c = catInfo(it.cat);
  const remain = itemRemain(it);
  const closed = itemIsClosed(it);
  const isSeller = it.sellerName === myName;
  const isLeader = it.highestBidderName === myName;

  // viewing the item directly counts as acknowledging any pending notification about it,
  // same as tapping through from the notification list would
  if (isSeller && (it.bidCount || 0) > 0) {
    closed ? markSoldSeen(it) : markSellerBidSeen(it);
  }
  if (isLeader && closed && (it.bidCount || 0) > 0) markWonSeen(it);

  // bidder-mode: notice a new bid landing while this exact item is open (real-time push or
  // the 1s tick) and surface it as a toast + a brief price flash — someone bidding is the
  // whole point of an auction, it shouldn't be silent
  if (!isSeller && !closed) {
    const prevWatch = detailBidWatch;
    if (
      prevWatch &&
      prevWatch.itemId === it.id &&
      (it.bidCount || 0) > prevWatch.bidCount
    ) {
      const priceEl = document.getElementById("detailPrice");
      priceEl.classList.remove("price-flash");
      void priceEl.offsetWidth; // restart the animation even if it's still mid-flash
      priceEl.classList.add("price-flash");
      if (
        prevWatch.highestBidderName === myName &&
        it.highestBidderName !== myName
      ) {
        showToast(
          `มีคนบิดสูงกว่าคุณแล้ว! ราคาล่าสุด ${fmtPrice(it.price)}`,
          "warn",
        );
      } else if (it.highestBidderName !== myName) {
        showToast(`มีการบิดใหม่ — ราคาล่าสุด ${fmtPrice(it.price)}`);
      }
    }
    detailBidWatch = {
      itemId: it.id,
      bidCount: it.bidCount || 0,
      highestBidderName: it.highestBidderName,
    };
  }

  const photos = itemPhotos(it);
  if (detailPhotoIdx >= photos.length) detailPhotoIdx = 0;
  document.getElementById("detailMedia").innerHTML = photos.length
    ? `<img src="${photos[detailPhotoIdx]}" alt="${esc(it.name)}" onclick="openLightbox(itemPhotos(findItem(currentItemId)), detailPhotoIdx)">`
    : c.emoji;
  const gallery = document.getElementById("galleryStrip");
  if (photos.length > 1) {
    gallery.classList.remove("hidden");
    gallery.innerHTML = photos
      .map(
        (p, idx) =>
          `<img src="${p}" class="${idx === detailPhotoIdx ? "active" : ""}" onclick="setDetailPhoto(${idx})" alt="รูปที่ ${idx + 1}">`,
      )
      .join("");
  } else {
    gallery.classList.add("hidden");
  }
  document.getElementById("detailTitle").textContent = it.name;
  document.getElementById("detailCat").textContent = it.subcat
    ? `${c.name} · ${it.subcat}`
    : c.name;
  document
    .getElementById("detailDescriptionBox")
    .classList.toggle("hidden", !it.description);
  if (it.description)
    document.getElementById("detailDescriptionText").textContent =
      it.description;
  document.getElementById("detailPrice").textContent = fmtPrice(it.price);
  document.getElementById("detailSellerName").textContent =
    it.sellerName + (isSeller ? " (คุณ)" : "");
  document.getElementById("detailSellerRow").onclick = () =>
    openShop(it.sellerName);

  const reportLink = document.getElementById("reportListingLink");
  reportLink.classList.toggle("hidden", isSeller);
  reportLink.onclick = () =>
    openReportModal("listing", null, it.id, it.name, "listing");

  const adminDeleteLink = document.getElementById("adminDeleteLink");
  adminDeleteLink.classList.toggle("hidden", !myIsAdmin);
  adminDeleteLink.onclick = () => adminDeleteListing(it.id);

  // seller-only: edit/delete window — 30 min after posting, and only before any bids land
  // (once someone's bid, pulling/changing the listing would cheat them out of it)
  const ownerBox = document.getElementById("ownerActionsBox");
  const ownerHint = document.getElementById("ownerActionsHint");
  if (isSeller && !closed) {
    const withinEditWindow = Date.now() - (it.createdAt || 0) <= EDIT_WINDOW_MS;
    if (withinEditWindow && !it.bidCount) {
      ownerBox.classList.remove("hidden");
      ownerHint.classList.add("hidden");
    } else {
      ownerBox.classList.add("hidden");
      ownerHint.classList.remove("hidden");
      ownerHint.textContent = it.bidCount
        ? "แก้ไข/ลบไม่ได้แล้ว เพราะมีผู้บิดแล้ว"
        : "แก้ไข/ลบได้เฉพาะ 30 นาทีแรกหลังลงประกาศเท่านั้น";
    }
  } else {
    ownerBox.classList.add("hidden");
    ownerHint.classList.add("hidden");
  }

  const timerEl = document.getElementById("detailTimer");
  if (remain > 0 && it.status !== "closed") {
    timerEl.textContent = fmtTime(remain);
    timerEl.classList.toggle("urgent", remain < 1000 * 30);
  } else {
    timerEl.textContent = "ปิดประมูลแล้ว";
    timerEl.classList.add("urgent");
  }
  document.getElementById("detailBidCount").textContent =
    (it.bidCount || 0) + " ครั้ง";

  // shown to everyone (seller included) whenever a buy-now price is set — the bid box below
  // additionally gives bidders a tappable ⚡ button, but the seller had no way to see their own
  // buy-now price was actually saved before this
  const buyNowInfo = document.getElementById("buyNowInfo");
  if (it.buyNowPrice && !closed) {
    buyNowInfo.classList.remove("hidden");
    buyNowInfo.textContent = `⚡ ซื้อทันทีได้ที่ ${fmtPrice(it.buyNowPrice)}`;
  } else {
    buyNowInfo.classList.add("hidden");
  }

  // auto-close: first viewer to notice writes status closed (idempotent)
  if (remain <= 0 && it.status === "active" && db) {
    db.doc("items/" + it.id)
      .update({ status: "closed", closedAt: Date.now() })
      .catch(() => {});
  }

  const log = document.getElementById("detailLog");
  const entries = (it.log || []).slice().reverse();
  log.innerHTML = entries.length
    ? entries
        .map(
          (l) =>
            `<p><b>${esc(l.name)}</b> ${l.buyNow ? "⚡ ซื้อทันที" : "บิด"} ${fmtPrice(l.amount)}${l.extended ? " — ต่อเวลาอัตโนมัติ (sudden death)" : ""}</p>`,
        )
        .join("")
    : `<p><b>ระบบ</b> เริ่มการประมูล ราคาเริ่มต้น ${fmtPrice(it.startPrice)}</p>`;

  const bidbar = document.getElementById("bidbar");
  const canBid = db && !closed && !isSeller;
  bidbar.classList.toggle("hidden", !canBid);
  // the bid bar and the bottom nav bar share the same footer slot — never both
  document.getElementById("navbar").classList.toggle("hidden", canBid);
  if (canBid) {
    const buyNowBtn = document.getElementById("buyNowBtn");
    if (it.buyNowPrice && it.price < it.buyNowPrice) {
      buyNowBtn.classList.remove("hidden");
      buyNowBtn.textContent = `⚡ ซื้อทันทีที่ ${fmtPrice(it.buyNowPrice)}`;
    } else {
      buyNowBtn.classList.add("hidden");
    }
    const hasBidBefore = (it.log || []).some((l) => l.name === myName);
    const statusBar = document.getElementById("bidderStatusBar");
    if (hasBidBefore) {
      statusBar.classList.remove("hidden");
      if (isLeader) {
        statusBar.className = "bidder-status leading";
        statusBar.textContent = "🟢 ตอนนี้คุณให้ราคาสูงสุดอยู่";
      } else {
        statusBar.className = "bidder-status outbid";
        statusBar.textContent =
          "🔴 มีคนให้ราคาสูงกว่าคุณแล้ว — บิดใหม่เพื่อกลับมานำ";
        markOutbidSeen(it); // viewing this screen counts as having seen the current outbid price
      }
    } else {
      statusBar.classList.add("hidden");
    }
    const maxAllowedBid = (it.startPrice || 0) * MAX_BID_MULTIPLIER;
    const capReached = it.price >= maxAllowedBid;
    document
      .getElementById("bidCapReachedMsg")
      .classList.toggle("hidden", !capReached);
    document
      .getElementById("bidInputGroup")
      .classList.toggle("hidden", capReached);
    if (!capReached) {
      const inc = suggestIncrement(it.price);
      const suggested = Math.min(nextValidBid(it.price), maxAllowedBid);
      const suggested2 = Math.min(suggested + inc, maxAllowedBid);
      // only pre-fill the box — never overwrite what the person is actively typing.
      // renderDetail reruns every second (and on every live update from Firestore),
      // so unconditionally setting .value here was wiping out mid-typed bids.
      if (bidInputForItem !== it.id) {
        bidInputForItem = it.id;
        bidInputTouched = false;
      }
      if (!bidInputTouched)
        document.getElementById("bidInput").value = suggested;
      document.getElementById("quickRow").innerHTML =
        suggested2 > suggested
          ? `
        <button class="quickbtn" onclick="setBidInput(${suggested})">${fmtPrice(suggested)}</button>
        <button class="quickbtn" onclick="setBidInput(${suggested2})">${fmtPrice(suggested2)}</button>
      `
          : `<button class="quickbtn" onclick="setBidInput(${suggested})">${fmtPrice(suggested)}</button>`;
    }
  }
  syncDetailFooterPadding();

  const winPanel = document.getElementById("winPanel");
  if (!closed) {
    winPanel.classList.add("hidden");
    // renderClosedPanel() is the only place that ever sets the chat teaser's content/visibility,
    // and it only runs for a closed item — so without this, opening an open item right after
    // viewing a closed one left the PREVIOUS item's teaser (wrong name, wrong click target)
    // showing on a completely unrelated, still-open auction. Always reset it here too.
    document.getElementById("chatTeaser").classList.add("hidden");
  } else {
    winPanel.classList.remove("hidden");
    renderClosedPanel(it, winPanel, isSeller, isLeader);
  }

  // live stream section
  const liveStartBox = document.getElementById("liveSellerStartBox");
  const liveBox = document.getElementById("liveBox");
  // keep the item chip / shop caption fresh while actively engaged with this exact live (price
  // and viewer-facing fields can change mid-broadcast) — cheap DOM writes, only runs for the
  // one item that's actually live right now, not every render tick for every item.
  if ((liveIsBroadcaster || liveViewerPc) && liveItemId === it.id)
    renderLiveInfoOverlay(it);
  // the shared #liveBox/#liveVideoEl is a single device-wide resource — only one live session (as
  // broadcaster or viewer) can occupy it at a time. While it's mini-docked showing a DIFFERENT
  // item's session, this item's own render pass must leave it completely alone (never hide it,
  // never null its srcObject) instead of hijacking it just because a different item was opened.
  const liveBoxBusyElsewhere = liveItemId && liveItemId !== it.id;
  if (isSeller && !closed) {
    if (liveIsBroadcaster && liveItemId === it.id) {
      liveStartBox.classList.add("hidden"); // liveBox already showing from startLive()
    } else if (it.isLive) {
      liveStartBox.classList.add("hidden");
      if (!liveBoxBusyElsewhere) liveBox.classList.add("hidden"); // live from another session/reload
    } else {
      liveStartBox.classList.remove("hidden");
      if (!liveBoxBusyElsewhere) liveBox.classList.add("hidden");
    }
  } else {
    liveStartBox.classList.add("hidden");
    const watchingThis = liveViewerPc && liveItemId === it.id;
    if (!isSeller && it.isLive && !closed && !liveBoxBusyElsewhere) {
      if (!watchingThis) {
        liveBox.classList.remove("hidden");
        document.getElementById("liveControls").innerHTML =
          `<button class="btn btn-primary" onclick="joinLive('${it.id}')">▶ เข้าชมไลฟ์</button>`;
        document.getElementById("liveVideoEl").srcObject = null;
        document.getElementById("liveUnmuteBtn").classList.add("hidden");
      } else {
        document.getElementById("liveViewerCount").textContent =
          it.liveViewerCount || 0;
      }
    } else if (watchingThis) {
      leaveLive(); // seller ended the stream (or item closed) — tear our side down automatically
    } else if (!liveIsBroadcaster && !liveViewerPc && !liveBoxBusyElsewhere) {
      liveBox.classList.add("hidden");
      document.getElementById("liveUnmuteBtn").classList.add("hidden");
    }
  }
  if (
    (liveIsBroadcaster && liveItemId === it.id) ||
    (liveViewerPc && liveItemId === it.id)
  ) {
    document.getElementById("liveLikeCount").textContent = it.likeCount || 0;
  }
}
function setBidInput(v) {
  document.getElementById("bidInput").value = v;
  bidInputTouched = true;
}

async function submitBid() {
  const msg = document.getElementById("bidMsg");
  msg.textContent = "";
  if (!db) {
    msg.textContent = "ไม่ได้เชื่อมต่อฐานข้อมูล";
    return;
  }
  if (await checkBanned(localStorage.getItem("pramoon_phone"))) {
    msg.textContent = "บัญชีนี้ถูกระงับการใช้งาน บิดไม่ได้";
    return;
  }
  const it = findItem(currentItemId);
  if (!it) return;
  const amount = parseInt(document.getElementById("bidInput").value, 10);
  if (!amount || amount <= it.price) {
    msg.textContent = "ราคาต้องสูงกว่าราคาปัจจุบัน";
    return;
  }
  if (it.sellerName === myName) {
    msg.textContent = "คุณไม่สามารถบิดสินค้าของตัวเองได้";
    return;
  }
  const maxAllowedBid = (it.startPrice || 0) * MAX_BID_MULTIPLIER;
  if (amount > maxAllowedBid) {
    msg.textContent = `บิดได้ไม่เกิน ${fmtPrice(maxAllowedBid)} (${MAX_BID_MULTIPLIER} เท่าของราคาเริ่มต้น) — เช็คว่าพิมพ์เลขศูนย์เกินหรือเปล่า`;
    return;
  }
  // กันบิดเล่น: ต้องกดยืนยันซ้ำว่าตั้งใจซื้อจริง ก่อนบันทึกลงระบบ
  if (
    !confirm(
      `บิด ${fmtPrice(amount)} สำหรับ "${it.name}"\n\nการบิดถือว่าผูกพัน ถ้าคุณชนะต้องติดต่อผู้ขายเพื่อชำระเงินจริง\n\nยืนยันบิดหรือไม่?`,
    )
  )
    return;
  const btn = document.getElementById("bidBtn");
  btn.disabled = true;
  try {
    const ref = db.doc("items/" + it.id);
    const snap = await ref.get();
    if (!snap.exists) {
      msg.textContent = "สินค้านี้ถูกลบไปแล้ว";
      btn.disabled = false;
      return;
    }
    const d = snap.data();
    if (d.status === "closed" || (d.endsAt || 0) <= Date.now()) {
      msg.textContent = "ปิดประมูลไปแล้ว";
      btn.disabled = false;
      return;
    }
    if (amount <= d.price) {
      msg.textContent = "มีคนบิดแซงไปแล้ว ราคาล่าสุด " + fmtPrice(d.price);
      btn.disabled = false;
      return;
    }
    // เช็คซ้ำกับข้อมูลสดจาก Firestore เผื่อ startPrice ที่จำไว้ในเครื่อง (it.startPrice) เพี้ยนไปจากจริง
    if (amount > (d.startPrice || 0) * MAX_BID_MULTIPLIER) {
      msg.textContent = `บิดได้ไม่เกิน ${fmtPrice((d.startPrice || 0) * MAX_BID_MULTIPLIER)} (${MAX_BID_MULTIPLIER} เท่าของราคาเริ่มต้น)`;
      btn.disabled = false;
      return;
    }
    const remain = d.endsAt - Date.now();
    let extended = false;
    let newEnds = d.endsAt;
    if (remain < 1000 * 15) {
      newEnds = Date.now() + 1000 * 15;
      extended = true;
    }
    const newLog = (d.log || [])
      .concat([{ name: myName, amount, at: Date.now(), extended }])
      .slice(-20);
    await ref.update({
      price: amount,
      bidCount: (d.bidCount || 0) + 1,
      highestBidderName: myName,
      endsAt: newEnds,
      log: newLog,
    });
    msg.textContent = extended ? "บิดสำเร็จ — ต่อเวลาอัตโนมัติ" : "บิดสำเร็จ";
    bidInputTouched = false; // let the box refill with a fresh suggestion for the next bid
  } catch (e) {
    msg.textContent =
      "บิดไม่สำเร็จ ลองใหม่ (" + ((e && e.code) || "error") + ")";
  }
  btn.disabled = false;
}

// optional seller-set "buy it now" price — closes the auction immediately in the buyer's favor
async function buyNow(itemId) {
  if (!db) return;
  if (await checkBanned(localStorage.getItem("pramoon_phone"))) {
    alert("บัญชีนี้ถูกระงับการใช้งาน ซื้อไม่ได้");
    return;
  }
  const it = findItem(itemId);
  if (!it || !it.buyNowPrice) return;
  if (it.sellerName === myName) {
    alert("คุณไม่สามารถซื้อสินค้าของตัวเองได้");
    return;
  }
  if (
    !confirm(
      `ซื้อทันทีที่ ${fmtPrice(it.buyNowPrice)} สำหรับ "${it.name}"?\n\nประมูลจะปิดทันทีให้คุณเป็นผู้ชนะ ถือว่าผูกพัน ต้องติดต่อผู้ขายเพื่อชำระเงินจริง`,
    )
  )
    return;
  const btn = document.getElementById("buyNowBtn");
  btn.disabled = true;
  try {
    const ref = db.doc("items/" + itemId);
    const snap = await ref.get();
    if (!snap.exists) {
      alert("สินค้านี้ถูกลบไปแล้ว");
      btn.disabled = false;
      return;
    }
    const d = snap.data();
    if (d.status === "closed" || (d.endsAt || 0) <= Date.now()) {
      alert("ปิดประมูลไปแล้ว");
      btn.disabled = false;
      return;
    }
    if (!d.buyNowPrice || d.price >= d.buyNowPrice) {
      alert("ราคาปัจจุบันถึงหรือเกินราคาซื้อทันทีไปแล้ว — บิดตามปกติแทน");
      btn.disabled = false;
      return;
    }
    const newLog = (d.log || [])
      .concat([
        { name: myName, amount: d.buyNowPrice, at: Date.now(), buyNow: true },
      ])
      .slice(-20);
    await ref.update({
      price: d.buyNowPrice,
      bidCount: (d.bidCount || 0) + 1,
      highestBidderName: myName,
      log: newLog,
      status: "closed",
      closedAt: Date.now(),
    });
  } catch (e) {
    alert("ซื้อทันทีไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
  btn.disabled = false;
}

let autoChatShownFor = new Set(); // items already auto-jumped-to-chat this session

function renderClosedPanel(it, panel, isSeller, isLeader) {
  const teaser = document.getElementById("chatTeaser");
  if (!it.bidCount) {
    panel.className = "win-panel neutral";
    panel.innerHTML = `<p class="win-title">ปิดประมูลแล้ว — ไม่มีผู้บิด</p>`;
    teaser.classList.add("hidden");
    return;
  }
  const winnerLine = `ผู้ชนะ: <b>${esc(it.highestBidderName)}</b> ที่ ${fmtPrice(it.price)}`;
  const isParty = isSeller || isLeader;
  if (isLeader && !isSeller) {
    panel.className = "win-panel";
    panel.innerHTML = `<p class="win-title">🎉 คุณชนะการประมูล!</p><p style="margin:0; font-size:12.5px;">ราคาสุดท้าย ${fmtPrice(it.price)} — คุยกับผู้ขาย (${esc(it.sellerName)}) ในแชทเพื่อนัดวิธีชำระเงินและจัดส่งกันเอง</p>`;
  } else if (isSeller) {
    panel.className = "win-panel";
    panel.innerHTML = `<p class="win-title">ขายได้แล้ว! ${fmtPrice(it.price)}</p><p style="margin:0; font-size:12.5px;">${winnerLine} — คุยกับผู้ชนะในแชทเพื่อนัดวิธีชำระเงินและจัดส่งกันเอง</p>`;
  } else {
    panel.className = "win-panel neutral";
    panel.innerHTML = `<p class="win-title">ปิดประมูลแล้ว</p><p style="margin:0; font-size:12.5px;">${winnerLine}</p>`;
  }
  if (isParty) {
    const otherName = isSeller ? it.highestBidderName : it.sellerName;
    teaser.classList.remove("hidden");
    teaser.onclick = () => openChatFull(it.id, "detail");
    teaser.innerHTML = `<div><b>💬 แชทกับ ${esc(otherName)}</b>${hasUnreadChat(it) ? `<span class="chat-teaser-unread">ข้อความใหม่</span>` : ""}<br><span>แตะเพื่อเปิดแชทแบบเต็มจอ</span></div><span style="font-size:18px;">&rsaquo;</span>`;
    if (!autoChatShownFor.has(it.id)) {
      autoChatShownFor.add(it.id);
      openChatFull(it.id, "detail");
    }
  } else {
    teaser.classList.add("hidden");
  }
}

