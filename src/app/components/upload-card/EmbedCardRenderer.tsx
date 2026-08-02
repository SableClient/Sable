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
import {Check, Image, sizedIcon, X,  CircleNotch} from "$components/icons/phosphor.tsx";
import {EmbedStatus, useBindEmbedAtom} from "$state/bundle.ts";


type EmbedCardRendererProps = {
    url: string
}

export function EmbedCardRenderer({url}: Readonly<EmbedCardRendererProps>) {
    const mx = useMatrixClient();
    const mediaConfig = useMediaConfig();
    const allowSize = mediaConfig['m.upload.size'] || Infinity;



    const linkifyOpts = useMemo<LinkifyOpts>(() => ({ ...LINKIFY_OPTS }), []);

    const spoilerClickHandler = useSpoilerClickHandler();
    const useAuthentication = useMediaAuthentication();
    const settingsLinkBaseUrl = useSettingsLinkBaseUrl();
    const [incomingInlineImagesDefaultHeight] = useSetting(
        settingsAtom,
        'incomingInlineImagesDefaultHeight'
    );
    const [incomingInlineImagesMaxHeight] = useSetting(settingsAtom, 'incomingInlineImagesMaxHeight');
    const embedAtom = roomEmbedAtomFamily(url);
    const { embed, startEmbed, cancelEmbed } = useBindEmbedAtom(mx, embedAtom);

    if (embed.status === EmbedStatus.Idle) {
        startEmbed();
    }

    return (
        <UploadCard
            radii="300"
            compact
            style={{ maxWidth: toRem(400), flexShrink: 0 }}
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
                    {embed.status == EmbedStatus.Loading &&
                        <>
                            <Box direction={"Row"}>
                                <Box style={{width: '30%'}}>
                                    <Image size={"fill"}/>
                                </Box>
                                <Box direction={"Column"} style={{width: '70%'}}>
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
                        <>
                            Failed to generate
                        </>
                    }


                </>
            }
        >
            <Text size="H6" truncate style={{ minWidth: 0, flexGrow: 1 }}>
                {url}
            </Text>
            {embed.status == EmbedStatus.Success &&
                sizedIcon(Check, '100', { style: { color: color.Success.Main } })}

            {embed.status == EmbedStatus.Error &&
                sizedIcon(X, '100', { style: { color: color.Critical.Main } })}
            <style>
                {`
                      @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                      }
                    `}
            </style>
            {(embed.status == EmbedStatus.Loading || embed.status == EmbedStatus.Idle) &&
                sizedIcon(CircleNotch, '100', { style: { color: color.Primary.Main, animation: "spin 1s infinite linear" }  })}
        </UploadCard>
    );
}