export type CustomerChoice = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  visits?: number;
  lastVisit?: string | null;
  loyalty?: number;
  notes?: string | null;
  allergies?: string | null;
};
