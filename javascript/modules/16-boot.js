/* ---------- tick ---------- */
function tick() {
  if (!document.getElementById("screen-feed").classList.contains("hidden"))
    renderFeed();
  if (!document.getElementById("screen-detail").classList.contains("hidden"))
    renderDetail();
  if (!document.getElementById("screen-shop").classList.contains("hidden"))
    renderShopItems();
}

/* ---------- boot ---------- */
// best-effort: if the tab/browser is actually closing while this device is mid-broadcast, try to
// mark isLive:false so the listing doesn't sit stuck "live" forever with nobody there. Not
// guaranteed to finish (the page can vanish mid-request) — it's a safety net, not a real fix for
// the general "closed without stopping" case, but strictly better than nothing.
window.addEventListener("pagehide", () => {
  if (liveIsBroadcaster && liveItemId && db) {
    db.doc("items/" + liveItemId)
      .update({ isLive: false })
      .catch(() => {});
  }
});
initDb(); // connect to Firestore right away — the login screen needs it to check phone numbers
{
  const savedPhone = localStorage.getItem("pramoon_phone");
  const savedRole = localStorage.getItem("pramoon_role");
  // returning sessions skip doLogin() entirely (myName comes straight from localStorage above),
  // so an account saved before "/" etc. was blocked from usernames needs fixing here too —
  // otherwise it stays broken forever for that device even after the login-time fix ships.
  const rawSavedName = localStorage.getItem("pramoon_myname") || "";
  if (myName && myName !== rawSavedName) {
    localStorage.setItem("pramoon_myname", myName);
    if (db && savedPhone)
      db.doc("users/" + savedPhone)
        .update({ username: myName })
        .catch(() => {});
  }
  if (myName && savedPhone && savedRole) {
    document.getElementById("nameGate").classList.add("hidden");
    afterName(savedRole);
  } else if (myName && savedPhone) {
    // logged in before role selection existed — ask once, skip logging in again
    document.getElementById("loginStep").classList.add("hidden");
    document.getElementById("roleStep").classList.remove("hidden");
  } else {
    // no phone on file yet (new device, or a pre-login-system account) — log in fresh
    document.getElementById("nameGate").classList.remove("hidden");
  }
  // defense-in-depth: a returning session skips doLogin() (and its ban check) entirely, so a
  // phone banned after this device last logged in would otherwise keep working forever here —
  // re-check once at boot and force back to the login screen if it's since been banned.
  if (myName && savedPhone) {
    checkBanned(savedPhone).then((banned) => {
      if (!banned) return;
      myBanned = true;
      localStorage.removeItem("pramoon_myname");
      localStorage.removeItem("pramoon_phone");
      localStorage.removeItem("pramoon_role");
      alert(
        "บัญชีนี้ถูกระงับการใช้งาน — หากคิดว่าเป็นความผิดพลาด ติดต่อผู้ดูแลระบบ",
      );
      location.reload();
    });
  }
}
