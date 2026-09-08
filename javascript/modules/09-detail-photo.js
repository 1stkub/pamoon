/* ---------- detail ---------- */
let detailPhotoIdx = 0;
function setDetailPhoto(idx) {
  detailPhotoIdx = idx;
  const it = findItem(currentItemId);
  if (!it) return;
  const photos = itemPhotos(it);
  document.getElementById("detailMedia").innerHTML =
    `<img src="${photos[idx]}" alt="" onclick="openLightbox(itemPhotos(findItem(currentItemId)), detailPhotoIdx)">`;
  document
    .querySelectorAll("#galleryStrip img")
    .forEach((img, i) => img.classList.toggle("active", i === idx));
}

/* ---------- fullscreen photo lightbox (view before bidding) ---------- */
let lightboxPhotos = [];
let lightboxIdx = 0;
let lightboxZoom = 1,
  lightboxPanX = 0,
  lightboxPanY = 0;
let lightboxPinchStartDist = null,
  lightboxPinchStartZoom = 1;
let lightboxDragStart = null;
function openLightbox(photos, idx) {
  if (!photos || !photos.length) return;
  lightboxPhotos = photos;
  lightboxIdx = idx || 0;
  resetLightboxZoom();
  renderLightbox();
  document.getElementById("lightboxOverlay").classList.remove("hidden");
}
function renderLightbox() {
  document.getElementById("lightboxImg").src = lightboxPhotos[lightboxIdx];
  const multi = lightboxPhotos.length > 1;
  document.getElementById("lightboxPrev").classList.toggle("hidden", !multi);
  document.getElementById("lightboxNext").classList.toggle("hidden", !multi);
  const countEl = document.getElementById("lightboxCount");
  countEl.classList.toggle("hidden", !multi);
  if (multi)
    countEl.textContent = `${lightboxIdx + 1} / ${lightboxPhotos.length}`;
}
function lightboxStep(dir) {
  lightboxIdx =
    (lightboxIdx + dir + lightboxPhotos.length) % lightboxPhotos.length;
  resetLightboxZoom();
  renderLightbox();
}
function closeLightbox() {
  document.getElementById("lightboxOverlay").classList.add("hidden");
  resetLightboxZoom();
}
function resetLightboxZoom() {
  lightboxZoom = 1;
  lightboxPanX = 0;
  lightboxPanY = 0;
  applyLightboxTransform();
}
function applyLightboxTransform() {
  const img = document.getElementById("lightboxImg");
  if (img)
    img.style.transform = `translate(${lightboxPanX}px, ${lightboxPanY}px) scale(${lightboxZoom})`;
}
function lightboxDoubleTap(e) {
  e.stopPropagation();
  if (lightboxZoom > 1) resetLightboxZoom();
  else {
    lightboxZoom = 2.5;
    applyLightboxTransform();
  }
}
function lightboxWheel(e) {
  e.preventDefault();
  e.stopPropagation();
  lightboxZoom = Math.min(
    4,
    Math.max(1, lightboxZoom + (e.deltaY < 0 ? 0.15 : -0.15)),
  );
  if (lightboxZoom === 1) {
    lightboxPanX = 0;
    lightboxPanY = 0;
  }
  applyLightboxTransform();
}
function lightboxTouchStart(e) {
  if (e.touches.length === 2) {
    e.preventDefault();
    const dx = e.touches[0].clientX - e.touches[1].clientX,
      dy = e.touches[0].clientY - e.touches[1].clientY;
    lightboxPinchStartDist = Math.hypot(dx, dy);
    lightboxPinchStartZoom = lightboxZoom;
  } else if (e.touches.length === 1 && lightboxZoom > 1) {
    lightboxDragStart = {
      x: e.touches[0].clientX - lightboxPanX,
      y: e.touches[0].clientY - lightboxPanY,
    };
  }
}
function lightboxTouchMove(e) {
  if (e.touches.length === 2 && lightboxPinchStartDist) {
    e.preventDefault();
    const dx = e.touches[0].clientX - e.touches[1].clientX,
      dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.hypot(dx, dy);
    lightboxZoom = Math.min(
      4,
      Math.max(1, lightboxPinchStartZoom * (dist / lightboxPinchStartDist)),
    );
    applyLightboxTransform();
  } else if (e.touches.length === 1 && lightboxDragStart) {
    e.preventDefault();
    lightboxPanX = e.touches[0].clientX - lightboxDragStart.x;
    lightboxPanY = e.touches[0].clientY - lightboxDragStart.y;
    applyLightboxTransform();
  }
}
function lightboxTouchEnd() {
  lightboxPinchStartDist = null;
  lightboxDragStart = null;
  if (lightboxZoom === 1) {
    lightboxPanX = 0;
    lightboxPanY = 0;
    applyLightboxTransform();
  }
}
function openItem(id) {
  // used to hard-stop any running live session just because you opened a DIFFERENT item — with
  // the floating mini-player (updateLiveDock(), called from goTo() below) it correctly just
  // docks as a small floating player instead, exactly like navigating to any other screen.
  currentItemId = id;
  detailPhotoIdx = 0;
  bidInputForItem = null;
  bidInputTouched = false; // fresh suggestion every time the item is (re)opened
  detailBidWatch = null; // don't compare against another item's last-seen bid state
  const titleInput = document.getElementById("liveTitleInput");
  if (titleInput) titleInput.value = ""; // don't carry a live title over from a different item
  renderDetail();
  goTo("detail");
}

/* ---------- bidder-mode: toast + status feedback when the price moves ---------- */
function showToast(text, type) {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const el = document.createElement("div");
  el.className = "toast" + (type === "warn" ? " warn" : "");
  el.textContent = text;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add("fadeout");
    setTimeout(() => el.remove(), 300);
  }, 3200);
}
