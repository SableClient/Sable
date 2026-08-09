# SPDX-License-Identifier: AGPL-3.0
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    git-hooks.url = "github:cachix/git-hooks.nix";
    git-hooks.inputs.nixpkgs.follows = "nixpkgs";
    treefmt-nix.url = "github:numtide/treefmt-nix";
    treefmt-nix.inputs.nixpkgs.follows = "nixpkgs";
    fenix = {
      url = "github:nix-community/fenix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      imports = [
        inputs.git-hooks.flakeModule
        inputs.treefmt-nix.flakeModule
      ];

      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      perSystem =
        {
          inputs',
          config,
          system,
          lib,
          ...
        }:
        let
          pkgs = import inputs.nixpkgs {
            inherit system;

            config = {
              allowUnfree = true;
              android_sdk.accept_license = true;
            };
          };

          rust = (
            with inputs'.fenix.packages;
            combine [
              stable.toolchain
              targets.aarch64-linux-android.stable.rust-std
              targets.x86_64-linux-android.stable.rust-std
              targets.armv7-linux-androideabi.stable.rust-std
              targets.i686-linux-android.stable.rust-std
            ]
          );

          platformVersion = "36";
          systemImageType = "default";
          currentPath = builtins.getEnv "PWD";
          androidEnv = pkgs.androidenv.override { licenseAccepted = true; };
          androidComp = (
            androidEnv.composeAndroidPackages {
              cmdLineToolsVersion = "8.0";
              includeNDK = true;
              buildToolsVersions = [ "35.0.0" ];

              platformVersions = [
                "30"
                platformVersion
              ];
              includeEmulator = true;
              includeSystemImages = true;
              systemImageTypes = [
                systemImageType
              ];
              abiVersions = [
                "x86"
                "x86_64"
                "armeabi-v7a"
                "arm64-v8a"
              ];
              cmakeVersions = [ "3.10.2" ];
            }
          );
          android-sdk = pkgs.android-studio.withSdk androidComp.androidsdk;

          self = inputs.self;

          packageJson = builtins.fromJSON (builtins.readFile ./package.json);

          nodejs = pkgs.nodejs_24;
          pnpm = pkgs.pnpm_10;
          pnpmConfigHook = pkgs.pnpmConfigHook.override { inherit pnpm; };

          pnpmNativeBuildInputs = [
            pkgs.pkg-config
            nodejs
            pnpm
            pnpmConfigHook
          ];

          mkPnpmDeps =
            {
              src,
              version,
              pnpmInstallFlags,
            }:
            pkgs.fetchPnpmDeps {
              inherit
                pnpm
                src
                version
                pnpmInstallFlags
                ;
              pname = "sable";
              fetcherVersion = 3;
              hash = "sha256-3gyZjFPRZpDDzyX7LcAYW6IvSwluvZYhOdRqNCYN4Ow=";
            };

          mkPnpmCheck =
            name: script:
            pkgs.stdenv.mkDerivation (finalAttrs: {
              pname = "sable-${name}";
              inherit (packageJson) version;
              src = lib.cleanSource ./.;

              pnpmInstallFlags = [ "--ignore-scripts" ];

              pnpmDeps = mkPnpmDeps {
                inherit (finalAttrs) src version pnpmInstallFlags;
              };

              nativeBuildInputs = pnpmNativeBuildInputs;

              buildPhase = ''
                runHook preBuild
                pnpm run ${script}
                runHook postBuild
              '';

              installPhase = ''
                runHook preInstall
                touch $out
                runHook postInstall
              '';

              doCheck = false;
            });

          nativeBuildInputs = with pkgs; [
            pkg-config
            gobject-introspection
            cargo
            cargo-tauri
            nodejs
            xdg-utils
            desktop-file-utils
            wrapGAppsHook3
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
            dbus
            dbus.dev
            libayatana-appindicator
            gst_all_1.gstreamer
            gst_all_1.gst-plugins-base
            gst_all_1.gst-plugins-good
            gst_all_1.gst-plugins-bad
            gst_all_1.gst-plugins-ugly
            gst_all_1.gst-libav
            android-sdk
          ];

          defaultPackages = [
            nodejs
            pnpm
            rust
            pkgs.cargo
            pkgs.cargo-tauri
            pkgs.corepack
            pkgs.vitejs
            pkgs.oxlint
            pkgs.oxfmt
            pkgs.knope
            pkgs.typescript
            pkgs.typescript-language-server
            pkgs.nil
            pkgs.nixd
            pkgs.jdk
          ];
        in
        {
          treefmt = {
            projectRootFile = "flake.nix";
            programs = {
              nixfmt.enable = true;
              oxfmt.enable = true;
            };
            settings.global.excludes = [
              "dist"
              "node_modules"
              "pnpm-lock.yaml"
              "pnpm-workspace.yaml"
              "package.json"
              "LICENSE"
              "CHANGELOG.md"
              "./changeset"
            ];
          };
          pre-commit.settings.hooks = {
            treefmt = {
              enable = true;
              package = config.treefmt.build.wrapper;
            };
          };

          packages.sable = pkgs.stdenv.mkDerivation (finalAttrs: {
            pname = "sable";
            inherit (packageJson) version;
            src = lib.cleanSource ./.;

            # ignoring knope for building
            pnpmInstallFlags = [ "--ignore-scripts" ];

            pnpmDeps = mkPnpmDeps {
              inherit (finalAttrs) src version pnpmInstallFlags;
            };

            nativeBuildInputs = pnpmNativeBuildInputs;

            env.VITE_BUILD_HASH = self.shortRev or self.dirtyShortRev or "";
            env.SABLE_BUILD_FLAVOR = "stable";

            buildPhase = ''
              runHook preBuild
              pnpm run build
              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall
              cp -r dist $out
              runHook postInstall
            '';
          });

          packages.android-emulator = androidEnv.emulateApp {
            name = "emulate-sable";
            platformVersion = platformVersion;
            abiVersion = "x86_64"; # arm64-v8a
            systemImageType = systemImageType;
          };

          packages.default = config.packages.sable;

          checks = {
            build = config.packages.sable;
            lint = mkPnpmCheck "lint" "lint";
            fmt = mkPnpmCheck "fmt" "fmt:check";
            test = mkPnpmCheck "test" "test:run";
            typecheck = mkPnpmCheck "typecheck" "typecheck";
            knip = mkPnpmCheck "knip" "knip";
          };

          devShells = {
            default = pkgs.mkShell {
              inherit buildInputs nativeBuildInputs;

              packages = defaultPackages;

              LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath (nativeBuildInputs ++ buildInputs);

              GIO_EXTRA_MODULES = "${pkgs.glib-networking}/lib/gio/modules";
              GST_PLUGIN_SYSTEM_PATH = "${pkgs.gst_all_1.gst-plugins-base}/lib/gstreamer-1.0:${pkgs.gst_all_1.gst-plugins-good}/lib/gstreamer-1.0:${pkgs.gst_all_1.gst-plugins-bad}/lib/gstreamer-1.0";

              RUST_SRC_PATH = "${pkgs.rust.packages.stable.rustPlatform.rustLibSrc}";
            };

            android = pkgs.mkShell {
              inherit buildInputs nativeBuildInputs;

              packages = defaultPackages ++ [
                android-sdk
              ];

              LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath (nativeBuildInputs ++ buildInputs);

              ANDROID_HOME = "${androidComp.androidsdk}/libexec/android-sdk";
              ANDROID_SDK_ROOT = "${androidComp.androidsdk}/libexec/android-sdk";
              ANDROID_NDK_ROOT = "${androidComp.androidsdk}/libexec/android-sdk/ndk-bundle";

              GIO_EXTRA_MODULES = "${pkgs.glib-networking}/lib/gio/modules";
              GST_PLUGIN_SYSTEM_PATH = "${pkgs.gst_all_1.gst-plugins-base}/lib/gstreamer-1.0:${pkgs.gst_all_1.gst-plugins-good}/lib/gstreamer-1.0:${pkgs.gst_all_1.gst-plugins-bad}/lib/gstreamer-1.0";

              RUST_SRC_PATH = "${pkgs.rust.packages.stable.rustPlatform.rustLibSrc}";
            };
          };
        };
    };
}
