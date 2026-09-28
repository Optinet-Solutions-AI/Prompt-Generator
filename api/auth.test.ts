import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { approvalFor } from './auth.js';

describe('approvalFor — who gets in without waiting', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.AUTO_APPROVE_DOMAINS = 'optinetsolutions.com';
    process.env.AUTO_APPROVE_EMAILS = 'Lena@roosterpartners.com';
    process.env.ADMIN_EMAILS = 'john@optinetsolutions.com';
  });
  afterEach(() => { process.env = { ...saved }; });

  it('pre-approves a listed outside email, ignoring upper/lower case', () => {
    expect(approvalFor('lena@roosterpartners.com').preApproved).toBe(true);
    expect(approvalFor('LENA@RoosterPartners.com').preApproved).toBe(true);
  });

  it('does NOT let in other people from the same outside domain', () => {
    expect(approvalFor('someone@roosterpartners.com').preApproved).toBe(false);
  });

  it('lets in company accounts and marks listed admins', () => {
    expect(approvalFor('maria@optinetsolutions.com')).toEqual({ isAdmin: false, preApproved: true });
    expect(approvalFor('john@optinetsolutions.com')).toEqual({ isAdmin: true, preApproved: true });
  });

  it('leaves everyone else pending', () => {
    expect(approvalFor('random@gmail.com').preApproved).toBe(false);
  });
});
