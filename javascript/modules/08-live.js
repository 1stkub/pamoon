/* ---------- live streaming — WebRTC mesh, signaled entirely through Firestore, no media server -----------
   Known real limits: no TURN server, so it can fail on strict/symmetric-NAT networks (common on some mobile
   carriers); it's a mesh (one RTCPeerConnection per viewer on the seller's device), so it only really holds up
   for a handful of simultaneous viewers, not a real broadcast audience. ------------------------------------- */
const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    // free public TURN (Metered "Open Relay Project") — relays media when two real
    // devices can't reach each other directly (mobile-data NATs etc). Shared/free tier,
    // fine for closed-group testing; revisit if live streaming grows beyond that.
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};
let liveLocalStream = null;
let liveIsBroadcaster = false;
let liveItemId = null;
let liveSignalsUnsub = null; // seller: watches every viewer's signal doc
let livePeerConnections = {}; // seller: viewerId -> {pc, appliedViewerCandidates, offered}
let liveViewerPc = null; // viewer: own connection
let liveViewerId = null; // viewer: = myName (fine for a small closed-test group)
let liveOwnSignalUnsub = null; // viewer: watches own signal doc
let liveViewerAppliedSellerCandidates = 0;
let liveChatUnsub = null; // both roles: live chat messages for the current broadcast
let liveChatMessages = [];

// broadcaster-only: camera facing + real-time filter pipeline. The raw camera feed is drawn onto
// a canvas every frame with a CSS filter applied, and canvas.captureStream() (not the raw camera
// stream) is what's actually sent over WebRTC — so a filter affects what viewers see too.
const LIVE_FILTERS = [
  { id: "normal", label: "ปกติ" },
  { id: "vivid", label: "สดใส" },
  { id: "soft", label: "นุ่มนวล" },
  { id: "bw", label: "ขาวดำ" },
  { id: "warm", label: "วินเทจ" },
];
// applies a filter by directly rewriting pixel data (getImageData/putImageData) rather than
// the Canvas 2D "filter" property (ctx.filter = 'grayscale(1)' etc.) — that property has patchy
// real-world support (notably weak/absent on older iOS Safari), where setting it is simply
// ignored with no error, so the filter silently does nothing while the video keeps working —
// exactly the "กดแล้วไม่ขึ้นไม่ปรับอะไร" symptom reported. Manual pixel math works everywhere
// getImageData/putImageData do, which is effectively every browser.
function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
function applyLiveFilterPixels(imageData, filterId) {
  if (filterId === "normal") return;
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i],
      g = d[i + 1],
      b = d[i + 2];
    if (filterId === "bw") {
      const gray = r * 0.3 + g * 0.59 + b * 0.11;
      d[i] = d[i + 1] = d[i + 2] = gray;
    } else if (filterId === "vivid") {
      const avg = (r + g + b) / 3;
      d[i] = clamp255(avg + (r - avg) * 1.5);
      d[i + 1] = clamp255(avg + (g - avg) * 1.5);
      d[i + 2] = clamp255(avg + (b - avg) * 1.5);
    } else if (filterId === "soft") {
      d[i] = clamp255(r * 1.08 + 8);
      d[i + 1] = clamp255(g * 1.05 + 8);
      d[i + 2] = clamp255(b * 1.05 + 8);
    } else if (filterId === "warm") {
      d[i] = clamp255(r * 1.15 + 15);
      d[i + 1] = clamp255(g * 1.05 + 8);
      d[i + 2] = clamp255(b * 0.85);
    }
  }
}
let currentLiveFilter = "normal";
let liveFacingMode = "user"; // 'user' = front camera, 'environment' = back camera
let liveFilterRAF = null;
function startLiveFilterLoop() {
  const canvas = document.getElementById("liveFilterCanvas");
  const rawVideo = document.getElementById("liveRawVideoEl");
  const ctx = canvas.getContext("2d");
  (function draw() {
    // a transient error here (e.g. drawImage() called during the split-second the video element's
    // source is being swapped out mid camera-switch) must never be allowed to silently kill this
    // recursive rAF loop forever — without this try/catch that's exactly what happened: one bad
    // frame during switchLiveCamera() froze the filtered output permanently for the rest of the stream
    try {
      if (rawVideo.videoWidth) {
        if (canvas.width !== rawVideo.videoWidth) {
          canvas.width = rawVideo.videoWidth;
          canvas.height = rawVideo.videoHeight;
        }
        ctx.drawImage(rawVideo, 0, 0, canvas.width, canvas.height);
        if (currentLiveFilter !== "normal") {
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          applyLiveFilterPixels(imgData, currentLiveFilter);
          ctx.putImageData(imgData, 0, 0);
        }
      }
    } catch (e) {}
    liveFilterRAF = requestAnimationFrame(draw);
  })();
}
function stopLiveFilterLoop() {
  if (liveFilterRAF) {
    cancelAnimationFrame(liveFilterRAF);
    liveFilterRAF = null;
  }
}
function renderLiveFilterRow() {
  const row = document.getElementById("liveFilterRow");
  if (!row) return;
  row.innerHTML = LIVE_FILTERS.map(
    (f) =>
      `<button class="${f.id === currentLiveFilter ? "active" : ""}" onclick="pickLiveFilter('${f.id}')">${f.label}</button>`,
  ).join("");
}
function pickLiveFilter(id) {
  currentLiveFilter = id;
  renderLiveFilterRow();
}
function renderLiveInfoOverlay(it) {
  if (!it) return;
  const el = document.getElementById("liveInfoOverlay");
  if (el) {
    const shopName =
      (allShops[it.sellerName] || {}).displayName || it.sellerName;
    el.innerHTML = `<p class="shop-line">🏪 ${esc(shopName)}</p>${it.liveTitle ? `<p class="title-line">${esc(it.liveTitle)}</p>` : ""}`;
  }
  // item chip — the "which auction is this live for" marker requested after live moved to a
  // floating mini-player: without it, a live seen from another screen (or the hub) had no visible
  // link back to the actual listing it belongs to.
  const chip = document.getElementById("liveItemChip");
  if (chip) {
    const photo = itemPhotos(it)[0];
    chip.innerHTML =
      `${photo ? `<img src="${photo}" alt="">` : `<span class="chip-emoji">${catInfo(it.cat).emoji}</span>`}` +
      `<span class="chip-text"><b>${esc(it.name)}</b>${fmtPrice(it.price)}</span>`;
    chip.onclick = (e) => {
      e.stopPropagation();
      openItem(it.id);
    };
  }
}
// connecting/loading overlay — shown from the instant a join/broadcast starts until the video
// element actually reports a real frame playing, replacing what used to be a plain black <video>
// box for however long WebRTC negotiation/ICE takes (the reported "หน้าจอจะดำสักแป๊บ" bug).
let liveConnectingTimeout = null;
let liveConnectingGiveUpTimeout = null;
function showLiveConnecting() {
  const el = document.getElementById("liveConnecting");
  if (!el) return;
  el.classList.remove("hidden");
  el.querySelector("p").textContent = "กำลังเชื่อมต่อสด...";
  clearTimeout(liveConnectingTimeout);
  clearTimeout(liveConnectingGiveUpTimeout);
  liveConnectingTimeout = setTimeout(() => {
    if (!el.classList.contains("hidden"))
      el.querySelector("p").textContent =
        "เชื่อมต่อช้ากว่าปกติ เครือข่ายอาจไม่เสถียร รอสักครู่...";
  }, 12000);
  // real mobile-network NAT/firewalls can leave a WebRTC connection sitting "connected" for a
  // while before media actually starts flowing — don't trap the viewer behind a spinner forever
  // if a real video frame genuinely never arrives; fail open so at least the rest of the controls
  // (unmute, chat, reactions, leave) stay usable instead of being hidden behind an endless loader.
  liveConnectingGiveUpTimeout = setTimeout(hideLiveConnecting, 25000);
}
function hideLiveConnecting() {
  clearTimeout(liveConnectingTimeout);
  clearTimeout(liveConnectingGiveUpTimeout);
  liveConnectingTimeout = null;
  liveConnectingGiveUpTimeout = null;
  const el = document.getElementById("liveConnecting");
  if (el) el.classList.add("hidden");
}
// different browsers/codecs/autoplay policies fire different "a real frame is actually ready"
// events first (playing / loadeddata / canplay) — listening for whichever comes first is more
// robust than betting on just one of them.
function wireHideLiveConnectingOnFrame(video) {
  const done = () => {
    hideLiveConnecting();
    video.removeEventListener("playing", done);
    video.removeEventListener("loadeddata", done);
    video.removeEventListener("canplay", done);
  };
  video.addEventListener("playing", done);
  video.addEventListener("loadeddata", done);
  video.addEventListener("canplay", done);
}
// live "mini player" dock — moves the SAME #liveBox node (video element included; reparenting a
// <video> never interrupts its srcObject/playback) between its normal in-page slot on the item's
// own detail screen and a small floating dock elsewhere, instead of tearing the whole broadcast/
// viewer connection down just because the screen changed underneath it.
function updateLiveDock() {
  const liveBox = document.getElementById("liveBox");
  const dockSlot = document.getElementById("liveDockSlot");
  const miniDock = document.getElementById("liveMiniDock");
  if (!liveBox || !dockSlot || !miniDock) return;
  if (!liveItemId) {
    liveBox.classList.add("hidden");
    liveBox.classList.remove("live-mini");
    miniDock.classList.add("hidden");
    if (liveBox.parentElement !== dockSlot) dockSlot.appendChild(liveBox);
    return;
  }
  const detailScreenVisible = !document
    .getElementById("screen-detail")
    .classList.contains("hidden");
  const onMatchingItem = detailScreenVisible && currentItemId === liveItemId;
  if (onMatchingItem) {
    if (liveBox.parentElement !== dockSlot) dockSlot.appendChild(liveBox);
    liveBox.classList.remove("live-mini");
    liveBox.classList.remove("hidden");
    miniDock.classList.add("hidden");
  } else {
    if (liveBox.parentElement !== miniDock) miniDock.appendChild(liveBox);
    liveBox.classList.add("live-mini");
    liveBox.classList.remove("hidden");
    miniDock.classList.remove("hidden");
  }
}
// tapping the mini player expands it back to the full item screen; tapping any of its own
// controls (close btn etc, which stopPropagation()) must not also trigger this
function handleLiveBoxClick() {
  const box = document.getElementById("liveBox");
  if (!box.classList.contains("live-mini")) return; // inline mode — let inner elements handle their own clicks as before
  if (liveItemId) openItem(liveItemId);
}
function requestStopLive() {
  if (confirm("ต้องการจบไลฟ์ตอนนี้เลยหรือไม่?")) stopLive();
}
// the mini player's own ✕ — a small tap target reached from anywhere in the app, so a broadcaster
// gets a confirm before it actually ends their stream; a viewer's "leave" isn't destructive, so it
// just leaves immediately.
function miniCloseLive() {
  if (liveIsBroadcaster) requestStopLive();
  else leaveLive();
}
// runs on every real-time items update regardless of which screen is showing (see the items
// onSnapshot steps array) — the viewer/broadcaster-side teardown used to live entirely inside
// renderDetail(), which only ran while actually viewing that exact item's detail screen; once a
// live session could stay minimized elsewhere, that stopped being enough to notice the stream
// actually ending or the listing disappearing while mini-docked away from it.
function checkLiveStillActive() {
  if (liveViewerPc && liveItemId) {
    const it = findItem(liveItemId);
    if (!it || !it.isLive || itemIsClosed(it)) leaveLive();
  }
  if (liveIsBroadcaster && liveItemId && !findItem(liveItemId)) {
    stopLive(); // the listing itself got deleted (e.g. by an admin) while broadcasting
  }
}
async function switchLiveCamera() {
  if (!liveIsBroadcaster) return;
  const newFacing = liveFacingMode === "user" ? "environment" : "user";
  try {
    const newRaw = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: newFacing,
        width: { ideal: 480 },
        height: { ideal: 360 },
      },
      audio: false,
    });
    const rawVideoEl = document.getElementById("liveRawVideoEl");
    const oldStream = rawVideoEl.srcObject;
    rawVideoEl.srcObject = newRaw;
    await rawVideoEl.play().catch(() => {});
    if (oldStream) oldStream.getTracks().forEach((t) => t.stop()); // only the old camera track — mic audio track is untouched, it lives on liveLocalStream separately
    liveFacingMode = newFacing;
    // mirror only the broadcaster's own local preview for a natural selfie feel — the outgoing
    // canvas frames are never mirrored, so viewers always see correctly-oriented video/text
    document.getElementById("liveVideoEl").style.transform =
      liveFacingMode === "user" ? "scaleX(-1)" : "none";
  } catch (e) {
    alert("สลับกล้องไม่สำเร็จ: " + ((e && e.message) || e));
  }
}

async function startLive() {
  const it = findItem(currentItemId);
  if (!it || it.sellerName !== myName || !db) return;
  const liveTitle = document
    .getElementById("liveTitleInput")
    .value.trim()
    .slice(0, 60);
  let rawStream;
  try {
    rawStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: liveFacingMode,
        width: { ideal: 480 },
        height: { ideal: 360 },
      },
      audio: true,
    });
  } catch (e) {
    alert("เปิดกล้อง/ไมค์ไม่สำเร็จ: " + ((e && e.message) || e));
    return;
  }
  const rawVideoEl = document.getElementById("liveRawVideoEl");
  rawVideoEl.srcObject = rawStream;
  await rawVideoEl.play().catch(() => {});
  // wait for the camera to actually report real dimensions before starting the filter loop —
  // capturing the canvas's stream while it's still at its zero-content default size (before any
  // frame has been drawn) can lock a mismatched/blank frame into the outgoing stream permanently
  if (!rawVideoEl.videoWidth) {
    await new Promise((resolve) => {
      const check = () => {
        if (rawVideoEl.videoWidth) resolve();
        else requestAnimationFrame(check);
      };
      check();
    });
  }
  currentLiveFilter = "normal";
  startLiveFilterLoop();
  await new Promise((r) => setTimeout(r, 100)); // let the draw loop actually paint the canvas at its real size at least once
  const canvasStream = document
    .getElementById("liveFilterCanvas")
    .captureStream(30);
  rawStream.getAudioTracks().forEach((t) => canvasStream.addTrack(t)); // real mic audio, carried straight through — only video goes through the filter canvas
  liveLocalStream = canvasStream;

  liveIsBroadcaster = true;
  liveItemId = it.id;
  showLiveConnecting();
  const video = document.getElementById("liveVideoEl");
  wireHideLiveConnectingOnFrame(video);
  video.srcObject = liveLocalStream;
  video.muted = true;
  video.style.transform = liveFacingMode === "user" ? "scaleX(-1)" : "none";
  video.play().catch(() => {});
  document.getElementById("liveUnmuteBtn").classList.add("hidden"); // broadcaster's own preview is intentionally muted (avoid echo)
  document.getElementById("liveSellerStartBox").classList.add("hidden");
  updateLiveDock(); // shows liveBox docked inline — we're on this exact item's own detail screen right now
  document.getElementById("liveFilterRow").classList.remove("hidden");
  renderLiveFilterRow();
  renderLiveInfoOverlay(Object.assign({}, it, { liveTitle })); // it.liveTitle isn't set on this local object until the Firestore write below lands and syncs back — render with the value we're about to save instead of waiting on that round-trip
  document.getElementById("liveControls").innerHTML = `
    <button class="btn btn-outline" style="flex:1;" onclick="switchLiveCamera()">🔄 สลับกล้อง</button>
    <button class="btn btn-outline" style="flex:1; color:var(--red); border-color:var(--red);" onclick="requestStopLive()">⏹ จบไลฟ์</button>`;
  renderLiveReactionRow();
  await db
    .doc("items/" + it.id)
    .update({
      isLive: true,
      liveStartedAt: Date.now(),
      likeCount: 0,
      liveTitle,
    })
    .catch(() => {});
  livePeerConnections = {};
  liveSignalsUnsub = db
    .collection("items/" + it.id + "/liveSignals")
    .onSnapshot((snap) => {
      snap.docChanges().forEach((change) => {
        const viewerId = change.doc.id;
        if (change.type === "removed") {
          if (livePeerConnections[viewerId]) {
            livePeerConnections[viewerId].pc.close();
            delete livePeerConnections[viewerId];
          }
          return;
        }
        handleViewerSignal(it.id, viewerId, change.doc.data());
      });
      document.getElementById("liveViewerCount").textContent = snap.size;
      db.doc("items/" + it.id)
        .update({ liveViewerCount: snap.size })
        .catch(() => {});
    });
  liveChatMessages = [];
  liveChatUnsub = db
    .collection("items/" + it.id + "/liveChat")
    .orderBy("at")
    .onSnapshot((snap) => {
      liveChatMessages = snap.docs.map((d) => d.data());
      renderLiveChat();
    });
}
async function handleViewerSignal(itemId, viewerId, data) {
  let entry = livePeerConnections[viewerId];
  if (!entry) {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    liveLocalStream
      .getTracks()
      .forEach((track) => pc.addTrack(track, liveLocalStream));
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        db.doc("items/" + itemId + "/liveSignals/" + viewerId)
          .update({
            sellerCandidates: firebase.firestore.FieldValue.arrayUnion(
              JSON.stringify(e.candidate),
            ),
          })
          .catch(() => {});
      }
    };
    entry = { pc, appliedViewerCandidates: 0, offered: false };
    livePeerConnections[viewerId] = entry;
  }
  const pc = entry.pc;
  if (!entry.offered && !data.offer) {
    entry.offered = true;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await db
      .doc("items/" + itemId + "/liveSignals/" + viewerId)
      .update({ offer: JSON.stringify(offer), status: "offered" });
  }
  if (data.answer && pc.signalingState === "have-local-offer") {
    await pc.setRemoteDescription(JSON.parse(data.answer));
  }
  const viewerCandidates = data.viewerCandidates || [];
  for (
    let i = entry.appliedViewerCandidates;
    i < viewerCandidates.length;
    i++
  ) {
    try {
      await pc.addIceCandidate(JSON.parse(viewerCandidates[i]));
    } catch (e) {}
  }
  entry.appliedViewerCandidates = viewerCandidates.length;
}
async function stopLive() {
  if (!liveItemId) return;
  const itemId = liveItemId;
  Object.values(livePeerConnections).forEach((entry) => entry.pc.close());
  livePeerConnections = {};
  if (liveSignalsUnsub) {
    liveSignalsUnsub();
    liveSignalsUnsub = null;
  }
  if (liveChatUnsub) {
    liveChatUnsub();
    liveChatUnsub = null;
  }
  liveChatMessages = [];
  stopLiveFilterLoop();
  const rawVideoEl = document.getElementById("liveRawVideoEl");
  if (rawVideoEl.srcObject) {
    rawVideoEl.srcObject.getTracks().forEach((t) => t.stop());
    rawVideoEl.srcObject = null;
  }
  if (liveLocalStream) {
    liveLocalStream.getTracks().forEach((t) => t.stop());
    liveLocalStream = null;
  }
  liveIsBroadcaster = false;
  liveItemId = null;
  resetLiveExpand();
  hideLiveConnecting();
  updateLiveDock();
  document.getElementById("liveFilterRow").classList.add("hidden");
  document.getElementById("liveVideoEl").style.transform = "none";
  if (db) {
    db.collection("items/" + itemId + "/liveSignals")
      .get()
      .then((snap) => Promise.all(snap.docs.map((d) => d.ref.delete())))
      .catch(() => {});
    db.collection("items/" + itemId + "/liveChat")
      .get()
      .then((snap) => Promise.all(snap.docs.map((d) => d.ref.delete())))
      .catch(() => {});
    db.doc("items/" + itemId)
      .update({ isLive: false })
      .catch(() => {});
  }
  renderDetail();
}
async function joinLive(itemId) {
  if (!db) return;
  liveItemId = itemId;
  liveViewerId = myName;
  liveViewerAppliedSellerCandidates = 0;
  showLiveConnecting();
  updateLiveDock(); // docks inline — join is only ever triggered from that item's own detail screen
  renderLiveInfoOverlay(findItem(itemId));
  const pc = new RTCPeerConnection(RTC_CONFIG);
  liveViewerPc = pc;
  pc.ontrack = (e) => {
    const video = document.getElementById("liveVideoEl");
    video.srcObject = e.streams[0];
    // stay muted so autoplay is never silently blocked by the browser (unmuting an
    // already-autoplaying video is a common real-world cause of a black/frozen frame) —
    // the viewer taps "แตะเพื่อเปิดเสียง" to unmute with an explicit gesture instead.
    video.muted = true;
    wireHideLiveConnectingOnFrame(video);
    video.play().catch(() => {});
    document.getElementById("liveUnmuteBtn").classList.remove("hidden");
  };
  pc.onicecandidate = (e) => {
    if (e.candidate && liveItemId && liveViewerId) {
      db.doc("items/" + liveItemId + "/liveSignals/" + liveViewerId)
        .update({
          viewerCandidates: firebase.firestore.FieldValue.arrayUnion(
            JSON.stringify(e.candidate),
          ),
        })
        .catch(() => {});
    }
  };
  document.getElementById("liveControls").innerHTML =
    `<button class="btn btn-outline" onclick="leaveLive()">ออกจากไลฟ์</button>`;
  renderLiveReactionRow();
  liveChatMessages = [];
  liveChatUnsub = db
    .collection("items/" + itemId + "/liveChat")
    .orderBy("at")
    .onSnapshot((snap) => {
      liveChatMessages = snap.docs.map((d) => d.data());
      renderLiveChat();
    });
  const ref = db.doc("items/" + itemId + "/liveSignals/" + liveViewerId);
  await ref.set({
    viewerName: myName,
    status: "requesting",
    offer: null,
    answer: null,
    viewerCandidates: [],
    sellerCandidates: [],
  });
  // a Firestore doc can legitimately fire this listener twice in quick succession for the same
  // offer (e.g. the seller appends an ICE candidate right after writing the offer — a different
  // field changed, but the whole snapshot, offer included, is redelivered) — without a guard set
  // BEFORE the first await, a second overlapping firing could call setRemoteDescription/
  // setLocalDescription a second time while the connection is already mid-negotiation, throwing
  // "Called in wrong state" and leaving the viewer's video stuck black. Mirrors the same
  // set-the-flag-before-awaiting pattern handleViewerSignal() already uses on the seller's side.
  let answeringOffer = false;
  liveOwnSignalUnsub = ref.onSnapshot(async (snap) => {
    if (!snap.exists) return;
    const data = snap.data();
    if (
      data.offer &&
      !answeringOffer &&
      pc.signalingState === "stable" &&
      !pc.currentRemoteDescription
    ) {
      answeringOffer = true;
      try {
        await pc.setRemoteDescription(JSON.parse(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await ref.update({
          answer: JSON.stringify(answer),
          status: "connected",
        });
      } catch (e) {
        console.error("live viewer answer negotiation failed", e);
      }
    }
    const sellerCandidates = data.sellerCandidates || [];
    for (
      let i = liveViewerAppliedSellerCandidates;
      i < sellerCandidates.length;
      i++
    ) {
      try {
        await pc.addIceCandidate(JSON.parse(sellerCandidates[i]));
      } catch (e) {}
    }
    liveViewerAppliedSellerCandidates = sellerCandidates.length;
  });
}
async function leaveLive() {
  if (liveOwnSignalUnsub) {
    liveOwnSignalUnsub();
    liveOwnSignalUnsub = null;
  }
  if (liveViewerPc) {
    liveViewerPc.close();
    liveViewerPc = null;
  }
  if (liveChatUnsub) {
    liveChatUnsub();
    liveChatUnsub = null;
  }
  liveChatMessages = [];
  const itemId = liveItemId,
    viewerId = liveViewerId;
  liveItemId = null;
  liveViewerId = null;
  resetLiveExpand();
  hideLiveConnecting();
  updateLiveDock();
  document.getElementById("liveUnmuteBtn").classList.add("hidden");
  if (itemId && viewerId && db) {
    await db
      .doc("items/" + itemId + "/liveSignals/" + viewerId)
      .delete()
      .catch(() => {});
  }
}
function unmuteLive() {
  const video = document.getElementById("liveVideoEl");
  video.muted = false;
  video.play().catch(() => {});
  document.getElementById("liveUnmuteBtn").classList.add("hidden");
}
let liveIsExpanded = false;
function toggleLiveExpand() {
  liveIsExpanded = !liveIsExpanded;
  document
    .getElementById("liveBox")
    .classList.toggle("live-expanded", liveIsExpanded);
  document.getElementById("liveExpandBtn").textContent = liveIsExpanded
    ? "⤡"
    : "⤢";
}
function resetLiveExpand() {
  liveIsExpanded = false;
  document.getElementById("liveBox").classList.remove("live-expanded");
  document.getElementById("liveExpandBtn").textContent = "⤢";
}
// deterministic per-name hue so each commenter gets a consistent little avatar color across
// the whole broadcast — purely cosmetic, not stored anywhere
function liveNameColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360} 62% 48%)`;
}
function renderLiveChat() {
  const el = document.getElementById("liveChatLog");
  if (!el) return;
  el.innerHTML = liveChatMessages
    .map((m) => {
      const color = liveNameColor(m.name || "");
      const initial = esc((m.name || "?").trim().charAt(0).toUpperCase());
      return `<div class="live-chat-row">
      <span class="live-chat-avatar" style="background:${color};">${initial}</span>
      <p class="live-chat-msg"><b style="color:${color};">${esc(m.name)}</b> ${esc(m.text)}</p>
    </div>`;
    })
    .join("");
  el.scrollTop = el.scrollHeight;
}
let sendingLiveChat = false; // guards against a message getting sent twice (double-tap, Enter + click racing)
async function sendLiveChat(quickText) {
  const input = document.getElementById("liveChatInput");
  const text = (typeof quickText === "string" ? quickText : input.value)
    .trim()
    .slice(0, 200);
  if (!text || !db || !liveItemId || sendingLiveChat) return;
  sendingLiveChat = true;
  if (typeof quickText !== "string") input.value = "";
  try {
    await db
      .collection("items/" + liveItemId + "/liveChat")
      .add({ name: myName, text, at: Date.now() });
  } catch (e) {}
  sendingLiveChat = false;
}
const LIVE_QUICK_REACTIONS = ["❤️", "😂", "👏", "🔥", "😮", "🎉"];
function renderLiveReactionRow() {
  const row = document.getElementById("liveReactionRow");
  if (!row) return;
  row.innerHTML = LIVE_QUICK_REACTIONS.map(
    (e) => `<button onclick="sendLiveChat('${e}')">${e}</button>`,
  ).join("");
}
const EMOJI_SET = [
  "😀",
  "😂",
  "😍",
  "😮",
  "😢",
  "😡",
  "👍",
  "👏",
  "🔥",
  "❤️",
  "🎉",
  "🙏",
  "😅",
  "🥳",
];
function toggleEmojiRow(rowId, targetInputId) {
  const row = document.getElementById(rowId);
  const wasHidden = row.classList.contains("hidden");
  document
    .querySelectorAll(".emoji-row")
    .forEach((r) => r.classList.add("hidden")); // only one open at a time
  if (wasHidden) {
    row.innerHTML = EMOJI_SET.map(
      (e) =>
        `<span onclick="insertEmoji('${targetInputId}','${e}')">${e}</span>`,
    ).join("");
    row.classList.remove("hidden");
  }
}
function insertEmoji(targetInputId, emoji) {
  const input = document.getElementById(targetInputId);
  if (!input) return;
  input.value += emoji;
  input.focus();
}
async function sendLiveLike() {
  if (!db || !liveItemId) return;
  spawnFloatingHeart();
  await db
    .doc("items/" + liveItemId)
    .update({ likeCount: firebase.firestore.FieldValue.increment(1) })
    .catch(() => {});
}
function spawnFloatingHeart() {
  const box = document.querySelector("#liveBox .live-video-wrap");
  if (!box) return;
  const heart = document.createElement("div");
  heart.className = "floating-heart";
  heart.textContent = "❤️";
  heart.style.left = 20 + Math.random() * 60 + "%";
  box.appendChild(heart);
  setTimeout(() => heart.remove(), 1600);
}
// hard-stop helper — unlike updateLiveDock()'s "just minimize" behavior for ordinary navigation,
// this actually ends the session. Used only where staying live genuinely can't make sense anymore:
// signing out of the account, or the tab/browser actually closing (see the pagehide listener below).
function cleanupLive() {
  if (liveIsBroadcaster) stopLive();
  else if (liveViewerPc) leaveLive();
}
function goLiveFor(itemId) {
  // used to call startLive() immediately, which skipped the start box entirely — including its
  // "หัวข้อไลฟ์" title field, so going live from this hub meant there was never a chance to type
  // one. Just open the item instead; the seller sees the start box (title field included) and
  // taps "เริ่มไลฟ์สด" themselves, same as starting live from the item detail screen directly.
  openItem(itemId);
}
function renderLiveHub() {
  const mineEl = document.getElementById("liveHubMine");
  const nowEl = document.getElementById("liveHubNow");
  const mine = allItems.filter(
    (i) => i.sellerName === myName && !itemIsClosed(i),
  );
  mineEl.innerHTML = mine.length
    ? mine
        .map((i) => {
          const isLiveNow = i.isLive;
          return `<div class="convo-row" ${isLiveNow ? "" : `onclick="goLiveFor('${i.id}')"`}>
      <div class="convo-thumb">${itemPhotos(i)[0] ? `<img src="${itemPhotos(i)[0]}">` : catInfo(i.cat).emoji}</div>
      <div class="convo-body"><p class="convo-title">${esc(i.name)}</p><p class="convo-sub">${fmtPrice(i.price)} · ${isLiveNow ? "กำลังไลฟ์อยู่" : "แตะเพื่อเริ่มไลฟ์"}</p></div>
      ${isLiveNow ? `<span class="badge live-badge" style="position:static;">🔴 LIVE</span>` : ""}
    </div>`;
        })
        .join("")
    : `<p style="color:var(--ink-soft); font-size:12.5px; text-align:center; margin:10px 0 20px;">คุณยังไม่มีสินค้าที่กำลังประมูลอยู่ — ลงขายก่อนถึงจะเริ่มไลฟ์ได้</p>`;

  const liveNow = allItems.filter((i) => i.isLive && !itemIsClosed(i));
  nowEl.innerHTML = liveNow.length
    ? liveNow
        .map(
          (i) => `
    <div class="convo-row" onclick="openItem('${i.id}')">
      <div class="convo-thumb">${itemPhotos(i)[0] ? `<img src="${itemPhotos(i)[0]}">` : catInfo(i.cat).emoji}</div>
      <div class="convo-body"><p class="convo-title">${esc(i.name)}</p><p class="convo-sub">${esc(i.sellerName)} · ${fmtPrice(i.price)}</p></div>
      <span class="badge live-badge" style="position:static;">🔴 LIVE</span>
    </div>`,
        )
        .join("")
    : `<p style="color:var(--ink-soft); font-size:12.5px; text-align:center; margin:10px 0;">ยังไม่มีร้านไหนไลฟ์อยู่ตอนนี้</p>`;
}

