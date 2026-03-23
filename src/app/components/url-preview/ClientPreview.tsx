import { ReactElement, useCallback, useEffect, useRef, useState } from 'react';
import { IPreviewUrlResponse } from '$types/matrix-sdk';
import {
	Box,
	Badge,
	Button,
	Icon,
	IconButton,
	Icons,
	Scroll,
	Spinner,
	Text,
	as,
	color,
	config,
	toRem,
} from 'folds';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { mxcUrlToHttp, downloadMedia } from '$utils/matrix';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import * as css from './UrlPreviewCard.css';
import { UrlPreview, UrlPreviewContent, UrlPreviewDescription } from './UrlPreview';
import { AudioContent, ImageContent, VideoContent } from '../message';
import { Image, MediaControl, Video } from '../media';
import { ImageViewer } from '../image-viewer';
import classNames from 'classnames';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import {
	Attachment,
	AttachmentBox,
	AttachmentContent,
	AttachmentHeader,
} from '../message/attachment';
import { encodeBlurHash } from '$utils/blurHash';
import { MATRIX_BLUR_HASH_PROPERTY_NAME } from '$types/matrix/common';

const linkStyles = { color: color.Success.Main };

interface OEmbed {
	type: 'photo' | 'video' | 'link' | 'rich';
	version: '1.0';
	title?: string;
	author_name?: string;
	author_url?: string;
	provider_name?: string;
	provider_url?: string;
	cache_age?: string;
	thumbnail_url?: string;
	thumbnail_width?: number;
	thumbnail_height?: number;
	url?: string;
	html?: string;
	width?: number;
	height?: number;
}

// const oEmbedProxy = 'http://localhost:3000/oembed';
async function oEmbedData(url: string): Promise<OEmbed> {
	const data = await fetch(false ? `${oEmbedProxy}/${encodeURIComponent(url)}` : url)
		.then((resp) => resp.json())
		.catch(() => console.error(`Unable to fetch oembed data for ${url}`));

	if (data?.html) data.html = preProcessHtml(data.html);

	return data;
}

const preProcessHtml = (html: string) => {
	const cssInjection = `
  <style>
  body { margin: 0; overflow: hidden; }
  iframe { width: 100% !important; height: 100% !important; border: none; }
  </style>
`;

	return cssInjection + html;
};

function oEmbedElement(
	data: OEmbed,
	loadFullPreview: boolean,
	setLoadFullPreview: any
): ReactElement {
	let innerContent;
	if (data.url) {
		innerContent = <img src={data.url} width={data.width ? data.width : 390} />;
	} else if (data.html) {
		const width: number = data.width
			? data.width
			: data.thumbnail_width
				? data.thumbnail_width
				: 640;
		const height: number = data.height
			? data.height
			: data.thumbnail_height
				? data.thumbnail_height
				: 390;

		innerContent = (
			<div
				style={{
					width: '100%',
					maxWidth: `${width}px`,
				}}
				onClick={() => setLoadFullPreview(true)}
			>
				{!loadFullPreview ? (
					<div
						style={{
							position: 'relative',
							width: 'fit-content',
							cursor: 'pointer',
						}}
					>
						{data.thumbnail_url ? (
							<img
								src={data.thumbnail_url}
								width={data.thumbnail_width}
								height={data.thumbnail_height}
							/>
						) : (
							<></>
						)}
					</div>
				) : (
					<iframe
						// sandbox="allow-scripts allow-popups allow-forms"
						security="restricted"
						srcDoc={preProcessHtml(data.html)}
						style={{ border: 'none', width: '100%', height: '100%' }}
					/>
				)}
			</div>
		);
	}

	return (
		<Box
			grow="Yes"
			direction="Column"
			style={{
				overflow: 'hidden',
				width: '100%',
			}}
		>
			{data.provider_name && data.provider_url ? (
				<Text
					style={linkStyles}
					truncate
					as="a"
					href={data.provider_url}
					target="_blank"
					rel="noreferrer"
					size="T200"
					priority="300"
				>
					{data.provider_name}
				</Text>
			) : (
				<></>
			)}
			{data.author_name && data.author_url ? (
				<Text
					style={linkStyles}
					truncate
					as="a"
					href={data.author_url}
					target="_blank"
					rel="noreferrer"
					size="T300"
					priority="300"
				>
					{data.author_name}
				</Text>
			) : (
				<></>
			)}
			{data.title ? (
				<Text size="T400" priority="300">
					{data.title}
				</Text>
			) : (
				<></>
			)}
			{innerContent}
		</Box>
	);
}

export type EmbedHeaderProps = {
	title: string;
	source: string;
	after?: ReactNode;
};
export const EmbedHeader = as<'div', EmbedHeaderProps>(({ title, source, after }, ref) => (
	<AttachmentHeader>
		<Box alignItems="Center" gap="200" grow="Yes">
			<Box shrink="No">
				<Badge style={{ maxWidth: toRem(100) }} variant="Secondary" radii="Pill">
					<Text size="O400" truncate>
						{source}
					</Text>
				</Badge>
			</Box>
			<Box grow="Yes">
				<Text size="T300" truncate>
					{title}
				</Text>
			</Box>
			{after}
		</Box>
	</AttachmentHeader>
));

type EmbedOpenButtonProps = {
	url: string;
};
export function EmbedOpenButton({ url }: EmbedOpenButtonProps) {
	return (
		<IconButton size="300" radii="300" onClick={() => window.open(url, '_blank')}>
			<Icon size="100" src={Icons.Link} />
		</IconButton>
	);
}

type YoutubeElementProps = {
	videoId: string;
	embedData: OEmbed;
	loadFullPreview: boolean;
	setLoadFullPreview: any;
};

export const YoutubeElement = as<'div', YoutubeElementProps>(
	({ videoId, embedData, loadFullPreview, setLoadFullPreview }, ref) => {
		const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
		const iframeSrc = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1`;

		const [blurHash, setBlurHash] = useState<string | undefined>();

		useEffect(() => {
			let img = document.createElement('img');
			img.crossOrigin = 'Anonymous';
			img.src = thumbnailUrl;
			img.onload = () => {
				const hash = encodeBlurHash(img, 32, 32);
				setBlurHash(hash);
			};
		}, []);

		return (
			<Attachment
				style={{
					flexGrow: 1,
					flexShrink: 0,
					width: '640px',
					height: '400px',
				}}
			>
				<AttachmentHeader>
					<EmbedHeader
						title={embedData.title}
						source="YOUTUBE"
						after={EmbedOpenButton({ url: `https://youtube.com/watch?v=${videoId}` })}
					/>
				</AttachmentHeader>
				<AttachmentBox
					style={{
						height: '100%',
						width: '100%',
					}}
				>
					<VideoContent
						body={embedData.title}
						url={`https://youtube.com/watch?v=${videoId}`}
						info={{
							thumbnail_info: { [MATRIX_BLUR_HASH_PROPERTY_NAME]: blurHash },
						}}
						renderThumbnail={() => <Image src={thumbnailUrl} />}
						renderVideo={({ onLoadedMetadata }) => {
							return (
								<iframe
									src={iframeSrc}
									title="YouTube embed"
									onLoad={onLoadedMetadata}
									allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
									referrerPolicy="strict-origin-when-cross-origin"
									width="640"
									height="360"
									allowFullScreen
								/>
							);
						}}
					/>
					{/*
				<div
					style={{
						width: '100%',
						aspectRatio: '16 / 9',
					}}
					onClick={() => setLoadFullPreview(true)}
				>
					{!loadFullPreview ? (
						<div style={{ position: 'relative', width: 'fit-content', cursor: 'pointer' }}>
							<Box
								className={classNames(css.AbsoluteContainer)}
								alignItems="Center"
								justifyContent="Center"
							>
								<Image
									src={thumbnail ?? undefined}
									alt="YouTube Thumbnail"
									style={{
										align: 'center',
										width: '100%',
										height: '100%',
										objectFit: 'contain',
									}}
								/>
							</Box>
							<Box className={css.AbsoluteContainer} alignItems="Center" justifyContent="Center">
								<Button
									variant="Secondary"
									fill="Solid"
									radii="300"
									size="300"
									onClick={() => setLoadFullPreview(true)}
									before={<Icon size="Inherit" src={Icons.Play} filled />}
								>
									<Text size="B300">Watch</Text>
								</Button>
							</Box>
						</div>
					) : (
						<iframe
							src={iframeSrc}
							title="YouTube embed"
							allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
							referrerPolicy="strict-origin-when-cross-origin"
							width="640"
							height="360"
							allowFullScreen
						/>
					)}
				</div>
   */}
				</AttachmentBox>
			</Attachment>
		);
	}
);

const youtubeUrl = (url: string) => url.match(/(https:\/\/)(www\.|m\.|)(youtube\.com|youtu\.be)\//);

export const ClientPreview = as<'div', { url: string }>(({ url, ...props }, ref) => {
	const [loadFullPreview, setLoadFullPreview] = useState(false);
	const [showYoutube] = useSetting(settingsAtom, 'clientPreviewYoutube');
	const [showOEmbed] = useSetting(settingsAtom, 'clientPreviewOEmbed');

	const isYoutube = youtubeUrl(url);
	// const urlMatch = ;
	const videoId = isYoutube ? url.match(/(?:shorts\/|watch\?v=|youtu\.be\/)(.{11})/)?.[1] : null;

	const fetchUrl =
		isYoutube && videoId
			? `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://youtube.com/watch?v=${videoId}`)}`
			: url;

	const [embedStatus, loadEmbed] = useAsyncCallback(
		useCallback(() => {
			return oEmbedData(fetchUrl);
		}, [fetchUrl])
	);

	useEffect(() => {
		const fetchYoutube = isYoutube && showYoutube;
		const fetchOEmbed = showOEmbed;

		if (fetchYoutube || fetchOEmbed) loadEmbed();
	}, [fetchUrl, loadEmbed]);

	let previewContent;

	if (isYoutube && videoId) {
		if (showYoutube) {
			if (embedStatus.status === AsyncStatus.Error) return null;

			if (embedStatus.status === AsyncStatus.Success) {
				previewContent = embedStatus.data ? (
					<YoutubeElement
						videoId={videoId}
						embedData={embedStatus.data}
						loadFullPreview={loadFullPreview}
						setLoadFullPreview={setLoadFullPreview}
					/>
				) : (
					<UrlPreviewContent>
						<Text
							style={linkStyles}
							truncate
							as="a"
							href={url}
							target="_blank"
							rel="noreferrer"
							size="T200"
							priority="300"
						>
							{decodeURIComponent(url)}
						</Text>
					</UrlPreviewContent>
				);
			} else {
				previewContent = (
					<Box grow="Yes" alignItems="Center" justifyContent="Center">
						<Spinner variant="Secondary" size="400" />
					</Box>
				);
			}
		} else {
			previewContent = <Text size="L400">YouTube previews disabled</Text>;
		}
	} else {
		if (showOEmbed) {
			// generic oembed
			if (embedStatus.status === AsyncStatus.Error) return null;

			if (embedStatus.status === AsyncStatus.Success) {
				previewContent = embedStatus.data ? (
					oEmbedElement(embedStatus.data, loadFullPreview, setLoadFullPreview)
				) : (
					<UrlPreviewContent>
						<Text
							style={linkStyles}
							truncate
							as="a"
							href={url}
							target="_blank"
							rel="noreferrer"
							size="T200"
							priority="300"
						>
							{decodeURIComponent(url)}
						</Text>
					</UrlPreviewContent>
				);
			} else {
				previewContent = (
					<Box grow="Yes" alignItems="Center" justifyContent="Center">
						<Spinner variant="Secondary" size="400" />
					</Box>
				);
			}
		} else {
			previewContent = <Text size="L400">Generic previews disabled</Text>;
		}
	}

	return (
		<UrlPreview
			{...props}
			ref={ref}
			style={{
				background: 'transparent',
				border: 'none',
				padding: 0,
				boxShadow: 'none',
				display: 'inline-block',
				verticalAlign: 'middle',
				width: 'max-content',
				minWidth: 0,
				maxWidth: '100%',
				margin: 0,
			}}
		>
			{previewContent}
		</UrlPreview>
	);
});
