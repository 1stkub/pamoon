/* ---------- db state ---------- */
let db = null;
let allItems = []; // [{id, ...fields}]
let currentItemId = null;
let activeTab = "all";
let sortOrder = "newest"; // 'newest' | 'oldest' | 'priceLow' | 'priceHigh'
let activeCat = null;
let activeSubcat = null;
let selectedSellCat = null;
let selectedSellSubcat = null;
let selectedSellDuration = null;
let editingItemId = null; // set when screen-sell is reused to edit an existing listing instead of creating a new one
const EDIT_WINDOW_MS = 1000 * 60 * 30; // sellers can edit/delete a listing for 30 min after posting, only before any bids land
let sellPhotos = []; // 0-10 cropped photo data URLs, first one is the cover
const MAX_PHOTOS = 10;
const MIN_PHOTOS = 2;
const MAX_PHOTOS_BYTES = 700 * 1024; // headroom under Firestore's 1MiB per-document cap
let bidInputForItem = null; // which item's suggestion is currently pre-filled
let bidInputTouched = false; // true once the person has typed/picked their own amount

// generic: read+resize+compress an <input type=file> image into a JPEG data URL
function compressImageFile(file, maxDim, quality, onDone, onError) {
  if (!file) {
    onDone(null);
    return;
  }
  if (!file.type.startsWith("image/")) {
    onError && onError("เลือกไฟล์รูปภาพเท่านั้น");
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => {
    onError && onError("อ่านไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง");
  };
  reader.onload = (e) => {
    const img = new Image();
    // without this, a format the browser can't decode (most commonly HEIC/HEIF — the default
    // photo format on iPhones) just never fires onload and never fires any error either — the
    // whole upload silently hangs forever with zero feedback, which is exactly what "choose a
    // file and nothing happens" looks like from the outside
    img.onerror = () => {
      onError &&
        onError(
          'ไม่รองรับไฟล์รูปภาพนี้ (มักเกิดกับรูปแบบ HEIC จาก iPhone) — ลองเลือก "ถ่ายภาพหน้าจอ" ของรูปนั้นแทน หรือแปลงไฟล์เป็น JPG/PNG ก่อนอัปโหลด',
        );
    };
    img.onload = () => {
      let w = img.width,
        h = img.height;
      if (w >= h && w > maxDim) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      } else if (h > w && h > maxDim) {
        w = Math.round((w * maxDim) / h);
        h = maxDim;
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      onDone(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/* ---------- crop modal (shared: listing photos, shop logo) ---------- */
let cropImgNatural = { w: 1, h: 1 };
let cropScale = 1,
  cropMinScale = 1;
let cropTranslate = { x: 0, y: 0 };
let cropDragStart = null;
let cropOnConfirm = null;
let cropFrameSize = 260,
  cropOutputSize = 720,
  cropQuality = 0.68;

function openCropModal(file, opts, onConfirm) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    alert("เลือกไฟล์รูปภาพเท่านั้น");
    return;
  }
  cropFrameSize = opts.frameSize || 260;
  cropOutputSize = opts.outputSize || 720;
  cropQuality = opts.quality || 0.68;
  cropOnConfirm = onConfirm;
  const reader = new FileReader();
  reader.onerror = () => {
    alert("อ่านไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง");
  };
  reader.onload = (e) => {
    const img = new Image();
    // same real-world gotcha as compressImageFile() — an undecodable format (typically HEIC from
    // an iPhone) never fires onload and, without this, never fires anything else either: picking
    // a photo would just silently do nothing forever, with no error to explain why
    img.onerror = () => {
      alert(
        'ไม่รองรับไฟล์รูปภาพนี้ (มักเกิดกับรูปแบบ HEIC จาก iPhone) — ลองเลือก "ถ่ายภาพหน้าจอ" ของรูปนั้นแทน หรือแปลงไฟล์เป็น JPG/PNG ก่อนอัปโหลด',
      );
    };
    img.onload = () => {
      cropImgNatural = { w: img.width, h: img.height };
      cropMinScale = Math.max(
        cropFrameSize / img.width,
        cropFrameSize / img.height,
      );
      cropScale = cropMinScale;
      cropTranslate = { x: 0, y: 0 };
      const el = document.getElementById("cropImgEl");
      el.src = e.target.result;
      document.getElementById("cropFrame").style.width = cropFrameSize + "px";
      document.getElementById("cropFrame").style.height = cropFrameSize + "px";
      const range = document.getElementById("cropZoomRange");
      range.min = cropMinScale;
      range.max = cropMinScale * 3.5;
      range.step = (cropMinScale * 2.5) / 100;
      range.value = cropScale;
      applyCropTransform();
      document.getElementById("cropOverlay").classList.remove("hidden");
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
function applyCropTransform() {
  document.getElementById("cropImgEl").style.transform =
    `translate(-50%,-50%) translate(${cropTranslate.x}px, ${cropTranslate.y}px) scale(${cropScale})`;
}
function clampCropTranslate() {
  const w = cropImgNatural.w * cropScale,
    h = cropImgNatural.h * cropScale;
  const maxX = Math.max(0, (w - cropFrameSize) / 2),
    maxY = Math.max(0, (h - cropFrameSize) / 2);
  cropTranslate.x = Math.min(maxX, Math.max(-maxX, cropTranslate.x));
  cropTranslate.y = Math.min(maxY, Math.max(-maxY, cropTranslate.y));
}
function cropZoomChange(v) {
  cropScale = parseFloat(v);
  clampCropTranslate();
  applyCropTransform();
}
function cancelCrop() {
  document.getElementById("cropOverlay").classList.add("hidden");
  cropOnConfirm = null;
}
function confirmCrop() {
  const s = cropOutputSize / cropFrameSize;
  const canvas = document.createElement("canvas");
  canvas.width = cropOutputSize;
  canvas.height = cropOutputSize;
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.translate(cropOutputSize / 2, cropOutputSize / 2);
  ctx.translate(cropTranslate.x * s, cropTranslate.y * s);
  ctx.scale(cropScale * s, cropScale * s);
  ctx.drawImage(
    document.getElementById("cropImgEl"),
    -cropImgNatural.w / 2,
    -cropImgNatural.h / 2,
  );
  ctx.restore();
  const dataUrl = canvas.toDataURL("image/jpeg", cropQuality);
  const cb = cropOnConfirm;
  document.getElementById("cropOverlay").classList.add("hidden");
  cropOnConfirm = null;
  if (cb) cb(dataUrl);
}
(function setupCropDrag() {
  const frame = document.getElementById("cropFrame");
  const start = (x, y) => {
    cropDragStart = { x: x - cropTranslate.x, y: y - cropTranslate.y };
  };
  const move = (x, y) => {
    if (!cropDragStart) return;
    cropTranslate = { x: x - cropDragStart.x, y: y - cropDragStart.y };
    clampCropTranslate();
    applyCropTransform();
  };
  const end = () => {
    cropDragStart = null;
  };
  frame.addEventListener("pointerdown", (e) => {
    frame.setPointerCapture(e.pointerId);
    start(e.clientX, e.clientY);
  });
  frame.addEventListener("pointermove", (e) => {
    move(e.clientX, e.clientY);
  });
  frame.addEventListener("pointerup", end);
  frame.addEventListener("pointercancel", end);
})();

/* ---------- multi-photo picker for listings (2-10 photos) ---------- */
function totalSellPhotosBytes() {
  return sellPhotos.reduce((sum, p) => sum + p.length, 0);
}
function renderSellPhotoGrid() {
  const grid = document.getElementById("sellPhotoGrid");
  let html = sellPhotos
    .map(
      (p, idx) => `
    <div class="photo-tile">
      <img src="${p}" alt="รูปสินค้า ${idx + 1}">
      ${idx === 0 ? '<span class="cover-tag">ปก</span>' : ""}
      <div class="rm" onclick="removeSellPhoto(${idx})">✕</div>
    </div>`,
    )
    .join("");
  if (sellPhotos.length < MAX_PHOTOS) {
    html += `<div class="photo-add-tile" onclick="document.getElementById('sellPhotoInput').click()"><span class="plus">+</span><span>เพิ่มรูป</span></div>`;
  }
  grid.innerHTML = html;
  const hint = document.getElementById("sellPhotoHint");
  if (sellPhotos.length < MIN_PHOTOS) {
    hint.className = "photo-count-hint short";
    hint.textContent = `ใส่แล้ว ${sellPhotos.length}/${MIN_PHOTOS} รูป — ต้องมีอย่างน้อย ${MIN_PHOTOS} รูปถึงจะลงประกาศได้`;
  } else {
    hint.className = "photo-count-hint ok";
    hint.textContent = `ใส่แล้ว ${sellPhotos.length}/${MAX_PHOTOS} รูป — รูปแรกจะใช้เป็นปกสินค้า`;
  }
}
function removeSellPhoto(idx) {
  sellPhotos.splice(idx, 1);
  renderSellPhotoGrid();
}
function handleSellPhotoPick(ev) {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = ""; // allow re-picking the same file later
  if (!file || sellPhotos.length >= MAX_PHOTOS) return;
  // used to force every listing photo through the square crop modal — fine for a logo/avatar,
  // but it was permanently cutting the sides off any non-square photo (a landscape game-account
  // screenshot showing off stats, a wide product shot, etc.) before it was even saved, so there
  // was no "seeing it fully" later no matter how the detail screen displayed it. Just resize +
  // compress instead, preserving whatever shape the original photo actually is — the same
  // approach already used for wallpaper and chat photos elsewhere in the app.
  compressImageFile(
    file,
    900,
    0.66,
    (dataUrl) => {
      if (totalSellPhotosBytes() + dataUrl.length > MAX_PHOTOS_BYTES) {
        alert(
          "รูปภาพรวมกันใหญ่เกินไปแล้ว ลองลบรูปเก่าออกบางรูปก่อนเพิ่มรูปใหม่",
        );
        return;
      }
      sellPhotos.push(dataUrl);
      renderSellPhotoGrid();
    },
    (err) => alert(err),
  );
}
function itemPhotos(it) {
  if (it && it.photos && it.photos.length) return it.photos;
  if (it && it.photo) return [it.photo];
  return [];
}

function initDb() {
  const dot = document.getElementById("connDot");
  const label = document.getElementById("connLabel");
  const warn = document.getElementById("warnBar");

  if (firebaseConfig.apiKey.indexOf("PASTE_") === 0) {
    dot.className = "conndot bad";
    label.textContent = "ยังไม่ได้ตั้งค่า";
    warn.classList.remove("hidden");
    warn.textContent =
      "ยังไม่ได้ใส่ค่า Firebase config ในไฟล์นี้ — เปิดไฟล์ html แก้ firebaseConfig ด้านบนก่อนใช้งานจริง";
    renderFeed();
    return;
  }

  try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
  } catch (e) {
    dot.className = "conndot bad";
    label.textContent = "ตั้งค่าไม่สำเร็จ";
    warn.classList.remove("hidden");
    warn.textContent =
      "เชื่อมต่อ Firebase ไม่สำเร็จ: " + ((e && e.message) || e);
    renderFeed();
    return;
  }

  dot.className = "conndot live";
  label.textContent = "เชื่อมต่อแล้ว";
  warn.classList.add("hidden");
  subscribeShops();
  db.collection("items").onSnapshot(
    (snap) => {
      allItems = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // each step runs independently — one bad item (missing a field an older/newer
      // render function assumes exists) must not throw and silently cancel every step
      // after it for the rest of the session, especially the notification badges below
      const steps = [
        renderFeed,
        renderMineListingsAndBids,
        () => {
          if (currentItemId) renderDetail();
        },
        // NOTE: renderShopHeader() deliberately NOT called here — it already has its own dedicated
        // shopUnsub/shopReviewsUnsub listeners (see openShop()) and doesn't depend on allItems at all.
        // Re-rendering it here too, on every unrelated item change anywhere in the app, used to
        // destroy focus and wipe in-progress typing in the shop-edit form (and could cut off an
        // async photo upload/crop mid-flight) every time it fired — which, with items changing
        // this often, made shop editing feel badly broken.
        () => {
          if (viewingShopName) renderShopItems();
        },
        () => {
          if (chatItemId) renderChatOrderStatus(findItem(chatItemId));
        },
        () => {
          if (
            !document
              .getElementById("screen-messages")
              .classList.contains("hidden")
          )
            renderMessages();
        },
        updateNotifBadge,
        () => {
          if (
            !document
              .getElementById("screen-shops")
              .classList.contains("hidden")
          )
            renderShopDirectory();
        },
        () => {
          if (
            !document
              .getElementById("screen-livehub")
              .classList.contains("hidden")
          )
            renderLiveHub();
        },
        () => {
          if (
            !document
              .getElementById("screen-notifications")
              .classList.contains("hidden")
          )
            renderNotifications();
        },
        () => {
          if (
            !document.getElementById("screen-cat").classList.contains("hidden")
          ) {
            renderRecoShops();
            renderRecoItems();
          }
        },
        // now that a live session can sit minimized on any screen (not just this item's own detail
        // screen), the old "seller ended the stream → tear our side down" check inside renderDetail()
        // would never run while mini-docked elsewhere — this catches it independently of which
        // screen is actually showing, straight off the same real-time item data everything else here uses.
        checkLiveStillActive,
      ];
      steps.forEach((step) => {
        try {
          step();
        } catch (e) {
          console.error("items onSnapshot step failed", e);
        }
      });
    },
    (err) => {
      dot.className = "conndot bad";
      label.textContent = "หลุดการเชื่อมต่อ";
      warn.classList.remove("hidden");
      warn.textContent =
        "เชื่อมต่อฐานข้อมูลไม่ได้: " +
        ((err && err.message) || err) +
        " — เช็ค Firestore Security Rules ว่าเปิดอ่าน/เขียนไว้หรือยัง";
    },
  );
}

function afterName(role) {
  // initDb() already ran at boot (Firestore has to be up before the login screen can check phones) —
  // just land the person on the right screen for their role.
  myRole = role;
  document.getElementById("mineNameLabel").textContent = myName;
  renderCats();
  subscribeMyProfile();
  checkAdmin(localStorage.getItem("pramoon_phone")).then((isAdmin) => {
    myIsAdmin = isAdmin;
    document
      .getElementById("adminPanelLink")
      .classList.toggle("hidden", !isAdmin);
  });
  if (role === "seller") openSell();
  else goTo("feed");
  setInterval(tick, 1000);
  showTipIfNeeded();
}
function showTipIfNeeded() {
  if (localStorage.getItem("pramoon_tip_seen")) return;
  document.getElementById("tipOverlay").classList.remove("hidden");
}
function closeTip() {
  localStorage.setItem("pramoon_tip_seen", "1");
  document.getElementById("tipOverlay").classList.add("hidden");
}

