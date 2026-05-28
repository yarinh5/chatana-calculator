export type CategoryKey =
  | "venue"
  | "photo"
  | "music"
  | "flowers"
  | "attire"
  | "invites"
  | "rings"
  | "transport"
  | "attractions"
  | "misc";

export const CATEGORIES: Record<CategoryKey, { label: string; emoji: string; tint: string }> = {
  venue: { label: "אולם ואוכל", emoji: "🏛️", tint: "bg-cat-venue" },
  photo: { label: "צילום ווידאו", emoji: "📸", tint: "bg-cat-photo" },
  music: { label: "מוזיקה ובידור", emoji: "🎵", tint: "bg-cat-music" },
  flowers: { label: "פרחים ועיצוב", emoji: "💐", tint: "bg-cat-flowers" },
  attire: { label: "לבוש ואיפור", emoji: "👗", tint: "bg-cat-attire" },
  invites: { label: "הזמנות וסידורים", emoji: "💌", tint: "bg-cat-invites" },
  rings: { label: "טבעות ותכשיטים", emoji: "💍", tint: "bg-cat-rings" },
  transport: { label: "הסעות ולוגיסטיקה", emoji: "🚗", tint: "bg-cat-transport" },
  attractions: { label: "אטרקציות ומתנות", emoji: "🎁", tint: "bg-cat-attractions" },
  misc: { label: "שונות", emoji: "📋", tint: "bg-cat-misc" },
};

export type MarketItem = {
  name: string;
  price: number;
  category: CategoryKey;
  /** "guest" => multiplied by attending guests + reserve, "invited" => by total invited, "tables" => prompt for tables */
  perUnit?: "guest" | "invited" | "tables";
};

export const MARKET_ITEMS: MarketItem[] = [
  // אולם ואוכל
  { name: "אולם / גן אירועים — מנה לאורח", price: 450, category: "venue", perUnit: "guest" },
  { name: "מנת ספקים (צלם, DJ, מפיק)", price: 80, category: "venue", perUnit: "guest" },
  { name: "עוגת חתונה מעוצבת", price: 2500, category: "venue" },
  { name: "ממתקייה / קנדי בר", price: 1500, category: "venue" },
  { name: "דוכן שניצל / לחמניות לסוף הערב", price: 2000, category: "venue" },
  // צילום
  { name: "צלם סטילס (יחיד)", price: 8000, category: "photo" },
  { name: "צלם סטילס + עוזר", price: 12000, category: "photo" },
  { name: "צלם וידאו — קליפ + סרט מלא", price: 7000, category: "photo" },
  { name: "רחפן (drone)", price: 1500, category: "photo" },
  { name: "צילומי חוץ (pre-wedding)", price: 3000, category: "photo" },
  { name: "אלבום מעוצב + הגדלות", price: 2500, category: "photo" },
  // מוזיקה
  { name: "DJ מקצועי", price: 7000, category: "music" },
  { name: "להקה חיה (4 נגנים)", price: 15000, category: "music" },
  { name: "MC / דרבן", price: 3500, category: "music" },
  { name: "מוזיקה לחופה (נגן יחיד)", price: 2000, category: "music" },
  { name: "מערכת הגברה ותאורה", price: 5000, category: "music" },
  // פרחים
  { name: "זר כלה (פרחים חיים)", price: 1200, category: "flowers" },
  { name: "קישוט חופה + פרחים", price: 5000, category: "flowers" },
  { name: "מרכזיות שולחנות", price: 350, category: "flowers", perUnit: "tables" },
  { name: "עיצוב כניסה ורדי אורחים", price: 2500, category: "flowers" },
  { name: "פרחי שושבינות + פרחי חזה", price: 800, category: "flowers" },
  { name: "שחרור פרפרים / יונים", price: 1500, category: "flowers" },
  { name: "תאורת אווירה מיוחדת", price: 4000, category: "flowers" },
  // לבוש
  { name: "שמלת כלה (ממוצע)", price: 12000, category: "attire" },
  { name: "שמלה שנייה לריקודים", price: 3500, category: "attire" },
  { name: "חליפת חתן", price: 3000, category: "attire" },
  { name: "איפור כלה (יום החתונה)", price: 1200, category: "attire" },
  { name: "תסרוקת כלה", price: 800, category: "attire" },
  { name: "איפור לניסיון", price: 500, category: "attire" },
  { name: "מניקור / פדיקור כלה", price: 400, category: "attire" },
  { name: "שמלות שושבינות (ממוצע לשמלה)", price: 600, category: "attire" },
  { name: "נעלי כלה", price: 800, category: "attire" },
  // טבעות
  { name: "טבעת נישואין לכלה (זהב 14K)", price: 3500, category: "rings" },
  { name: "טבעת נישואין לחתן (זהב 14K)", price: 2500, category: "rings" },
  { name: "שרשרת / עגילי כלה ליום החתונה", price: 1500, category: "rings" },
  // הזמנות
  { name: "הזמנות מודפסות (לכרטיס)", price: 8, category: "invites", perUnit: "invited" },
  { name: "עיצוב הזמנה", price: 800, category: "invites" },
  { name: "משלוח הזמנות (דואר / מסירה)", price: 500, category: "invites" },
  { name: "הזמנה דיגיטלית (אתר חתונה)", price: 400, category: "invites" },
  { name: "מגנטים לאורחים (יחידה)", price: 15, category: "invites", perUnit: "invited" },
  { name: "תוכניות ישיבה (seating chart)", price: 600, category: "invites" },
  { name: "ריחנים / מזכרות לאורחים", price: 20, category: "invites", perUnit: "invited" },
  // הסעות
  { name: "הסעות אורחים (אוטובוס הלוך-חזור)", price: 5000, category: "transport" },
  { name: "לימוזינה / רכב מעוצב לחתן וכלה", price: 2500, category: "transport" },
  { name: "חניה מאורגנת", price: 1500, category: "transport" },
  // אטרקציות
  { name: "עמדת מגנטים (magnet station)", price: 1800, category: "attractions" },
  { name: "עמדת TikTok / סלפי", price: 1200, category: "attractions" },
  { name: "כדור אש / ריקוד להבות", price: 2500, category: "attractions" },
  { name: "ספר ברכות מעוצב", price: 400, category: "attractions" },
  { name: "ריקוד הפתעה (flash mob)", price: 3000, category: "attractions" },
  { name: "קוסם / ג'אגלר", price: 2000, category: "attractions" },
  { name: "קופסת מנות לאורחים (doggy bag)", price: 20, category: "attractions", perUnit: "invited" },
  // שונות
  { name: "מפיק אירוע / מנהל יום", price: 4000, category: "misc" },
  { name: "רב מסדר קידושין", price: 2000, category: "misc" },
  { name: "כיבוד לחופה (גפן ומזונות)", price: 500, category: "misc" },
  { name: "חזן / שיר לחופה", price: 1500, category: "misc" },
  { name: "כיבוד אצל הכלה בהתארגנות", price: 800, category: "misc" },
  { name: "מכשיר ניגון למוזיקה ברקע (cocktail)", price: 1200, category: "misc" },
  { name: "ביטוח אירוע", price: 600, category: "misc" },
  { name: "טיפ לצוות האולם", price: 2000, category: "misc" },
];

export function formatILS(n: number) {
  return `${Math.round(n).toLocaleString("he-IL")} ₪`;
}
