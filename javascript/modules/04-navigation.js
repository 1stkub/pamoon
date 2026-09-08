/* ---------- navigation ---------- */
const ALL_SCREENS = [
  "feed",
  "cat",
  "sell",
  "mine",
  "rules",
  "accountsettings",
  "detail",
  "feedback",
  "messages",
  "chatfull",
  "shop",
  "shops",
  "shopreview",
  "livehub",
  "notifications",
  "admin",
];
function goTo(screen) {
  ALL_SCREENS.forEach((s) =>
    document
      .getElementById("screen-" + s)
      .classList.toggle("hidden", s !== screen),
  );
  [
    "nav-feed",
    "nav-cat",
    "nav-sell",
    "nav-live",
    "nav-chat",
    "nav-mine",
  ].forEach((n) => document.getElementById(n).classList.remove("active"));
  if (screen === "feed")
    document.getElementById("nav-feed").classList.add("active");
  if (screen === "cat")
    document.getElementById("nav-cat").classList.add("active");
  if (screen === "sell")
    document.getElementById("nav-sell").classList.add("active");
  if (screen === "livehub")
    document.getElementById("nav-live").classList.add("active");
  if (screen === "messages" || screen === "chatfull" || screen === "shopreview")
    document.getElementById("nav-chat").classList.add("active");
  if (
    screen === "mine" ||
    screen === "rules" ||
    screen === "feedback" ||
    screen === "accountsettings" ||
    screen === "admin"
  )
    document.getElementById("nav-mine").classList.add("active");
  if (screen !== "detail") {
    document.getElementById("bidbar").classList.add("hidden");
    // chatfull's own footer (the message input) sits where the nav bar would — hide the
    // nav bar there so it doesn't cover the input, same reasoning as the bid bar on detail.
    document
      .getElementById("navbar")
      .classList.toggle("hidden", screen === "chatfull");
    // chatfull is a sub-view reached FROM detail (via the chat teaser) — keep the item
    // remembered so the back button can return straight to it.
    if (screen !== "chatfull") currentItemId = null;
  }
  if (screen !== "chatfull") closeChat();
  if (screen !== "shop") closeShop();
  if (screen === "feed") renderFeed();
  if (screen === "mine") renderMine();
  if (screen === "cat") {
    renderRecoShops();
    renderRecoItems();
  }
  if (screen === "messages") renderMessages();
  if (screen === "shops") renderShopDirectory();
  if (screen === "livehub") renderLiveHub();
  if (screen === "notifications") renderNotifications();
  if (screen === "admin") renderAdminPanel();
  if (screen === "detail" && currentItemId) renderDetail();
  // leaving the item's own detail screen used to hard-stop any live session just to get its box
  // off screen (the "ไลฟ์จะดับไปเองเวลากดไปหน้าอื่น" bug) — now it just docks as a small floating
  // player instead, and only an explicit "จบไลฟ์"/"ออกจากไลฟ์" tap actually ends it.
  updateLiveDock();
}
function homeTab() {
  activeCat = null;
  activeSubcat = null;
  goTo("feed");
}

