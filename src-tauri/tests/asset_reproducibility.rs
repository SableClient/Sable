use quote::ToTokens;
use std::path::PathBuf;
use tauri_codegen::embedded_assets::{AssetOptions, EmbeddedAssets};

fn generate(paths: Vec<PathBuf>) -> String {
    let options = AssetOptions::new(Default::default());
    EmbeddedAssets::new(paths, &options, |_, _, _, _| Ok(()))
        .unwrap()
        .into_token_stream()
        .to_string()
}

#[test]
fn embedded_assets_do_not_depend_on_collection_order() {
    let dir = tempfile::tempdir().unwrap();
    let assets_dir = dir.path().join("assets");
    let out_dir = dir.path().join("out");
    std::fs::create_dir(&assets_dir).unwrap();
    std::fs::create_dir(&out_dir).unwrap();
    std::env::set_var("OUT_DIR", &out_dir);

    let mut paths = Vec::new();
    for i in 0..16 {
        let script = assets_dir.join(format!("chunk-{i}.js"));
        std::fs::write(&script, format!("console.log({i});")).unwrap();
        paths.push(script);

        let locale = assets_dir.join(format!("locale-{i}.json"));
        std::fs::write(&locale, format!(r#"{{"locale":{i}}}"#)).unwrap();
        paths.push(locale);
    }

    let expected = generate(paths.clone());
    assert!(expected.contains("CspHash :: Script"));
    assert!(expected.contains("locale-0.json"));

    for _ in 0..32 {
        assert_eq!(generate(paths.clone()), expected);
    }

    paths.reverse();
    assert_eq!(generate(paths.clone()), expected);
    for _ in 0..paths.len() {
        paths.rotate_left(1);
        assert_eq!(generate(paths.clone()), expected);
    }
}
