import { describe, it, expect } from 'vitest';
import { driveNotConnectedMessage } from './_user-drive';

// The error must name the button the person really sees in their menu:
// username accounts (no Google sign-in) see "Connect Google Drive",
// Google accounts see "Reconnect Google Drive" (see UserBar).
describe('driveNotConnectedMessage', () => {
  it('tells a username account to click "Connect Google Drive"', () => {
    expect(driveNotConnectedMessage({ google_sub: null }))
      .toBe('Your Google Drive is not connected — click "Connect Google Drive".');
  });

  it('tells a Google account to click "Reconnect Google Drive"', () => {
    expect(driveNotConnectedMessage({ google_sub: '1234567890' }))
      .toBe('Your Google Drive is not connected — click "Reconnect Google Drive".');
  });

  it('falls back to "Reconnect Google Drive" when the account is unknown', () => {
    expect(driveNotConnectedMessage(null))
      .toBe('Your Google Drive is not connected — click "Reconnect Google Drive".');
  });
});
