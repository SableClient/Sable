use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    path::PathBuf,
};

use tauri::http::{header, response::Builder as ResponseBuilder, Response, StatusCode};

// WRY's Android adapter copies custom-protocol bodies into a JNI byte array, so range
// responses must stay bounded even when WebView asks for the rest of a large video.
pub(super) const MAX_RANGE_CHUNK: u64 = 2 * 1024 * 1024;

enum RangeSelection {
    Partial { start: u64, end: u64 },
    Ignore,
    Unsatisfiable,
}

pub(super) async fn read_full(body_path: PathBuf) -> Result<Vec<u8>, StatusCode> {
    tokio::task::spawn_blocking(move || fs::read(&body_path))
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub(super) async fn serve_range(
    body_path: PathBuf,
    content_type: String,
    range_header: String,
) -> Result<Response<Vec<u8>>, StatusCode> {
    tokio::task::spawn_blocking(move || {
        let mut file = fs::File::open(&body_path).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let total = file
            .metadata()
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .len();
        let (start, end) = match select_range(&range_header, total) {
            RangeSelection::Partial { start, end } => (start, end),
            RangeSelection::Ignore => {
                let mut body = Vec::new();
                file.read_to_end(&mut body)
                    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
                return Ok(ok_response(body, &content_type));
            }
            RangeSelection::Unsatisfiable => return Ok(range_not_satisfiable(total)),
        };
        let length = end - start + 1;
        let mut body = vec![0; length as usize];
        file.seek(SeekFrom::Start(start))
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        file.read_exact(&mut body)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        Ok(partial_response(body, &content_type, start, end, total))
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
}

pub(super) fn serve_range_memory(
    body: &[u8],
    content_type: &str,
    range_header: &str,
) -> Response<Vec<u8>> {
    let total = body.len() as u64;
    let (start, end) = match select_range(range_header, total) {
        RangeSelection::Partial { start, end } => (start, end),
        RangeSelection::Ignore => return ok_response(body.to_vec(), content_type),
        RangeSelection::Unsatisfiable => return range_not_satisfiable(total),
    };
    partial_response(
        body[start as usize..=end as usize].to_vec(),
        content_type,
        start,
        end,
        total,
    )
}

fn select_range(range_header: &str, total: u64) -> RangeSelection {
    if total == 0 {
        return RangeSelection::Unsatisfiable;
    }
    let Some(spec) = range_header.strip_prefix("bytes=") else {
        return RangeSelection::Unsatisfiable;
    };
    if spec.contains(',') {
        return RangeSelection::Ignore;
    }
    let Some((start, end)) = spec.trim().split_once('-') else {
        return RangeSelection::Unsatisfiable;
    };
    let (start, end) = if start.is_empty() {
        let Ok(suffix) = end.parse::<u64>() else {
            return RangeSelection::Unsatisfiable;
        };
        if suffix == 0 {
            return RangeSelection::Unsatisfiable;
        }
        let length = suffix.min(total).min(MAX_RANGE_CHUNK);
        (total - length, total - 1)
    } else {
        let Ok(start) = start.parse::<u64>() else {
            return RangeSelection::Unsatisfiable;
        };
        let requested_end = if end.is_empty() {
            total - 1
        } else {
            let Ok(end) = end.parse::<u64>() else {
                return RangeSelection::Unsatisfiable;
            };
            end.min(total - 1)
        };
        let end = requested_end.min(start.saturating_add(MAX_RANGE_CHUNK - 1));
        (start, end)
    };
    if start <= end && start < total {
        RangeSelection::Partial { start, end }
    } else {
        RangeSelection::Unsatisfiable
    }
}

// Shared response headers. Media is content-addressed and the URL is session-scoped, so
// it is safe to let the webview cache it as immutable and advertise byte-range support.
pub(super) fn media_response_builder(status: StatusCode, content_type: &str) -> ResponseBuilder {
    let cache_control = if content_type == "application/octet-stream" {
        "no-store"
    } else {
        "private, max-age=31536000, immutable"
    };
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CACHE_CONTROL, cache_control)
        .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        .header(
            header::CONTENT_SECURITY_POLICY,
            "sandbox; default-src 'none'; script-src 'none'; object-src 'none'",
        )
}

pub(super) fn ok_response(body: Vec<u8>, content_type: &str) -> Response<Vec<u8>> {
    let content_length = body.len();
    media_response_builder(StatusCode::OK, content_type)
        .header(header::CONTENT_LENGTH, content_length)
        .body(body)
        .expect("failed to build media response")
}

fn partial_response(
    body: Vec<u8>,
    content_type: &str,
    start: u64,
    end: u64,
    total: u64,
) -> Response<Vec<u8>> {
    let content_length = body.len();
    media_response_builder(StatusCode::PARTIAL_CONTENT, content_type)
        .header(header::CONTENT_LENGTH, content_length)
        .header(
            header::CONTENT_RANGE,
            format!("bytes {start}-{end}/{total}"),
        )
        .body(body)
        .expect("failed to build partial media response")
}

pub(super) fn range_not_satisfiable(total: u64) -> Response<Vec<u8>> {
    let mut response = error_response(StatusCode::RANGE_NOT_SATISFIABLE);
    let headers = response.headers_mut();
    headers.insert(
        header::CONTENT_RANGE,
        header::HeaderValue::from_str(&format!("bytes */{total}"))
            .expect("valid 416 content range"),
    );
    headers.insert(
        header::CONTENT_LENGTH,
        header::HeaderValue::from_static("0"),
    );
    headers.insert(
        header::ACCEPT_RANGES,
        header::HeaderValue::from_static("bytes"),
    );
    response
}

/// Sniff the MIME type from magic bytes when the registered one is missing or octet-stream.
/// Allowlisted so it can never name a scriptable type such as SVG or HTML.
pub(super) fn sniff_media_content_type(bytes: &[u8]) -> Option<&'static str> {
    const ALLOWED: [&str; 16] = [
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
        "image/avif",
        "video/mp4",
        "video/webm",
        "video/quicktime",
        "video/x-m4v",
        "audio/mpeg",
        "audio/m4a",
        "audio/ogg",
        "audio/opus",
        "audio/aac",
        "audio/x-flac",
        "audio/x-wav",
    ];
    infer::get(bytes)
        .filter(|kind| ALLOWED.contains(&kind.mime_type()))
        .map(|kind| kind.mime_type())
}

pub(super) fn session_unavailable_response() -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::SERVICE_UNAVAILABLE)
        .header(header::RETRY_AFTER, "1")
        .header(header::CACHE_CONTROL, "no-store")
        .body(Vec::new())
        .expect("failed to build 503 media response")
}

pub(super) fn error_response(status: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CACHE_CONTROL, "no-store")
        .body(Vec::new())
        .expect("failed to build media error response")
}

/// The app's own webview origins, which vary by platform and scheme.
pub(super) fn is_webview_origin(origin: &str) -> bool {
    matches!(
        origin,
        "tauri://localhost" | "http://tauri.localhost" | "https://tauri.localhost"
    ) || (cfg!(debug_assertions) && origin.starts_with("http://localhost:"))
}

/// Grants CORS only to our own webview. A request with no `Origin` (an `<img>`
/// load) is not a CORS request and needs no grant.
pub(super) fn apply_cors_headers(response: &mut Response<Vec<u8>>, request_origin: Option<&str>) {
    let Some(origin) = request_origin.filter(|origin| is_webview_origin(origin)) else {
        return;
    };
    let Ok(value) = header::HeaderValue::from_str(origin) else {
        return;
    };
    let headers = response.headers_mut();
    headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, value);
    // Responses are cached `immutable`, so the cache must key on Origin too.
    headers.insert(header::VARY, header::HeaderValue::from_static("Origin"));
}

#[cfg(test)]
mod tests {
    use std::{fs, sync::atomic::AtomicU64};

    use tauri::http::{header, StatusCode};

    use super::*;

    static TEST_CACHE_ID: AtomicU64 = AtomicU64::new(0);

    fn selected_range(range_header: &str, total: u64) -> Option<(u64, u64)> {
        match select_range(range_header, total) {
            RangeSelection::Partial { start, end } => Some((start, end)),
            _ => None,
        }
    }

    fn is_unsatisfiable(range_header: &str, total: u64) -> bool {
        matches!(
            select_range(range_header, total),
            RangeSelection::Unsatisfiable
        )
    }

    #[test]
    fn ok_response_has_content_length_and_cache_headers() {
        let response = ok_response(vec![0_u8; 42], "image/png");
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(header::CONTENT_LENGTH).unwrap(),
            "42"
        );
        assert_eq!(
            response.headers().get(header::CACHE_CONTROL).unwrap(),
            "private, max-age=31536000, immutable"
        );
        assert_eq!(
            response.headers().get(header::ACCEPT_RANGES).unwrap(),
            "bytes"
        );
    }

    #[test]
    fn select_range_supports_video_metadata_and_seek_requests() {
        assert_eq!(selected_range("bytes=0-499", 1000), Some((0, 499)));
        assert_eq!(selected_range("bytes=500-", 1000), Some((500, 999)));
        assert_eq!(selected_range("bytes=-200", 1000), Some((800, 999)));
        assert_eq!(selected_range("bytes=990-5000", 1000), Some((990, 999)));
    }

    #[test]
    fn open_ended_ranges_are_capped_from_the_requested_offset() {
        let total = MAX_RANGE_CHUNK * 2 + 100;
        assert_eq!(
            selected_range("bytes=0-", total),
            Some((0, MAX_RANGE_CHUNK - 1))
        );
        assert_eq!(
            selected_range(&format!("bytes={}-", MAX_RANGE_CHUNK), total),
            Some((MAX_RANGE_CHUNK, MAX_RANGE_CHUNK * 2 - 1))
        );
        assert_eq!(
            selected_range(&format!("bytes={}-", MAX_RANGE_CHUNK * 2), total),
            Some((MAX_RANGE_CHUNK * 2, total - 1))
        );
    }

    #[test]
    fn malformed_or_unsatisfiable_range_is_rejected() {
        for range in [
            "bytes=1000-1001",
            "bytes=500-400",
            "bytes=abc-def",
            "items=0-1",
        ] {
            assert!(is_unsatisfiable(range, 1000), "{range}");
        }
        assert!(is_unsatisfiable("bytes=0-0", 0));
    }

    #[test]
    fn multi_range_requests_fall_back_to_the_full_response() {
        let body = [1_u8, 2, 3];
        let response = serve_range_memory(&body, "video/mp4", "bytes=0-0,2-2");

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.body(), &body);
    }

    #[test]
    fn in_memory_ranges_are_partial_and_capped() {
        let body: Vec<u8> = (0..200u8).collect();
        let response = serve_range_memory(&body, "video/mp4", "bytes=10-19");
        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(response.body(), &body[10..=19]);
        assert_eq!(
            response.headers().get(header::CONTENT_RANGE).unwrap(),
            "bytes 10-19/200"
        );

        let body = vec![7_u8; (MAX_RANGE_CHUNK * 2) as usize];
        let response = serve_range_memory(&body, "video/mp4", "bytes=0-");
        assert_eq!(response.body().len() as u64, MAX_RANGE_CHUNK);
        assert_eq!(
            response
                .headers()
                .get(header::CONTENT_RANGE)
                .unwrap()
                .to_str()
                .unwrap(),
            format!("bytes 0-{}/{}", MAX_RANGE_CHUNK - 1, body.len())
        );

        let requested_suffix = MAX_RANGE_CHUNK + 100;
        let response =
            serve_range_memory(&body, "video/mp4", &format!("bytes=-{requested_suffix}"));
        assert_eq!(response.body().len() as u64, MAX_RANGE_CHUNK);
        let expected = format!(
            "bytes {}-{}/{}",
            body.len() as u64 - MAX_RANGE_CHUNK,
            body.len() - 1,
            body.len()
        );
        assert_eq!(
            response
                .headers()
                .get(header::CONTENT_RANGE)
                .unwrap()
                .to_str()
                .unwrap(),
            expected
        );
    }

    #[test]
    fn unsatisfiable_ranges_are_not_cacheable() {
        let response = range_not_satisfiable(1000);
        assert_eq!(response.status(), StatusCode::RANGE_NOT_SATISFIABLE);
        assert_eq!(
            response.headers().get(header::CONTENT_RANGE).unwrap(),
            "bytes */1000"
        );
        assert_eq!(
            response.headers().get(header::CACHE_CONTROL).unwrap(),
            "no-store"
        );
        assert_eq!(response.headers().get(header::CONTENT_LENGTH).unwrap(), "0");
    }

    #[test]
    fn partial_responses_include_webview_range_metadata() {
        let response = serve_range_memory(&[0_u8; 100], "video/mp4", "bytes=10-19");

        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "video/mp4"
        );
        assert_eq!(
            response.headers().get(header::CONTENT_LENGTH).unwrap(),
            "10"
        );
        assert_eq!(
            response.headers().get(header::CONTENT_RANGE).unwrap(),
            "bytes 10-19/100"
        );
        assert_eq!(
            response.headers().get(header::ACCEPT_RANGES).unwrap(),
            "bytes"
        );
    }

    #[tokio::test]
    async fn disk_range_reads_only_the_requested_cached_bytes() {
        let path = std::env::temp_dir().join(format!(
            "sable-media-range-test-{}-{}",
            std::process::id(),
            TEST_CACHE_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        let body: Vec<u8> = (0..200u8).collect();
        fs::write(&path, &body).unwrap();

        let response = serve_range(path.clone(), "video/mp4".into(), "bytes=10-19".into())
            .await
            .unwrap();
        fs::remove_file(path).ok();

        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(response.body(), &body[10..=19]);
    }

    #[test]
    fn sniff_detects_png() {
        let png_header = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        assert_eq!(sniff_media_content_type(&png_header), Some("image/png"));
    }

    #[test]
    fn sniff_rejects_unknown() {
        assert_eq!(sniff_media_content_type(&[0x00, 0x01, 0x02]), None);
    }

    #[test]
    fn sniff_detects_playable_video_and_audio() {
        // infer scans the first 256 bytes for the EBML DocType, so a stub header is not enough.
        let mut webm = [0_u8; 300];
        webm[..4].copy_from_slice(&[0x1A, 0x45, 0xDF, 0xA3]);
        webm[8..15].copy_from_slice(b"\x42\x82\x84webm");
        assert_eq!(sniff_media_content_type(&webm), Some("video/webm"));

        let mut mp4 = [0_u8; 12];
        mp4[4..].copy_from_slice(b"ftypisom");
        assert_eq!(sniff_media_content_type(&mp4), Some("video/mp4"));

        let flac = b"fLaC\x00\x00\x00\x22";
        assert_eq!(sniff_media_content_type(flac), Some("audio/x-flac"));
    }

    #[test]
    fn sniff_does_not_detect_svg() {
        let svg = b"<svg xmlns='http://www.w3.org/2000/svg'>";
        assert_eq!(sniff_media_content_type(svg), None);
    }

    #[test]
    fn octet_stream_response_is_not_cached_immutable() {
        let response = media_response_builder(StatusCode::OK, "application/octet-stream")
            .body(Vec::<u8>::new())
            .unwrap();
        assert_eq!(
            response.headers().get(header::CACHE_CONTROL).unwrap(),
            "no-store"
        );
    }

    #[test]
    fn cors_is_granted_only_to_the_apps_own_webview_origins() {
        for origin in [
            "tauri://localhost",
            "http://tauri.localhost",
            "https://tauri.localhost",
        ] {
            let mut response = ok_response(vec![0_u8; 4], "image/png");
            apply_cors_headers(&mut response, Some(origin));
            assert_eq!(
                response
                    .headers()
                    .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
                    .unwrap(),
                origin,
                "{origin} should be granted CORS"
            );
            assert_eq!(response.headers().get(header::VARY).unwrap(), "Origin");
        }
    }

    #[test]
    fn cors_is_denied_to_foreign_origins() {
        for origin in [
            "https://evil.example.org",
            "https://tauri.localhost.evil.example.org",
            "null",
        ] {
            let mut response = ok_response(vec![0_u8; 4], "image/png");
            apply_cors_headers(&mut response, Some(origin));
            assert!(
                !response
                    .headers()
                    .contains_key(header::ACCESS_CONTROL_ALLOW_ORIGIN),
                "{origin} must not be granted CORS"
            );
        }
    }

    #[test]
    fn requests_without_an_origin_get_no_cors_header() {
        let mut response = ok_response(vec![0_u8; 4], "image/png");
        apply_cors_headers(&mut response, None);
        assert!(!response
            .headers()
            .contains_key(header::ACCESS_CONTROL_ALLOW_ORIGIN));
    }

    #[test]
    fn error_responses_are_no_store() {
        for response in [
            error_response(StatusCode::UNAUTHORIZED),
            error_response(StatusCode::FORBIDDEN),
            session_unavailable_response(),
        ] {
            assert_eq!(
                response.headers().get(header::CACHE_CONTROL).unwrap(),
                "no-store"
            );
        }
    }

    #[test]
    fn image_response_is_cached_immutable() {
        let response = media_response_builder(StatusCode::OK, "image/png")
            .body(Vec::<u8>::new())
            .unwrap();
        assert_eq!(
            response.headers().get(header::CACHE_CONTROL).unwrap(),
            "private, max-age=31536000, immutable"
        );
    }
}
