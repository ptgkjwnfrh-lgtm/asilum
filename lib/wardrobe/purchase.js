// Client-safe ownership rule: an owned anchor participates in styling but is
// never translated back into purchase intent by a bulk bag action.
export function purchasableLookItems(items) {
  return Array.isArray(items) ? items.filter((item) => item && !item.owned) : [];
}
