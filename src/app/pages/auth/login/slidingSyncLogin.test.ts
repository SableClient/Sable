import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearPendingSlidingSyncLogin,
  getPendingSlidingSyncLogin,
  setPendingSlidingSyncLogin,
} from './slidingSyncLogin';

describe('pending sliding sync login preference', () => {
  beforeEach(() => sessionStorage.clear());

  it('survives an external login redirect and can be cleared after login', () => {
    expect(getPendingSlidingSyncLogin()).toBe(false);

    setPendingSlidingSyncLogin(true);
    expect(getPendingSlidingSyncLogin()).toBe(true);

    clearPendingSlidingSyncLogin();
    expect(getPendingSlidingSyncLogin()).toBe(false);
  });
});
