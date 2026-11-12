export type Status = "active" | "paused" | "archived";
export type Category = "restaurant" | "cafe" | "bar" | "beauty" | "wellness" | "fitness" | "other";
export const CATEGORIES: Category[] = ["restaurant", "cafe", "bar", "beauty", "wellness", "fitness", "other"];

export type Member = {
  id: string;
  slug: string;
  name: string;
  age: number;
  city: string;
  instagram: string | null;
  followers: number | null;
  interests: string | null;
  phone: string | null;
  status: Status;
  notes: string | null;
  application_id: string | null;
  created_at: Date;
};

export type Venue = {
  id: string;
  slug: string;
  name: string;
  category: Category;
  description: string | null;
  description_kk: string | null;
  address: string | null;
  city: string;
  lat: number | null;
  lng: number | null;
  instagram: string | null;
  contact_name: string | null;
  phone: string | null;
  avg_check: number | null;
  photo_path: string | null;
  logo_path: string | null;
  host_token: string;
  status: Status;
  notes: string | null;
  application_id: string | null;
  is_listed: boolean;
  featured: boolean;
  open_time: string;
  close_time: string;
  slot_minutes: number;
  hold_minutes: number;
  created_at: Date;
};

export type Offer = {
  id: string;
  venue_id: string;
  title: string;
  member_reward: string;
  member_reward_value: number | null;
  guest_perk: string | null;
  guest_perk_kk: string | null;
  terms: string | null;
  active: boolean;
};

export type TrackingLink = {
  id: string;
  member_id: string;
  venue_id: string;
  offer_id: string | null;
  code_phrase: string | null;
  active: boolean;
  created_at: Date;
};

export type BookingStatus = "new" | "arrived" | "no_show" | "cancelled";

export type GuestBooking = {
  id: string;
  tracking_link_id: string;
  guest_name: string;
  phone: string;
  booking_date: string;
  booking_time: string;
  party_size: number;
  comment: string | null;
  status: BookingStatus;
  created_at: Date;
};

export type Application = {
  id: string;
  kind: "member" | "partner";
  status: "new" | "approved" | "rejected";
  name: string | null;
  age: number | null;
  city: string | null;
  instagram: string | null;
  interests: string | null;
  venue_name: string | null;
  category: Category | null;
  contact_name: string | null;
  phone: string | null;
  avg_check: number | null;
  lang: string | null;
  review_note: string | null;
  reviewed_at: Date | null;
  created_at: Date;
};

export type PairStats = {
  tracking_link_id: string;
  active: boolean;
  member_id: string;
  member_name: string;
  member_slug: string;
  member_instagram: string | null;
  venue_id: string;
  venue_name: string;
  venue_slug: string;
  member_visits: number;
  views: number;
  clicks: number;
  unique_clicks: number;
  bookings: number;
  guests: number;
  guests_booking: number;
  guests_phrase: number;
  revenue: number;
  guests_per_visit: number | null;
  view_to_guest_pct: number | null;
  created_at: Date;
};

/** Result shape every form action returns to useActionState. */
export type FormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  message?: string;
  /** Echo of submitted values, so a form keeps them after a validation error. */
  values?: Record<string, string>;
};
