export type Category = 'food' | 'hygiene' | 'cleaning' | 'drinks';
export type StockLevel = 'sufficient' | 'low' | 'empty';
export interface HouseholdItem {
  id: string; name: string; brand: string; quantity: number; unit: string;
  category: Category; location: string; level: StockLevel; expiry: string | null;
  monthlyUsage: number | null; updatedAt: string;
}
export interface ShoppingItem {
  id: string; name: string; quantity: number; unit: string; checked: boolean;
  priceMillimes: number | null; retailer?: string;
}
export interface Preferences { people: number; budgetMillimes: number; diet: string[]; maxStores: number }
export interface HouseholdSnapshot { items: HouseholdItem[]; shopping: ShoppingItem[]; preferences: Preferences }
export interface ConsumptionObservation { itemId: string; quantity: number; at: string }
export interface ConsumptionForecast { itemId: string; basis: 'declared' | 'observed'; monthly: number; annual: number; confidence: 'provisional'; samples: number; spanDays: number }
export interface HouseholdEvent { id: string; action: string; label: string; createdAt: string; undone?: boolean; before?: HouseholdSnapshot & { importFingerprints?: string[]; consumption?: ConsumptionObservation[] } }
export interface HouseholdState extends HouseholdSnapshot {
  importFingerprints?: string[];
  consumption?: ConsumptionObservation[];
  events: HouseholdEvent[];
  requests: {id: string; fingerprint: string}[];
}
export const CAPABILITIES = {
  inventory: true, shopping: true, forecasts: true, export: true,
  photoRecognition: false, liveRetailerPrices: false, glovoOrdering: false,
  grocyConnected: false,
};
export type HouseholdResponse = HouseholdSnapshot & { events: Omit<HouseholdEvent, 'before'>[]; forecasts: ConsumptionForecast[]; capabilities: typeof CAPABILITIES; version: number };
export function emptyState(): HouseholdState {
  return {items: [], shopping: [], importFingerprints: [], consumption: [], events: [], requests: [], preferences: {people: 2, budgetMillimes: 200000, diet: [], maxStores: 2}};
}
