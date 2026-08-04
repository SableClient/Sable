import {useMatrixClient} from "$hooks/useMatrixClient.ts";
import {useMediaConfig} from "$hooks/useMediaConfig.ts";
import {roomEmbedAtomFamily} from "$state/room/roomInputDrafts.ts";
import {useMemo} from "react";
import type {Opts as LinkifyOpts} from "linkifyjs";
import {LINKIFY_OPTS} from "$plugins/react-custom-html-parser.tsx";
import {useSpoilerClickHandler} from "$hooks/useSpoilerClickHandler.ts";
import {useMediaAuthentication} from "$hooks/useMediaAuthentication.ts";
import {useSettingsLinkBaseUrl} from "$features/settings/useSettingsLinkBaseUrl.ts";
import {useSetting} from "$state/hooks/settings.ts";
import {settingsAtom} from "$state/settings.ts";
import {UploadCard} from "$components/upload-card/UploadCard.tsx";
import {Box, color, IconButton, Text, toRem} from "folds";
import {Check, CircleNotch, File as FileIcon, Image, sizedIcon, X} from "$components/icons/phosphor.tsx";
import {EmbedErrorReason, EmbedStatus, FixedPreviewUrlResponse, useBindEmbedAtom} from "$state/bundle.ts";
import {Image as MediaImage} from "$components/media";
import {useObjectURL} from "$hooks/useObjectURL.ts";
import {isImageMimeType} from "$utils/mimeTypes.ts";
import {IPreviewUrlResponse} from "matrix-js-sdk";


type EmbedCardRendererProps = {
    url: string,
    successCallback: (result: FixedPreviewUrlResponse) => void,
    encrypt: boolean,
}

function prettyError(error: EmbedErrorReason) {
    switch (error) {
        //TODO localize
        case EmbedErrorReason.UploadFailed:
            return "Failed to upload";
        case EmbedErrorReason.EncryptFailed:
            return "Failed to encrypt";
        case EmbedErrorReason.RequestFailed:
            return "Failed to fetch url"
        case EmbedErrorReason.NoOgData:
            return "Url doesnt provide previews"

    }
}

interface MediaProps {
    data: Blob
}

function Media({data}: Readonly<MediaProps>) {
    const fileUrl = useObjectURL(data);
    if (isImageMimeType(data.type)) {
        return (
            <MediaImage
                style={{
                    objectFit: 'contain',
                    width: '100%',
                    height: toRem(128),
                }}
                src={fileUrl}
            />
        );
    }

    return (<FileIcon size={"fill"}/>);


}

export function EmbedCardRenderer({url, successCallback, encrypt}: Readonly<EmbedCardRendererProps>) {
    const mx = useMatrixClient();
    const mediaConfig = useMediaConfig();
    const allowSize = mediaConfig['m.upload.size'] || Infinity;


    const linkifyOpts = useMemo<LinkifyOpts>(() => ({...LINKIFY_OPTS}), []);

    const spoilerClickHandler = useSpoilerClickHandler();
    const useAuthentication = useMediaAuthentication();
    const settingsLinkBaseUrl = useSettingsLinkBaseUrl();
    const [incomingInlineImagesDefaultHeight] = useSetting(
        settingsAtom,
        'incomingInlineImagesDefaultHeight'
    );
    const [incomingInlineImagesMaxHeight] = useSetting(settingsAtom, 'incomingInlineImagesMaxHeight');
    const embedAtom = roomEmbedAtomFamily(url);
    const {embed, startEmbed, cancelEmbed} = useBindEmbedAtom(mx, embedAtom, encrypt);

    if (embed.status === EmbedStatus.Idle) {
        startEmbed(successCallback);
    }

    return (
        <UploadCard
            radii="300"
            compact
            style={{maxWidth: toRem(400), flexShrink: 0}}
            before={
                <></>
            }
            after={
                <>

                    <IconButton
                        aria-label="Cancel Upload"
                        variant="SurfaceVariant"
                        radii="Pill"
                        size="300"
                    >
                        {sizedIcon(X, '200')}
                    </IconButton>
                </>
            }
            bottom={
                <>
                    {embed.status == EmbedStatus.Idle && <>{"Preview here"}</>}
                    {(embed.status == EmbedStatus.Loading || embed.status == EmbedStatus.Success) &&
                        <>
                            <Box direction={"Row"} gap={"200"}>
                                <Box style={{flex: 2}}>
                                    {embed.preview?.media && <Media data={embed.preview.media}/>}
                                    {!(embed.preview?.media) && <CircleNotch size={"fill"} style={{
                                        animation: "spin 1s infinite linear"}}/>}
                                </Box>
                                <Box direction={"Column"} style={{flex: 5}}>
                                    <Text size={"H4"}>
                                        {embed.preview?.title}
                                    </Text>
                                    <Text size={"T400"}>
                                        {embed.preview?.description || "No Description"}
                                    </Text>
                                </Box>

                            </Box>
                        </>
                    }
                    {embed.status == EmbedStatus.Error &&
                        <Text style={{color: color.Critical.Main}}>
                            {prettyError(embed.reason)}
                        </Text>
                    }


                </>
            }
        >
            <Text size="H6" truncate align={"Left"} style={{minWidth: 0, flexGrow: 1}}>
                {url}
            </Text>
            {embed.status == EmbedStatus.Success &&
                sizedIcon(Check, '100', {style: {color: color.Success.Main}})}

            {embed.status == EmbedStatus.Error &&
                sizedIcon(X, '100', {style: {color: color.Critical.Main}})}
            <style>
                {`
                      @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                      }
                    `}
            </style>
            {embed.status == EmbedStatus.Loading && <Text align={"Right"} size="H6" truncate style={{minWidth: 0, flexGrow: 1}}>
                {embed.progress}
            </Text>}
            {(embed.status == EmbedStatus.Loading || embed.status == EmbedStatus.Idle) &&
                sizedIcon(CircleNotch, '100', {
                    style: {
                        color: color.Primary.Main,
                        animation: "spin 1s infinite linear"
                    }
                })}
        </UploadCard>
    );
}