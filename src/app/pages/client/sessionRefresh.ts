import type { Session, SessionsAction } from '$state/sessions';

export function createSessionRefreshHandler(
  userId: string,
  getSession: () => Session | undefined,
  setSessions: (action: SessionsAction) => void,
  pushSession: (baseUrl?: string, accessToken?: string, userId?: string) => void
): (newAccessToken: string, newRefreshToken?: string) => void {
  return (newAccessToken: string, newRefreshToken?: string) => {
    const session = getSession();
    if (!session) return;

    setSessions({
      type: 'PUT',
      session: {
        ...session,
        accessToken: newAccessToken,
        ...(newRefreshToken !== undefined && { refreshToken: newRefreshToken }),
      },
    });
    pushSession(session.baseUrl, newAccessToken, userId);
  };
}
