export const STAGES = [
  'Lead',
  'Contacted',
  'Inspection scheduled',
  'Estimate sent',
  'Negotiation',
  'Contract signed',
  'Materials ordered',
  'Scheduled',
  'In production',
  'Completed',
  'Invoiced',
  'Paid',
] as const;
export type Stage = (typeof STAGES)[number];

export const SOURCES = [
  'Referral',
  'Google',
  'Facebook',
  'Website',
  'Yard sign',
  'Door knock',
  'Insurance',
  'Repeat customer',
  'Other',
];

export const OPEN_LEAD_STAGES: Stage[] = ['Lead', 'Contacted', 'Inspection scheduled', 'Estimate sent', 'Negotiation'];
export const SOLD_NOT_INVOICED_STAGES: Stage[] = [
  'Contract signed',
  'Materials ordered',
  'Scheduled',
  'In production',
  'Completed',
];

export interface MetricJob {
  stage: string;
  value: number | string | null;
}

export interface Metrics {
  openLeads: { count: number; value: number };
  soldNotInvoiced: { count: number; value: number };
  invoiced: { count: number; value: number };
  paid: { count: number; value: number };
}

export function computeMetrics(jobs: MetricJob[]): Metrics {
  const m: Metrics = {
    openLeads: { count: 0, value: 0 },
    soldNotInvoiced: { count: 0, value: 0 },
    invoiced: { count: 0, value: 0 },
    paid: { count: 0, value: 0 },
  };
  for (const j of jobs) {
    const v = Number(j.value) || 0;
    const s = j.stage as Stage;
    const bucket = OPEN_LEAD_STAGES.includes(s)
      ? m.openLeads
      : SOLD_NOT_INVOICED_STAGES.includes(s)
        ? m.soldNotInvoiced
        : s === 'Invoiced'
          ? m.invoiced
          : s === 'Paid'
            ? m.paid
            : null;
    if (bucket) {
      bucket.count++;
      bucket.value += v;
    }
  }
  return m;
}

export const money = (n: number) =>
  (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
export const money0 = (n: number) =>
  (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
