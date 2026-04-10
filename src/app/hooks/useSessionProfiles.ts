import { useEffect, useRef, useState } from 'react';
import { Session } from '$state/sessions';
import { fetchMediaBlob } from '$utils/mediaTransport';

export type SessionProfile = {
  displayName?: string;
  avatarHttpUrl?: string;
};

type SessionProfiles = Record<string, SessionProfile>;

const parseMxc = (mxcUrl: string): { serverName: string; mediaId: string } | undefined => {
  const match = mxcUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/);
  if (!match) return undefined;
  return { serverName: match[1], mediaId: match[2] };
};

const fetchAvatarBlobUrl = async (
  session: Session,
  mxcUrl: string
): Promise<string | undefined> => {
  const parsed = parseMxc(mxcUrl);
  if (!parsed) return undefined;
  const { serverName, mediaId } = parsed;

  const tryFetch = async (url: string) => {
    const blob = await fetchMediaBlob(url, {
      accessToken: session.accessToken,
      sessionScope: session.userId,
    });
    return URL.createObjectURL(blob);
  };

  try {
    return await tryFetch(
      `${session.baseUrl}/_matrix/client/v1/media/thumbnail/${encodeURIComponent(serverName)}/${encodeURIComponent(mediaId)}?width=96&height=96&method=crop`
    );
  } catch {
    try {
      return await tryFetch(
        `${session.baseUrl}/_matrix/media/v3/thumbnail/${encodeURIComponent(serverName)}/${encodeURIComponent(mediaId)}?width=96&height=96&method=crop`
      );
    } catch {
      return undefined;
    }
  }
};

export const useSessionProfiles = (sessions: Session[]): SessionProfiles => {
  const [profiles, setProfiles] = useState<SessionProfiles>({});
  const blobUrlsRef = useRef<string[]>([]);

  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  const sessionKey = sessions.map((s) => s.userId).join('\x00');

  useEffect(() => {
    let cancelled = false;
    const newBlobUrls: string[] = [];

    sessionsRef.current.forEach(async (session) => {
      try {
        const profileUrl = `${session.baseUrl}/_matrix/client/v3/profile/${encodeURIComponent(session.userId)}`;
        const res = await fetch(profileUrl, {
          headers: { Authorization: `Bearer ${session.accessToken}` },
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { displayname?: string; avatar_url?: string };
        if (cancelled) return;

        let avatarHttpUrl: string | undefined;
        if (data.avatar_url) {
          avatarHttpUrl = await fetchAvatarBlobUrl(session, data.avatar_url);
          if (avatarHttpUrl) newBlobUrls.push(avatarHttpUrl);
        }

        if (cancelled) {
          if (avatarHttpUrl) URL.revokeObjectURL(avatarHttpUrl);
          return;
        }

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
      blobUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      blobUrlsRef.current = newBlobUrls;
    };
  }, [sessionKey]);

  return profiles;
};
