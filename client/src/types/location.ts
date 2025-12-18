export interface LocationResult {
  id: string;
  label: string;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  lat: number;
  lng: number;
}
