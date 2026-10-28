import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const configError = !url || !key ? 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY (see README).' : '';

export const supabase = createClient(url || 'http://localhost', key || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true },
});

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  billing_address: string;
  source: string;
  notes: string;
}

export interface Job {
  id: string;
  customer_id: string | null;
  address: string;
  stage: string;
  value: number;
  follow_up: string | null;
  insurance_claim: boolean;
  claim_number: string;
  notes: string;
  measurements: Record<string, unknown>;
  measurement_source: string;
  created_at: string;
  updated_at: string;
  customers?: Customer | null;
}

export interface EstimateRow {
  id: string;
  job_id: string;
  revision: number;
  status: 'draft' | 'approved' | 'superseded';
  data: unknown;
  material_total: number;
  labor_total: number;
  target_gp: number | null;
  price: number;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface OrderRow {
  id: string;
  job_id: string;
  kind: 'work_order' | 'material_order';
  status: 'draft' | 'sent';
  body: string;
  updated_at: string;
}

export interface JobEvent {
  id: string;
  job_id: string;
  event_type: string;
  detail: string;
  created_at: string;
}

export async function logEvent(job_id: string, event_type: string, detail: string) {
  const { error } = await supabase.from('job_events').insert({ job_id, event_type, detail });
  if (error) console.error('event log failed', error);
}
