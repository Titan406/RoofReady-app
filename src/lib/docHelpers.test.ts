import { describe, expect, it } from 'vitest';
import { filterJobs, formatSize } from './docHelpers';

describe('documents helpers', () => {
  it('formats sizes', () => {
    expect(formatSize(null)).toBe('');
    expect(formatSize(500)).toBe('500 B');
    expect(formatSize(2048)).toBe('2 KB');
    expect(formatSize(3.5 * 1024 * 1024)).toBe('3.5 MB');
  });
  it('filters jobs by name, address or phone digits', () => {
    const jobs = [
      { id: 1, address: '12 Oak Rd', customers: { name: 'Ann Lee', phone: '(406) 555-1212' } },
      { id: 2, address: '9 Pine St', customers: { name: 'Bob Ray', phone: '4065550000' } },
    ];
    expect(filterJobs(jobs, '').length).toBe(2);
    expect(filterJobs(jobs, 'oak').map((j) => j.id)).toEqual([1]);
    expect(filterJobs(jobs, 'bob').map((j) => j.id)).toEqual([2]);
    expect(filterJobs(jobs, '555-1212').map((j) => j.id)).toEqual([1]);
    expect(filterJobs(jobs, 'zzz')).toEqual([]);
  });
});
