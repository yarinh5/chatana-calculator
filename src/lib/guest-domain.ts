export const GUEST_AGE_GROUPS = [
  { value: "adult", label: "מבוגר" },
  { value: "child", label: "ילד" },
  { value: "infant", label: "תינוק" },
] as const;

export const GUEST_MEAL_PREFERENCES = [
  { value: "regular", label: "רגילה" },
  { value: "vegetarian", label: "צמחונית" },
  { value: "vegan", label: "טבעונית" },
  { value: "gluten_free", label: "ללא גלוטן" },
  { value: "glatt", label: "גלאט" },
  { value: "other", label: "אחר" },
] as const;

export type GuestAgeGroup = (typeof GUEST_AGE_GROUPS)[number]["value"];
export type GuestMealPreference = (typeof GUEST_MEAL_PREFERENCES)[number]["value"];

export function labelForGuestAgeGroup(value: string | null | undefined) {
  return GUEST_AGE_GROUPS.find((option) => option.value === value)?.label ?? "";
}

export function labelForGuestMealPreference(value: string | null | undefined) {
  return GUEST_MEAL_PREFERENCES.find((option) => option.value === value)?.label ?? "";
}
