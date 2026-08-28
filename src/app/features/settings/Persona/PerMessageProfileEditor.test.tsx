import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from '$types/matrix-sdk';
import type * as PerMessageProfileModule from '$hooks/usePerMessageProfile';
import { PerMessageProfileEditor } from './PerMessageProfileEditor';

const mocked = vi.hoisted(() => ({
  addOrUpdate: vi.fn<typeof PerMessageProfileModule.addOrUpdatePerMessageProfile>(),
  rename: vi.fn<typeof PerMessageProfileModule.renamePerMessageProfile>(),
  remove: vi.fn<typeof PerMessageProfileModule.deletePerMessageProfile>(),
}));

vi.mock('$hooks/usePerMessageProfile', async (importOriginal) => ({
  ...(await importOriginal<typeof PerMessageProfileModule>()),
  addOrUpdatePerMessageProfile: mocked.addOrUpdate,
  renamePerMessageProfile: mocked.rename,
  deletePerMessageProfile: mocked.remove,
}));

vi.mock('$hooks/useMediaAuthentication', () => ({
  useMediaAuthentication: () => false,
}));

describe('PerMessageProfileEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.addOrUpdate.mockResolvedValue(undefined);
    mocked.rename.mockResolvedValue(undefined);
  });

  it('uses the renamed persona ID for later saves', async () => {
    render(
      <PerMessageProfileEditor
        mx={{} as MatrixClient}
        profileId="old-id"
        displayName="New Profile"
        shorthands={[]}
      />
    );

    fireEvent.change(screen.getByLabelText('profile id'), { target: { value: 'new-id' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile changes for old-id' }));

    await waitFor(() => {
      expect(mocked.rename).toHaveBeenCalledWith(expect.anything(), 'old-id', 'new-id');
    });

    fireEvent.change(screen.getByLabelText('Display name for old-id'), {
      target: { value: 'Edited Profile' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile changes for old-id' }));

    await waitFor(() => expect(mocked.addOrUpdate).toHaveBeenCalledTimes(2));
    expect(mocked.addOrUpdate.mock.calls[1]?.[1]).toMatchObject({
      id: 'new-id',
      displayname: 'Edited Profile',
    });
  });
});
