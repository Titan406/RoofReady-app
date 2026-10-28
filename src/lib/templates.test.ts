import { describe, expect, it } from 'vitest';
import { companyLines, defaultTemplate, fillPlaceholders, normalizeTemplate, shortId } from './templates';
import { materialOrderText, workOrderText, mailtoLink } from './orders';
import { newEstimateData, normalizeMeasurements } from './estimate';

const wedgewood = normalizeMeasurements({ area: 2619, waste: 13, steepShare: 89, starter: 355, ridgeCap: 115, leakBarrierLF: 580, leakBarrierWidth: 3, stepFlashing: 98, flashing: 55, valley: 41, dripEdge: 355 });
const est = () => newEstimateData(wedgewood, 'GAF QuickMeasure');
const ctx = { address: '1 Test St, Kalispell MT', customerName: 'Pat Doe', customerPhone: '406-555-0100', jobId: 'abcd1234-ef56-7890', date: '2026-10-27', deliveryDate: '2026-11-03' };

describe('fillPlaceholders', () => {
  const v = { job_address: '1 Test St', customer_name: 'Pat', date: 'Oct 27, 2026', job_id_short: 'ABCD1234', delivery_date: '', company_name: 'Titan' };
  it('fills known placeholders, tolerates spaces and case', () => {
    expect(fillPlaceholders('{{job_address}} / {{ Customer_Name }} / {{date}} / #{{job_id_short}} / {{company_name}}', v))
      .toBe('1 Test St / Pat / Oct 27, 2026 / #ABCD1234 / Titan');
  });
  it('empty delivery date becomes a blank line to fill in, never a made-up date', () => {
    expect(fillPlaceholders('Deliver {{delivery_date}}', v)).toBe('Deliver __________');
  });
  it('unknown placeholders are left visible', () => {
    expect(fillPlaceholders('Hi {{foo}}', v)).toBe('Hi {{foo}}');
  });
  it('missing values become empty', () => {
    expect(fillPlaceholders('[{{customer_phone}}]', v)).toBe('[]');
  });
  it('shortId', () => expect(shortId('abcd1234-ef56')).toBe('ABCD1234'));
});

describe('templates', () => {
  it('company header contains only filled fields (no invented phone / license)', () => {
    const t = defaultTemplate('material_order');
    expect(companyLines(t.company)).toEqual(['TITAN ROOFING & EXTERIORS']);
    expect(companyLines({ ...t.company, phone: '406-555-0199', license: 'MT-123' })).toEqual(['TITAN ROOFING & EXTERIORS', '406-555-0199', 'License #: MT-123']);
  });
  it('normalizeTemplate merges partial saved content over defaults', () => {
    const t = normalizeTemplate('work_order', { intro: 'Hello {{customer_name}}', company: { phone: '1' }, showPrices: true });
    expect(t.intro).toBe('Hello {{customer_name}}');
    expect(t.company).toEqual({ name: 'Titan Roofing & Exteriors', phone: '1', email: '', address: '', license: '' });
    expect(t.showPrices).toBe(true);
    expect(t.title).toBe('WORK ORDER');
    expect(normalizeTemplate('work_order', null)).toEqual(defaultTemplate('work_order'));
  });
});

describe('order generation from template', () => {
  it('material order: header, filled intro, items, notes, signature, footer in order', () => {
    const tpl = { ...defaultTemplate('material_order'), intro: 'Deliver to {{job_address}} on {{delivery_date}} for job {{job_id_short}}', footer: 'Thanks — {{company_name}}' };
    const mo = materialOrderText(est(), ctx, false, tpl);
    const lines = mo.split('\n');
    expect(lines[0]).toBe('TITAN ROOFING & EXTERIORS');
    expect(mo).toContain('MATERIAL ORDER\nDeliver to 1 Test St, Kalispell MT on Nov 3, 2026 for job ABCD1234');
    expect(mo).toContain('90 bundle — Owens Corning Duration');
    expect(mo.indexOf('ITEMS')).toBeLessThan(mo.indexOf('NOTES'));
    expect(mo.indexOf('NOTES')).toBeLessThan(mo.indexOf('Ordered by'));
    expect(mo.trim().endsWith('Thanks — Titan Roofing & Exteriors')).toBe(true);
    expect(mo).not.toContain('$');
    expect(mo).not.toContain('{{');
  });
  it('prices only when asked', () => {
    expect(materialOrderText(est(), ctx, true)).toContain('Materials total: $');
    expect(workOrderText(est(), ctx, true)).toContain('Labor total: $');
    expect(workOrderText(est(), ctx, false)).not.toContain('$');
  });
  it('work order uses customer + date placeholders and keeps scope lines', () => {
    const wo = workOrderText(est(), ctx, false, defaultTemplate('work_order'));
    expect(wo).toContain('Customer: Pat Doe 406-555-0100');
    expect(wo).toContain('Date: Oct 27, 2026');
    expect(wo).toContain('30 squares');
    expect(wo).toContain('- Shingle install: 30 SQ');
    expect(wo).toContain('Crew lead:');
  });
  it('empty template parts are skipped', () => {
    const tpl = { ...defaultTemplate('work_order'), company: { name: '', phone: '', email: '', address: '', license: '' }, title: '', intro: '', notes: '', signature: '', footer: '' };
    expect(workOrderText(est(), ctx, false, tpl).startsWith('\nROOF')).toBe(true);
  });
  it('mailto carries the edited text exactly', () => {
    const body = 'Line 1\nLine & 2';
    expect(mailtoLink('Material order — 1 Test St', body, 'yard@example.com')).toBe('mailto:yard@example.com?subject=Material%20order%20%E2%80%94%201%20Test%20St&body=Line%201%0ALine%20%26%202');
  });
});
