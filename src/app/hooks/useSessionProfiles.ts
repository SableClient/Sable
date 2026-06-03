import { useEffect, useRef, useState } from 'react';
import type { Session } from '$state/sessions';

export type SessionProfile = {
  displayName?: string;
  avatarHttpUrl?: string;
};

type SessionProfiles = Record<string, SessionProfile>;

const parseMxc = (mxcUrl: string): { serverName: string; mediaId: string } | undefined => {
  const match = mxcUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/);
  if (!match) return undefined;
  const serverName = match[1];
  const mediaId = match[2];
  if (!serverName || !mediaId) return undefined;
  return { serverName, mediaId };
};

const mxcToThumbnailUrl = (baseUrl: string, mxcUrl: string): string | undefined => {
  const parsed = parseMxc(mxcUrl);
  if (!parsed) return undefined;
  const { serverName, mediaId } = parsed;
  return `${baseUrl}/_matrix/client/v1/media/thumbnail/${serverName}/${mediaId}?width=96&height=96&method=crop`;
};

export const useSessionProfiles = (sessions: Session[]): SessionProfiles => {
  const [profiles, setProfiles] = useState<SessionProfiles>({});

  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  const sessionKey = sessions.map((s) => s.userId).join('\x00');

  useEffect(() => {
    let cancelled = false;

    sessionsRef.current.forEach(async (session) => {
      try {
        const profileUrl = `${session.baseUrl}/_matrix/client/v3/profile/${encodeURIComponent(session.userId)}`;
        const res = await fetch(profileUrl, {
          headers: { Authorization: `Bearer ${session.accessToken}` },
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { displayname?: string; avatar_url?: string };
        if (cancelled) return;

        const avatarHttpUrl = data.avatar_url
          ? mxcToThumbnailUrl(session.baseUrl, data.avatar_url)
          : undefined;

        setProfiles((prev) => ({
          ...prev,
          [session.userId]: {
            displayName: data.displayname ?? undefined,
            avatarHttpUrl,
          },
        }));
      } catch {
        // ignore
      }
    });

    return () => {
      cancelled = true;
    };
  }, [sessionKey]);

  return profiles;
};
