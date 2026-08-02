import { atom, useAtom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import type { MatrixClient,  MatrixError } from '$types/matrix-sdk';
import { useCallback } from 'react';
import { useThrottle } from '$hooks/useThrottle';
import {IPreviewUrlResponse} from "matrix-js-sdk";
import type {UploadProgress, UploadResponse} from "$types/matrix-sdk.ts";
import {isTauri} from "@tauri-apps/api/core";
import { fetch as taurifetch} from '@tauri-apps/plugin-http';
import { parseDocument, DomUtils } from 'htmlparser2';
import { Element } from 'domhandler';
export type EmbedPreview = {
    title: string,
    type: string,
    description?: string,
    imageMxc?: string,
}

export enum EmbedStatus {
    Idle = 'idle',
    Loading = 'loading',
    Success = 'success',
    Error = 'error',
}

export type EmbedIdle = {
    url: string;
    status: EmbedStatus.Idle;
};

export type EmbedLoading = {
    url: string;
    status: EmbedStatus.Loading;
    preview?: EmbedPreview;
    promise: Promise<Response>;
};

export type EmbedSuccess = {
    url: string;
    status: EmbedStatus.Success;
    preview: EmbedPreview;
    data: IPreviewUrlResponse;
};

export type EmbedError = {
    url: string;
    status: EmbedStatus.Error;
    reason: EmbedErrorReason;
};

export type Embed = EmbedIdle | EmbedLoading | EmbedSuccess | EmbedError;

type EmbedAtomAction =
    | {
    promise: Promise<Response>;
}
    | {
    progress: EmbedPreview | undefined;
}
    | {
    data: IPreviewUrlResponse;
    progress: EmbedPreview;
}
    | {
    error: EmbedErrorReason;
};

export enum EmbedErrorReason {
    RequestFailed,
    NoOgData,
}

export type fetchEmbedOptions = {
    onPromise?: (promise: Promise<any>) => void;
    onProgress?: (progress: EmbedPreview) => void;
    onSuccess: (embed: IPreviewUrlResponse, progress: EmbedPreview) => void;
    onError: (reason: EmbedErrorReason) => void;
};

const hasProperty = (dom: Element, value: string) => {
    return value === dom.attribs?.property
};

const parseOg = ( html: string ) => {
    const dom = parseDocument(html);
    let head = DomUtils.getElementsByTagName("head", dom);
    let metaTags = DomUtils.getElementsByTagName("meta", head);


    let alternatives: Record<string, [string, string][]> = {
        "og:title": [["name", "title"]],
        "og:description": [["name", "description"]],
    }

    let requiredTags = [ "og:title", "og:type","og:url"]
    let optionalStringTags = ["og:image", "og:image:type", "og:description", "og:image:alt"];
    let optionalNumberTags = ["og:image:height", "og:image:width"]
    let result: IPreviewUrlResponse = <IPreviewUrlResponse>{}
    for (const ogTag of requiredTags) {
        let tag = DomUtils.findOne((e) => hasProperty(e, ogTag), metaTags)
        if (!tag || !tag.attribs?.content) {
            let altList = alternatives[ogTag]
            if (!altList)
                return null
            while (!tag || !tag.attribs?.content) {
                let next = altList.pop()
                if (!next)
                    return null
                tag = DomUtils.findOne((e) => e.attribs?.[(next[0])] == next[1], metaTags)
            }
        }
        result[ogTag] = tag.attribs?.content
    }
    for (const ogTag of optionalStringTags) {
        let tag = DomUtils.findOne((e) => hasProperty(e, ogTag), metaTags)
        result[ogTag] = tag?.attribs?.content
    }
    for (const ogTag of optionalNumberTags) {
        let tag = DomUtils.findOne((e) => hasProperty(e, ogTag), metaTags)
        if (!tag?.attribs?.content)
            continue;
        result[ogTag] = Number.parseInt(tag?.attribs?.content)
    }

    return result
}

const fetchEmbed = async (
    url: string,
    mx: MatrixClient,
    fetchEmbedOptions: fetchEmbedOptions) => {
    if (!fetchEmbedOptions.onProgress)
        fetchEmbedOptions.onProgress = (_) => {};
    if (!fetchEmbedOptions.onPromise)
        fetchEmbedOptions.onPromise = (_) => {}
    //TODO filter local ips
    let fetchResponse;
    try {
         let fetchPromise =  isTauri() ? taurifetch(url) : fetch(url)
         fetchEmbedOptions.onPromise(fetchPromise);
         fetchResponse = await fetchPromise;

    } catch (e) {
        console.error(e);
        fetchEmbedOptions.onError(EmbedErrorReason.RequestFailed);
        return
    }
    if (fetchResponse.ok) {
        if (fetchResponse.headers.get('content-type')?.split(";")[0] == 'text/html') {
            let prelimEmbed = parseOg(await fetchResponse.text())
            if (!prelimEmbed) {
                fetchEmbedOptions.onError(EmbedErrorReason.NoOgData);
                return
            }

            let preview: EmbedPreview = {description: prelimEmbed?.["og:description"], title: prelimEmbed?.["og:title"], type: prelimEmbed?.["og:type"]}
            fetchEmbedOptions.onProgress(preview)

        } else {
            fetchEmbedOptions.onError(EmbedErrorReason.NoOgData);
        }
    } else {
        fetchEmbedOptions.onError(EmbedErrorReason.RequestFailed);
    }




}

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
                    promise: update.promise,
                });
                return;
            }
            if ('progress' in update && embedState.status === EmbedStatus.Loading) {
                set(baseEmbedAtom, {
                    ...embedState,
                    preview: update.progress,
                });
                return;
            }
            if ('data' in update) {
                set(baseEmbedAtom, {
                    status: EmbedStatus.Success,
                    url,
                    data: update.data,
                    preview: update.progress,
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
    embedAtom: TEmbedAtom
) => {
    const [embed, setEmbed] = useAtom(embedAtom);
    const { url } = embed;



    const startEmbed = useCallback(
        () =>
            fetchEmbed(url, mx, {
                onSuccess: (data, progress) => setEmbed({ data, progress }),
                onError: (error) => setEmbed({ error }),
                onProgress: (progress) => setEmbed({ progress }),
                onPromise: promise => setEmbed({ promise })
            }),
        [url, mx ]
    );

    const cancelEmbed = useCallback(() => {
        if (embed.status === EmbedStatus.Loading) {
           //TODO
        }
    }, [mx, embed]);

    return {
        embed,
        startEmbed,
        cancelEmbed,
    };
};

export const createEmbedAtomFamily = () =>
    atomFamily<string, TEmbedAtom>(createEmbedAtom);
export type TEmbedAtomFamily = ReturnType<typeof createEmbedAtomFamily>;

export const createEmbedFamilyObserverAtom = (
    uploadFamily: TEmbedAtomFamily,
    uploads: string[]
) => atom<Embed[]>((get) => uploads.map((upload) => get(uploadFamily(upload))));
export type TEmbedFamilyObserverAtom = ReturnType<typeof createEmbedFamilyObserverAtom>;
