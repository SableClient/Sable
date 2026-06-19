import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SSOStage } from './SSOStage';

describe('SSOStage', () => {
  it('completes the SSO fallback after the popup posts authDone', () => {
    const close = vi.fn<() => void>();
    const popupWindow = { close } as unknown as Window;
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(popupWindow);
    const submitAuthDict = vi.fn<(auth: { session: string }) => void>();

    render(
      <SSOStage
        ssoRedirectURL="https://auth.example/sso"
        stageData={{ session: 'uia-session' } as never}
        submitAuthDict={submitAuthDict}
        onCancel={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue with SSO' }));

    expect(openSpy).toHaveBeenCalledWith('https://auth.example/sso', 'sable-uia-sso');

    const event = new MessageEvent('message', {
      data: 'authDone',
      origin: 'https://auth.example',
    });
    Object.defineProperty(event, 'source', { value: popupWindow });
    window.dispatchEvent(event);

    expect(close).toHaveBeenCalledTimes(1);
    expect(submitAuthDict).toHaveBeenCalledWith({ session: 'uia-session' });
  });
});
