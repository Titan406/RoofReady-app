// Order templates (work order / material order). Plain text + {{placeholders}}; deterministic, no AI.
export type OrderKind = 'work_order' | 'material_order';

export interface CompanyInfo { name: string; phone: string; email: string; address: string; license: string }

export interface OrderTemplate {
  company: CompanyInfo;
  title: string;
  intro: string;
  notes: string;
  signature: string;
  footer: string;
  showPrices: boolean;
}

export const PLACEHOLDERS: { key: string; help: string }[] = [
  { key: 'job_address', help: 'Job address' },
  { key: 'customer_name', help: 'Customer name' },
  { key: 'customer_phone', help: 'Customer phone' },
  { key: 'date', help: "Today's date" },
  { key: 'job_id_short', help: 'Short job number (first 8 characters of the job ID)' },
  { key: 'delivery_date', help: 'Delivery date entered on the order (blank line if not set)' },
  { key: 'company_name', help: 'Company name from the header block' },
];

const blankCompany = (): CompanyInfo => ({ name: 'Titan Roofing & Exteriors', phone: '', email: '', address: '', license: '' });

export function defaultTemplate(kind: OrderKind): OrderTemplate {
  if (kind === 'work_order')
    return {
      company: blankCompany(),
      title: 'WORK ORDER',
      intro: 'Job: {{job_address}}\nCustomer: {{customer_name}} {{customer_phone}}\nJob #: {{job_id_short}} · Date: {{date}}',
      notes: 'NOTES\n- ',
      signature: 'Crew lead: ____________________   Date: __________\nCompleted / inspected by: ____________________',
      footer: '',
      showPrices: false,
    };
  return {
    company: blankCompany(),
    title: 'MATERIAL ORDER',
    intro: 'Supplier: \nDeliver to: {{job_address}}\nDelivery date: {{delivery_date}}\nRoof load / ground drop: \nJob #: {{job_id_short}} · Ordered: {{date}}',
    notes: 'NOTES\n- ',
    signature: 'Ordered by: ____________________   {{company_name}}',
    footer: 'Please confirm quantities, price and delivery time before delivery.',
    showPrices: false,
  };
}

/** Merge a saved (possibly partial / older) template over the defaults. */
export function normalizeTemplate(kind: OrderKind, raw: unknown): OrderTemplate {
  const d = defaultTemplate(kind);
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<OrderTemplate>;
  const str = (v: unknown, fb: string) => (typeof v === 'string' ? v : fb);
  const c = (r.company && typeof r.company === 'object' ? r.company : {}) as Partial<CompanyInfo>;
  return {
    company: {
      name: str(c.name, d.company.name),
      phone: str(c.phone, ''),
      email: str(c.email, ''),
      address: str(c.address, ''),
      license: str(c.license, ''),
    },
    title: str(r.title, d.title),
    intro: str(r.intro, d.intro),
    notes: str(r.notes, d.notes),
    signature: str(r.signature, d.signature),
    footer: str(r.footer, d.footer),
    showPrices: typeof r.showPrices === 'boolean' ? r.showPrices : d.showPrices,
  };
}

export interface FillValues {
  job_address?: string;
  customer_name?: string;
  customer_phone?: string;
  date?: string;
  job_id_short?: string;
  delivery_date?: string;
  company_name?: string;
}

const BLANK = '__________';

/** Replace {{name}} placeholders. Unknown placeholders are left as typed so you can see them. */
export function fillPlaceholders(text: string, v: FillValues): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (whole, k: string) => {
    const key = k.toLowerCase() as keyof FillValues;
    if (!PLACEHOLDERS.some((p) => p.key === key)) return whole;
    const val = (v[key] ?? '').trim();
    if (key === 'delivery_date') return val || BLANK;
    return val;
  });
}

export const shortId = (id?: string) => (id ? id.replace(/-/g, '').slice(0, 8).toUpperCase() : '');

export function formatDate(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d.length === 10 ? d + 'T12:00:00' : d) : d;
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Company header lines: only fields that are filled in (nothing invented). */
export function companyLines(c: CompanyInfo): string[] {
  const out: string[] = [];
  if (c.name.trim()) out.push(c.name.trim().toUpperCase());
  if (c.address.trim()) out.push(c.address.trim());
  const contact = [c.phone.trim(), c.email.trim()].filter(Boolean).join(' · ');
  if (contact) out.push(contact);
  if (c.license.trim()) out.push(`License #: ${c.license.trim()}`);
  return out;
}

export const KIND_TITLES: Record<OrderKind, string> = { work_order: 'Work order', material_order: 'Material order' };
