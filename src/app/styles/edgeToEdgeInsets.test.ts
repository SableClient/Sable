import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDir = path.resolve(__dirname, '../../..');

const readWorkspaceFile = (relativePath: string): string =>
  fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

describe('android edge-to-edge inset contract', () => {
  it('wires the mobile edge-to-edge plugin through Cargo and Tauri setup', () => {
    const cargoToml = readWorkspaceFile('src-tauri/Cargo.toml');
    const tauriLib = readWorkspaceFile('src-tauri/src/lib.rs');

    expect(cargoToml).toContain(
      'tauri-plugin-edge-to-edge = { git = "https://github.com/SableClient/tauri-plugin-edge-to-edge.git", rev = "33c6116c27be28c06df5a9d02231ecc5fdeb93c5" }'
    );
    expect(tauriLib).toContain('builder = builder.plugin(tauri_plugin_edge_to_edge::init());');
  });

  it('keeps MainActivity out of the inset injection path', () => {
    const mainActivity = readWorkspaceFile(
      'src-tauri/gen/android/app/src/main/java/moe/sable/client/MainActivity.kt'
    );

    expect(mainActivity).toContain('enableEdgeToEdge()');
    expect(mainActivity).not.toContain('s.setProperty(');
    expect(mainActivity).not.toContain('setOnApplyWindowInsetsListener');
    expect(mainActivity).not.toContain('webView.webViewClient');
  });

  it('moves portal ownership into the app shell', () => {
    const indexHtml = readWorkspaceFile('index.html');
    const appTsx = readWorkspaceFile('src/app/pages/App.tsx');
    const appShell = readWorkspaceFile('src/app/components/app-shell/AppShell.tsx');
    const systemBarShell = readWorkspaceFile('src/app/components/app-shell/SystemBarShell.tsx');

    expect(indexHtml).not.toContain('id="portalContainer"');
    expect(appTsx).toContain('<AppShell screenSize={screenSize} queryClient={queryClient}>');
    expect(appShell).toContain('const [portalContainer, setPortalContainer] = useState');
    expect(appShell).toContain('<SystemBarShell onPortalContainerChange={setPortalContainer}>');
    expect(systemBarShell).toContain('ref={onPortalContainerChange}');
  });

  it('uses the App shell as the only safe-area owner', () => {
    const appShell = readWorkspaceFile('src/app/components/app-shell/AppShell.tsx');
    const systemBarShell = readWorkspaceFile('src/app/components/app-shell/SystemBarShell.tsx');
    const mobileCapability = readWorkspaceFile('src-tauri/capabilities/mobile.json');

    expect(appShell).toContain('const contentHeight = useCustomWindowsTitleBar');
    expect(appShell).toContain("height: '100%'");
    expect(appShell).toContain('height: contentHeight');
    expect(appShell).toContain('<ScreenSizeProvider value={screenSize}>');
    expect(systemBarShell).toContain('var(--safe-area-inset-top, env(safe-area-inset-top, 0px))');
    expect(systemBarShell).toContain(
      'var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))'
    );
    expect(systemBarShell).toContain('var(--sable-bg-container-line)');
    expect(systemBarShell).toContain("borderTop: '1px solid var(--sable-bg-container-line)'");
    expect(mobileCapability).toContain('"edge-to-edge:default"');
  });

  it('removes the scattered safe-area css consumers', () => {
    const indexCss = readWorkspaceFile('src/index.css');
    const pageStyles = readWorkspaceFile('src/app/components/page/style.css.ts');
    const sidebarStyles = readWorkspaceFile('src/app/components/sidebar/Sidebar.css.ts');
    const roomView = readWorkspaceFile('src/app/features/room/RoomView.tsx');
    const roomViewTypingStyles = readWorkspaceFile('src/app/features/room/RoomViewTyping.css.ts');
    const threadDrawerStyles = readWorkspaceFile('src/app/features/room/ThreadDrawer.css.ts');

    expect(indexCss).not.toContain('--sable-inset-top');
    expect(indexCss).not.toContain('--sable-inset-bottom');
    expect(pageStyles).not.toContain('--sable-inset-');
    expect(sidebarStyles).not.toContain('--sable-inset-');
    expect(roomView).not.toContain('--sable-inset-');
    expect(roomViewTypingStyles).not.toContain('--sable-inset-');
    expect(threadDrawerStyles).not.toContain('--sable-inset-');
  });

  it('keeps web banners viewport-anchored', () => {
    const notificationBannerStyles = readWorkspaceFile(
      'src/app/components/notification-banner/NotificationBanner.css.ts'
    );
    const telemetryBannerStyles = readWorkspaceFile(
      'src/app/components/telemetry-consent/TelemetryConsentBanner.css.ts'
    );

    expect(notificationBannerStyles).toContain("position: 'fixed'");
    expect(notificationBannerStyles).toContain("top: 'env(safe-area-inset-top, 0)'");
    expect(telemetryBannerStyles).toContain("position: 'fixed'");
    expect(telemetryBannerStyles).toContain("bottom: 'env(safe-area-inset-bottom, 0)'");
  });
});
