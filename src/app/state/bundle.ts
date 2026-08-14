import { atom, useAtom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import type { MatrixClient } from '$types/matrix-sdk';
import { useCallback } from 'react';
import type { IPreviewUrlResponse } from 'matrix-js-sdk';
import { isTauri } from '@tauri-apps/api/core';
import { fetch as taurifetch } from '@tauri-apps/plugin-http';
import { parseDocument, DomUtils } from 'htmlparser2';
import type { Element } from 'domhandler';
import { encryptFile, mxcUrlToHttp, uploadContent } from '$utils/matrix.ts';
import { isImageMimeType } from '$utils/mimeTypes.ts';
import { MATRIX_BUNDLED_EMBEDS_ENCRYPTED_PROPERTY_NAME } from '$unstable/prefixes/misc.ts';
import type { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication.ts';
export type FixedPreviewUrlResponse = {
  [p: string]:
    | string
    | number
    | undefined
    | Record<string, string | Record<string, string | string[] | boolean>>;
  'og:image'?: string;
  MATRIX_BUNDLED_EMBEDS_ENCRYPTED_PROPERTY_NAME?: Record<
    string,
    string | Record<string, string | string[] | boolean>
  >;
} & Omit<IPreviewUrlResponse, keyof Record<string, undefined>>;

export enum EmbedPreviewType {
  TitleDescription,
  MediaOnly,
  TitleDescriptionMedia,
}
export type EmbedPreview = {
  title: string;
  type: EmbedPreviewType;
  description?: string;
  media?: Blob;
  mediaType?: string;
};

export enum EmbedStatus {
  Idle = 'idle',
  Loading = 'loading',
  Success = 'success',
  Error = 'error',
}

export enum LoadingStatus {
  Html = 'fetching html',
  MediaDown = 'downloading media ',
  MediaUp = 'uploading media',
  Encrypt = 'encrypting media',
}

export type EmbedIdle = {
  url: string;
  status: EmbedStatus.Idle;
};

export type EmbedLoading = {
  url: string;
  status: EmbedStatus.Loading;
  progress: LoadingStatus;
  preview?: EmbedPreview;
  promise: Promise<Response | IPreviewUrlResponse>;
};

export type EmbedSuccess = {
  url: string;
  status: EmbedStatus.Success;
  preview: EmbedPreview;
  data: FixedPreviewUrlResponse;
};

export type EmbedError = {
  url: string;
  status: EmbedStatus.Error;
  reason: EmbedErrorReason;
};

export type Embed = EmbedIdle | EmbedLoading | EmbedSuccess | EmbedError;

type EmbedAtomAction =
  | {
      promise: Promise<Response | IPreviewUrlResponse>;
    }
  | {
      progress: LoadingStatus;
      preview: EmbedPreview | undefined;
    }
  | {
      data: FixedPreviewUrlResponse;
      preview: EmbedPreview;
    }
  | {
      error: EmbedErrorReason;
    };

export enum EmbedErrorReason {
  RequestFailed,
  NoOgData,
  UploadFailed,
  EncryptFailed,
}

export type fetchEmbedOptions = {
  onPromise?: (promise: Promise<Response | IPreviewUrlResponse>) => void;
  onProgress?: (preview: EmbedPreview, progress: LoadingStatus) => void;
  onSuccess: (embed: FixedPreviewUrlResponse, progress: EmbedPreview) => void;
  onError: (reason: EmbedErrorReason) => void;
};

const hasProperty = (dom: Element, value: string) => {
  return value === dom.attribs?.property;
};

const parseOg = (html: string) => {
  const dom = parseDocument(html);
  let head = DomUtils.getElementsByTagName('head', dom);
  let metaTags = DomUtils.getElementsByTagName('meta', head);

  let alternatives: Record<string, [string, string][]> = {
    'og:title': [['name', 'title']],
    'og:description': [['name', 'description']],
  };

  let requiredTags = ['og:title', 'og:type', 'og:url'];
  let optionalStringTags = ['og:image', 'og:image:type', 'og:description', 'og:image:alt'];
  let optionalNumberTags = ['og:image:height', 'og:image:width'];
  let result = new Map<string, string | number | undefined>();
  for (const ogTag of requiredTags) {
    let tag = DomUtils.findOne((e) => hasProperty(e, ogTag), metaTags);
    if (!tag || !tag.attribs?.content) {
      let altList = alternatives[ogTag];
      if (!altList) return null;
      while (!tag || !tag.attribs?.content) {
        let next = altList.pop();
        if (!next) return null;
        tag = DomUtils.findOne((e) => e.attribs?.[next[0]] == next[1], metaTags);
      }
    }
    result.set(ogTag, tag.attribs?.content);
  }
  for (const ogTag of optionalStringTags) {
    let tag = DomUtils.findOne((e) => hasProperty(e, ogTag), metaTags);
    result.set(ogTag, tag?.attribs?.content);
  }
  for (const ogTag of optionalNumberTags) {
    let tag = DomUtils.findOne((e) => hasProperty(e, ogTag), metaTags);
    if (!tag?.attribs?.content) continue;
    result.set(ogTag, Number.parseInt(tag?.attribs?.content));
  }

  return result;
};

function fetchWrapper(url: string) {
  return isTauri() ? taurifetch(url) : fetch(url);
}

const FetchEmbed = async (
  url: string,
  mx: MatrixClient,
  encrypted: boolean,
  bundleUseHomeserver: boolean,
  successCallback: (result: FixedPreviewUrlResponse) => void,
  useAuthentication: boolean,
  fetchEmbedOptions: fetchEmbedOptions
) => {
  if (!fetchEmbedOptions.onProgress) fetchEmbedOptions.onProgress = () => {};
  if (!fetchEmbedOptions.onPromise) fetchEmbedOptions.onPromise = () => {};
  const pushImage = async (
    imgData: Blob,
    preview: EmbedPreview,
    embedRecord: FixedPreviewUrlResponse
  ) => {
    preview.media = imgData;
    let encInfo: EncryptedAttachmentInfo;
    if (encrypted) {
      fetchEmbedOptions.onProgress?.(preview, LoadingStatus.Encrypt);
      try {
        let encryptResult = await encryptFile(imgData);
        imgData = encryptResult.file;
        encInfo = encryptResult.encInfo;
      } catch {
        fetchEmbedOptions.onError(EmbedErrorReason.EncryptFailed);
        return;
      }
    }
    fetchEmbedOptions.onProgress?.(preview, LoadingStatus.MediaUp);
    await uploadContent(mx, new File([imgData], 'mediaPreview'), {
      onError: () => {
        if (preview.type == EmbedPreviewType.MediaOnly) {
          fetchEmbedOptions.onError(EmbedErrorReason.UploadFailed);
          return;
        }
        preview.type = EmbedPreviewType.TitleDescription;
        for (const e in embedRecord) {
          if (e.startsWith('og:image')) {
            embedRecord[e] = undefined;
          }
        }
        fetchEmbedOptions.onSuccess(embedRecord, preview);
        successCallback(embedRecord);
      },
      onSuccess: (mxc) => {
        if (encrypted) {
          embedRecord[MATRIX_BUNDLED_EMBEDS_ENCRYPTED_PROPERTY_NAME] = {
            ...encInfo,
            url: mxc,
          };
          embedRecord['matrix:image:size'] = imgData.size;
          embedRecord['og:image'] = undefined;
        } else {
          embedRecord['og:image'] = mxc;
          embedRecord['matrix:image:size'] = imgData.size;
        }
        fetchEmbedOptions.onSuccess(embedRecord, preview);
        successCallback(embedRecord);
      },
    });
  };
  //TODO filter local ips. How to even do this on web?
  if (bundleUseHomeserver) {
    var response: IPreviewUrlResponse;
    try {
      const promise = mx.getUrlPreview(url, Date.now());
      fetchEmbedOptions.onPromise(promise);
      response = await promise;
    } catch {
      fetchEmbedOptions.onError(EmbedErrorReason.RequestFailed);
      return;
    }
    const imageUrl = mxcUrlToHttp(
      mx,
      response['og:image'] || '',
      useAuthentication,
      256,
      256,
      'scale',
      false
    );
    let preview: EmbedPreview = {
      description: response['og:description'],
      title: response['og:title'],
      type: EmbedPreviewType.TitleDescription,
    };
    if (!imageUrl) {
      fetchEmbedOptions.onSuccess(response, preview);
      successCallback(response);
      return;
    }

    let fetchPromise = fetch(imageUrl);
    fetchEmbedOptions.onProgress(preview, LoadingStatus.MediaDown);
    let fetchResponse = await fetchPromise;
    let fetchBlob = await fetchResponse.blob().catch(() => null);
    if (!fetchBlob) {
      fetchEmbedOptions.onSuccess(response, preview);
      successCallback(response);
      return;
    }
    preview.media = fetchBlob;
    if (fetchBlob.type.length > 0) {
      preview.mediaType = fetchBlob.type;
    } else if (fetchResponse.headers.get('content-type')?.split(';')[0]) {
      preview.mediaType = fetchResponse.headers.get('content-type')?.split(';')[0];
    }
    preview.type = EmbedPreviewType.TitleDescriptionMedia;
    if (encrypted) {
      await pushImage(fetchBlob, preview, response);
    } else {
      fetchEmbedOptions.onSuccess(response, preview);
      successCallback(response);
    }
    return;
  }
  let fetchResponse;
  try {
    let fetchPromise = fetchWrapper(url);
    fetchEmbedOptions.onPromise(fetchPromise);
    fetchResponse = await fetchPromise;
  } catch (e) {
    console.error(e);
    fetchEmbedOptions.onError(EmbedErrorReason.RequestFailed);
    return;
  }
  if (fetchResponse.ok) {
    if (fetchResponse.headers.get('content-type')?.split(';')[0] == 'text/html') {
      let prelimEmbed = parseOg(await fetchResponse.text());
      if (!prelimEmbed) {
        fetchEmbedOptions.onError(EmbedErrorReason.NoOgData);
        return;
      }

      let supportedMediaTags = new Set(['og:image']);
      const hasSupportedMedia = prelimEmbed.keys().some((item) => supportedMediaTags.has(item));

      let preview: EmbedPreview = {
        description: <string>prelimEmbed.get('og:description'),
        title: <string>prelimEmbed.get('og:title'),
        type: hasSupportedMedia
          ? EmbedPreviewType.TitleDescriptionMedia
          : EmbedPreviewType.TitleDescription,
      };
      fetchEmbedOptions.onProgress(preview, LoadingStatus.MediaDown);

      let embedRecord: FixedPreviewUrlResponse = <FixedPreviewUrlResponse>(
        Object.fromEntries(prelimEmbed)
      );
      if (!hasSupportedMedia) {
        fetchEmbedOptions.onSuccess(embedRecord, preview);
        successCallback(embedRecord);
      } else {
        if (embedRecord['og:image']) {
          const imgResponse = await fetchWrapper(embedRecord['og:image']);
          const imgData = await imgResponse.blob();
          preview.media = imgData;
          if (imgData.type.length > 0) {
            preview.mediaType = imgData.type;
          } else if (imgResponse.headers.get('content-type')?.split(';')[0]) {
            preview.mediaType = imgResponse.headers.get('content-type')?.split(';')[0];
          }
          await pushImage(imgData, preview, embedRecord);
        } else {
          //other media types
          preview.type = EmbedPreviewType.TitleDescription;
          fetchEmbedOptions.onSuccess(embedRecord, preview);
          successCallback(embedRecord);
        }
      }
    } else if (isImageMimeType(fetchResponse.headers.get('content-type')?.split(';')[0] || '')) {
      //TODO: decide if generating bundled previews for image links (and other media potentially) is something we even want
      fetchEmbedOptions.onError(EmbedErrorReason.NoOgData);
    } else {
      fetchEmbedOptions.onError(EmbedErrorReason.NoOgData);
    }
  } else {
    fetchEmbedOptions.onError(EmbedErrorReason.RequestFailed);
  }
};

export const createEmbedAtom = (url: string) => {
  const baseEmbedAtom = atom<Embed>({
    url,
    status: EmbedStatus.Idle,
  });
  return atom<Embed, [EmbedAtomAction], undefined>(
    (get) => get(baseEmbedAtom),
    (get, set, update) => {
      const embedState = get(baseEmbedAtom);
      if ('promise' in update) {
        set(baseEmbedAtom, {
          status: EmbedStatus.Loading,
          url,
          progress: LoadingStatus.Html,
          promise: update.promise,
        });
        return;
      }
      if ('progress' in update && embedState.status === EmbedStatus.Loading) {
        set(baseEmbedAtom, {
          ...embedState,
          progress: update.progress,
          preview: update.preview,
        });
        return;
      }
      if ('data' in update) {
        set(baseEmbedAtom, {
          status: EmbedStatus.Success,
          url,
          data: update.data,
          preview: update.preview,
        });
        return;
      }
      if ('error' in update) {
        set(baseEmbedAtom, {
          status: EmbedStatus.Error,
          url,
          reason: update.error,
        });
      }
    }
  );
};
export type TEmbedAtom = ReturnType<typeof createEmbedAtom>;

export const useBindEmbedAtom = (
  mx: MatrixClient,
  embedAtom: TEmbedAtom,
  encrypt: boolean,
  useHomeserver: boolean
) => {
  const [embed, setEmbed] = useAtom(embedAtom);
  const { url } = embed;
  const useAuth = useMediaAuthentication();

  const startEmbed = useCallback(
    (successCallback: (result: FixedPreviewUrlResponse) => void) =>
      FetchEmbed(url, mx, encrypt, useHomeserver, successCallback, useAuth, {
        onSuccess: (data, progress) => setEmbed({ data, preview: progress }),
        onError: (error) => setEmbed({ error }),
        onProgress: (preview, progress) => setEmbed({ preview, progress }),
        onPromise: (promise) => setEmbed({ promise }),
      }),
    [url, mx, encrypt, useHomeserver, setEmbed, useAuth]
  );

  return {
    embed,
    startEmbed,
  };
};

export const createEmbedAtomFamily = () => atomFamily<string, TEmbedAtom>(createEmbedAtom);
export type TEmbedAtomFamily = ReturnType<typeof createEmbedAtomFamily>;

export const createEmbedFamilyObserverAtom = (uploadFamily: TEmbedAtomFamily, uploads: string[]) =>
  atom<Embed[]>((get) => uploads.map((upload) => get(uploadFamily(upload))));
export type TEmbedFamilyObserverAtom = ReturnType<typeof createEmbedFamilyObserverAtom>;
