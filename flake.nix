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

          ### rust ###

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

          ### android ###

          platformVersion = "36";
          systemImageType = "default";
          androidEnv = pkgs.androidenv.override { licenseAccepted = true; };
          androidComp = (
            androidEnv.composeAndroidPackages {
              cmdLineToolsVersion = "8.0";
              includeNDK = true;
              ndkVersion = "29.0.14206865";
              buildToolsVersions = [ "35.0.0" ];

              platformVersions = [
                "35"
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
          android-sdk = androidComp.androidsdk;

          ### web ###

          packageJson = builtins.fromJSON (builtins.readFile ./package.json);

          nodejs = pkgs.nodejs_24;
          pnpm = pkgs.pnpm_10;
          # Keep in sync with package.json; currently 0.57.0.
          oxfmt =
            (builtins.getFlake "github:NixOS/nixpkgs/ede57125e7b774b47b6f98855a5c150a4b87b67f?narHash=sha256-wpyvzzT8H%2B8hQ3W4EyQraEbOXolQm91FqbF7OywX3fQ%3D")
            .legacyPackages.${system}.oxfmt;
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
              hash = "sha256-VLkFY25Lwr4YvhCN8UAkKib3Z1kaNXnPGM2eTc3izYI=";
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

          ### CEF ###

          cef = pkgs.cef-binary.override {
            version = "150.0.14";
            gitRevision = "7c1aa68";
            chromiumVersion = "150.0.7871.129";
            srcHashes = {
              x86_64-linux = "sha256-QO9hPkVcrNB6p8gfQl76qLb3frg/E8wo1HDuuk5h+Y8=";
            };
          };

          # fake archive json to prevent tauri from downloading cef again https://github.com/tauri-apps/cef-rs/issues/426
          fakeArchiveJson = pkgs.writeText "archive.json" (
            builtins.toJSON {
              name = cef.src.name;
              sha1 = "";
              type = "minimal";
            }
          );

          cefFlat = pkgs.symlinkJoin {
            name = "cef-${cef.version}-flat";
            paths = [
              "${cef}/${cef.buildType}"
              "${cef}/Resources"
            ];
            postBuild = ''
              ln -s ${cef}/libcef_dll "$out/"
              ln -s ${fakeArchiveJson} "$out/archive.json"
            '';
          };

          ### shells ###

          webPackages = [
            nodejs
            pnpm
            pkgs.oxlint
            oxfmt
            pkgs.knope
            pkgs.typescript
            pkgs.typescript-language-server
            pkgs.nixd
            pkgs.mise
          ];

          libayatana-appindicator = pkgs.libayatana-appindicator.overrideAttrs (old: {
            postFixup = (old.postFixup or "") + ''
              substituteInPlace "$dev/lib/pkgconfig/ayatana-appindicator3-0.1.pc" \
                --replace-fail "Requires:" "Requires.private:"
            '';
          });

          linuxDesktopBuildInputs = with pkgs; [
            at-spi2-atk
            atkmm
            cairo
            dbus
            dbus.dev
            gdk-pixbuf
            glib
            glib-networking
            gsettings-desktop-schemas
            gtk3
            harfbuzz
            libayatana-appindicator
            librsvg
            libsoup_3
            openssl
            pango
            webkitgtk_4_1
          ];

          linuxRuntimeLibs = with pkgs; [
            libGL
            libpulseaudio
            libxkbcommon
            pipewire
          ];

          gstPlugins = with pkgs.gst_all_1; [
            gstreamer
            gst-plugins-base
            gst-plugins-good
            gst-plugins-bad
            gst-plugins-ugly
            gst-libav
          ];

        in
        {
          treefmt = {
            projectRootFile = "flake.nix";
            programs = {
              nixfmt.enable = true;
              oxfmt = {
                enable = true;
                package = oxfmt;
              };
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

          packages = {
            sable = pkgs.stdenv.mkDerivation (finalAttrs: {
              pname = "sable";
              inherit (packageJson) version;
              src = lib.cleanSource ./.;

              pnpmInstallFlags = [ "--ignore-scripts" ];

              pnpmDeps = mkPnpmDeps {
                inherit (finalAttrs) src version pnpmInstallFlags;
              };

              nativeBuildInputs = pnpmNativeBuildInputs;

              env.VITE_BUILD_HASH = inputs.self.shortRev or inputs.self.dirtyShortRev or "";
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

            default = config.packages.sable;

            android-emulator = androidEnv.emulateApp {
              name = "emulate-sable";
              platformVersion = platformVersion;
              abiVersion = "x86_64"; # arm64-v8a
              systemImageType = systemImageType;
            };
          };

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
              packages = webPackages;
            };

            desktop = pkgs.mkShell {
              packages = webPackages ++ [
                rust
                pkgs.cargo-tauri
                pkgs.desktop-file-utils
                pkgs.pkg-config
                pkgs.xdg-utils
              ];

              buildInputs = linuxDesktopBuildInputs;

              CEF_PATH = "${cefFlat}";
              GIO_EXTRA_MODULES = "${pkgs.glib-networking}/lib/gio/modules";
              GDK_PIXBUF_MODULE_FILE = "${pkgs.librsvg}/lib/gdk-pixbuf-2.0/2.10.0/loaders.cache";
              GST_PLUGIN_SYSTEM_PATH_1_0 = lib.makeSearchPathOutput "lib" "lib/gstreamer-1.0" gstPlugins;
              LD_LIBRARY_PATH = lib.concatStringsSep ":" [
                (lib.makeLibraryPath (linuxRuntimeLibs ++ linuxDesktopBuildInputs))
                "${pkgs.addDriverRunpath.driverLink}/lib"
                "${cefFlat}"
              ];
              RUST_SRC_PATH = "${pkgs.rust.packages.stable.rustPlatform.rustLibSrc}";
            };

            android = pkgs.mkShell rec {
              packages = webPackages ++ [
                rust
                pkgs.cargo-tauri
                pkgs.pkg-config
                android-sdk
                pkgs.jdk
              ];

              ANDROID_HOME = "${androidComp.androidsdk}/libexec/android-sdk";
              ANDROID_SDK_ROOT = "${androidComp.androidsdk}/libexec/android-sdk";
              ANDROID_NDK_ROOT = "${androidComp.androidsdk}/libexec/android-sdk/ndk-bundle";

              GRADLE_OPTS = "-Dorg.gradle.project.android.aapt2FromMavenOverride=${ANDROID_SDK_ROOT}/build-tools/35.0.0/aapt2";

              RUST_SRC_PATH = "${pkgs.rust.packages.stable.rustPlatform.rustLibSrc}";
            };
          };
        };
    };
}
