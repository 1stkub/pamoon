/* ---------- static data ---------- */
const CATS = [
  {
    id: "card",
    name: "การ์ดสะสม",
    desc: "โปเกมอน, กันดั้ม, กีฬา",
    fee: 7,
    emoji: "🎴",
  },
  {
    id: "watch",
    name: "นาฬิกา",
    desc: "มือสอง, วินเทจ, แบรนด์",
    fee: 3.5,
    emoji: "⌚",
  },
  {
    id: "shoe",
    name: "รองเท้า-แฟชั่น",
    desc: "สนีกเกอร์, เสื้อผ้า",
    fee: 7,
    emoji: "👟",
  },
  {
    id: "amulet",
    name: "พระเครื่อง-ของสะสม",
    desc: "พระเครื่อง, ของโบราณ",
    fee: 7,
    emoji: "🪬",
  },
  {
    id: "phone",
    name: "โทรศัพท์",
    desc: "มือถือ, แท็บเล็ต, อุปกรณ์เสริม",
    fee: 7,
    emoji: "📱",
  },
  {
    id: "elec",
    name: "อิเล็กทรอนิกส์",
    desc: "กล้อง, คอมพิวเตอร์, เกม",
    fee: 7,
    emoji: "📷",
  },
  {
    id: "vehicle",
    name: "ยานพาหนะ",
    desc: "รถ, มอเตอร์ไซค์",
    fee: 3.5,
    emoji: "🏍️",
  },
  {
    id: "toy",
    name: "ของเล่น-ฟิกเกอร์",
    desc: "ฟิกเกอร์, โมเดล",
    fee: 7,
    emoji: "🧸",
  },
  {
    id: "decor",
    name: "ของประดับ",
    desc: "เครื่องประดับ, ของแต่งบ้าน, จิวเวลรี่",
    fee: 7,
    emoji: "💍",
  },
  {
    id: "realestate",
    name: "อสังหาริมทรัพย์",
    desc: "บ้าน, คอนโด, ที่ดิน",
    fee: 3.5,
    emoji: "🏠",
  },
  {
    id: "general",
    name: "ของทั่วไป",
    desc: "เฟอร์นิเจอร์, เครื่องใช้",
    fee: 7,
    emoji: "📦",
  },
  {
    id: "gameid",
    name: "ไอดีเกม",
    desc: "บัญชีเกม, ไอดี, ไอเทมในเกม",
    fee: 7,
    emoji: "🎮",
  },
];
// optional finer-grained tag within a category (e.g. การ์ดสะสม → โปเกมอน/นารูโตะ) — only
// defined for categories where a brand/franchise/type breakdown genuinely helps browsing;
// every list ends with "อื่นๆ" so nothing is ever a hard constraint
const SUBCATS = {
  card: [
    "โปเกมอน",
    "วันพีช",
    "นารูโตะ",
    "ดราก้อนบอล",
    "การ์ดกีฬา",
    "ยูกิ",
    "อื่นๆ",
  ],
  phone: ["iPhone", "Samsung", "Xiaomi", "Oppo", "Vivo", "อื่นๆ"],
  vehicle: [
    "Honda",
    "Yamaha",
    "Toyota",
    "Isuzu",
    "Kawasaki",
    "Mitsubishi",
    "อื่นๆ",
  ],
  watch: ["Rolex", "Seiko", "Casio", "Omega", "Citizen", "อื่นๆ"],
  shoe: ["Nike", "Adidas", "Converse", "New Balance", "Vans", "อื่นๆ"],
};
// ไอดีเกมมีเป็นร้อยเป็นพันเกม ทำลิสต์ตายตัวไม่ไหว — ให้ผู้ลงพิมพ์ชื่อเกมเองแทน แล้วระบบรวบรวมชื่อ
// ที่เคยมีคนพิมพ์จริงไว้เป็นตัวกรองแบบไดนามิกในหน้าฟีด (ดู getDynamicSubcats) เพื่อให้คนหาไอดีเกม
// เดียวกันเจอกัน โดยไม่ต้องมานั่งกำหนดชื่อเกมไว้ล่วงหน้าเอง
const FREE_TEXT_SUBCAT_CATS = ["gameid"];
function getDynamicSubcats(catId) {
  const counts = {};
  allItems.forEach((i) => {
    if (i.cat === catId && i.subcat)
      counts[i.subcat] = (counts[i.subcat] || 0) + 1;
  });
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
}
const DURATIONS = [
  { label: "2 นาที (ทดสอบ)", ms: 1000 * 60 * 2 },
  { label: "10 นาที", ms: 1000 * 60 * 10 },
  { label: "1 ชั่วโมง", ms: 1000 * 60 * 60 },
  { label: "6 ชั่วโมง", ms: 1000 * 60 * 60 * 6 },
  { label: "1 วัน", ms: 1000 * 60 * 60 * 24 },
  { label: "3 วัน", ms: 1000 * 60 * 60 * 24 * 3 },
];
function catInfo(id) {
  return CATS.find((c) => c.id === id) || CATS[CATS.length - 1];
}
function esc(s) {
  return String(s == null ? "" : s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function fmtPrice(n) {
  return Number(n || 0).toLocaleString("th-TH") + " ฿";
}
function fmtTime(ms) {
  if (ms <= 0) return "00:00";
  const s = Math.floor(ms / 1000),
    d = Math.floor(s / 86400),
    h = Math.floor((s % 86400) / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = s % 60;
  if (d > 0)
    return (
      d + "ว " + String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0")
    );
  if (h > 0)
    return (
      String(h).padStart(2, "0") +
      ":" +
      String(m).padStart(2, "0") +
      ":" +
      String(sec).padStart(2, "0")
    );
  return String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
}
function fmtChatTime(ts) {
  const d = new Date(ts),
    now = new Date();
  const time = d.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (d.toDateString() === now.toDateString()) return time;
  return (
    d.toLocaleDateString("th-TH", { day: "numeric", month: "short" }) +
    " " +
    time
  );
}
// เพดานราคาบิด — ห้ามบิดเกิน 100 เท่าของ "ราคาเริ่มต้น" ที่ร้านตั้งไว้ตอนลงประกาศ (คงที่ตลอดทั้งประมูล
// ไม่ใช่ 100 เท่าของราคาล่าสุด ซึ่งจะขยับเพดานขึ้นเรื่อยๆ ตามการบิดจนไม่มีความหมาย) กันทั้งบิดเล่น/แกล้ง
// และเคสพิมพ์ผิดเลขศูนย์เกิน (เผลอบิด 100,000 ทั้งที่ตั้งใจจะพิมพ์ 10,000)
const MAX_BID_MULTIPLIER = 100;
function bidDenomination(price) {
  if (price < 500) return 50;
  if (price < 2000) return 100;
  if (price < 10000) return 500;
  return 1000;
}
function nextValidBid(price) {
  const d = bidDenomination(price);
  return (Math.floor(price / d) + 1) * d;
}
function suggestIncrement(price) {
  return bidDenomination(price);
}

