# https://github.com/PleahMaCaka/svelte-tauri-template/blob/a598c33a34489b07680e14bb0d82ac01b0a9a4be/flake.nix
{
  description = "sable dev environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay.url = "github:oxalica/rust-overlay";
    android-nixpkgs.url = "github:tadfisher/android-nixpkgs";
  };

  nixConfig = {
    bash-prompt = "\\[\\e[1;35m\\]sable\\[\\e[0m\\]"; # bold magenta
    bash-prompt-suffix = " \\[\\e[0;36m\\]>\\[\\e[0m\\] ";  # cyan >
  };

  outputs =
    {
      nixpkgs,
      flake-utils,
      rust-overlay,
      android-nixpkgs,
      ...
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [ rust-overlay.overlays.default ];
          config = {
            android_sdk.accept_license = true;
            allowUnfree = true;
          };
        };

        rust = pkgs.rust-bin.stable.latest.default.override {
          targets = [
            "aarch64-linux-android"
            "armv7-linux-androideabi"
            "i686-linux-android"
            "x86_64-linux-android"
          ];
        };

        androidSdk = android-nixpkgs.sdk.${system} (
          sdkPkgs: with sdkPkgs; [
            build-tools-34-0-0
            platforms-android-34
            ndk-26-1-10909125
            cmdline-tools-latest
            platform-tools
            emulator
          ]
        );

        baseShell = {
          nativeBuildInputs = with pkgs; [
            pkg-config
            gobject-introspection
            cargo
            cargo-tauri
            nodejs
            xdg-utils
            desktop-file-utils
          ];

          buildInputs = with pkgs; [
            at-spi2-atk
            atkmm
            cairo
            gdk-pixbuf
            glib
            glib-networking
            gtk3
            gsettings-desktop-schemas
            harfbuzz
            librsvg
            libsoup_3
            pango
            webkitgtk_4_1
            openssl
            libayatana-appindicator
            gst_all_1.gstreamer
            gst_all_1.gst-plugins-base
            gst_all_1.gst-plugins-good
            gst_all_1.gst-plugins-bad
            gst_all_1.gst-plugins-ugly
            gst_all_1.gst-libav
          ];

          packages = with pkgs; [
            coreutils
            nix
            pnpm
            rust
          ];

          shellHook = ''
            export XDG_DATA_DIRS="$GSETTINGS_SCHEMAS_PATH:$XDG_DATA_DIRS"
            export GIO_EXTRA_MODULES="${pkgs.glib-networking}/lib/gio/modules"
            export GST_PLUGIN_SYSTEM_PATH="${pkgs.gst_all_1.gst-plugins-base}/lib/gstreamer-1.0:${pkgs.gst_all_1.gst-plugins-good}/lib/gstreamer-1.0:${pkgs.gst_all_1.gst-plugins-bad}/lib/gstreamer-1.0"
            alias tauri="pnpm exec tauri"
            echo "Done! Now make sable stable :3";
          '';
        };
      in
      {
        devShells = {
          default = pkgs.mkShell {
            name = "sable dev environment";
            inherit (baseShell) nativeBuildInputs buildInputs packages shellHook;

            LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [
              pkgs.libayatana-appindicator
            ];
          };

          android = pkgs.mkShell {
            name = "sable dev environment (android)";
            inherit (baseShell) nativeBuildInputs buildInputs;  # <-- shellHook removed here

            packages = baseShell.packages ++ (with pkgs; [
              jdk
              androidSdk
            ]);

            shellHook = baseShell.shellHook + ''
              export NDK_HOME=${androidSdk}/share/android-sdk/ndk/26.1.10909125
              echo "Android SDK ready!";
            '';
          };
        };
      }
    );
}
