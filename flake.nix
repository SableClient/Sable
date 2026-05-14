# SPDX-License-Identifier: AGPL-3.0
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    git-hooks.url = "github:cachix/git-hooks.nix";
    git-hooks.inputs.nixpkgs.follows = "nixpkgs";
    treefmt-nix.url = "github:numtide/treefmt-nix";
    treefmt-nix.inputs.nixpkgs.follows = "nixpkgs";
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
          config,
          pkgs,
          lib,
          ...
        }:
        let
          self = inputs.self;

          packageJson = builtins.fromJSON (builtins.readFile ./package.json);

          nodejs = pkgs.nodejs_24;
          pnpm = pkgs.pnpm_10;
          pnpmConfigHook = pkgs.pnpmConfigHook.override { inherit pnpm; };

          pnpmNativeBuildInputs = [
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
              hash = "sha256-IJrBo2/PsHiMBbN7eUu46U6V8flL9KYFDphz5cirfrU=";
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
            env.VITE_IS_RELEASE_TAG = "false";

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

          packages.default = config.packages.sable;

          checks = {
            build = config.packages.sable;
            lint = mkPnpmCheck "lint" "lint";
            fmt = mkPnpmCheck "fmt" "fmt:check";
            test = mkPnpmCheck "test" "test:run";
            typecheck = mkPnpmCheck "typecheck" "typecheck";
            knip = mkPnpmCheck "knip" "knip";
          };

          devShells.default = pkgs.mkShell {
            packages = [
              nodejs
              pnpm
              pkgs.corepack
              pkgs.vitejs
              pkgs.oxlint
              pkgs.oxfmt
              pkgs.knope
              pkgs.typescript
              pkgs.typescript-language-server
              pkgs.nil
              pkgs.nixd
            ];
            shellHook = config.pre-commit.installationScript;
          };
        };
    };
}
