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
    expect(tauriLib).toContain('.plugin(tauri_plugin_edge_to_edge::init())');
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
    expect(appTsx).toContain('<AppShell');
    expect(appTsx).toContain('screenSize={screenSize}');
    expect(appTsx).toContain('queryClient={queryClient}');
    expect(appShell).toContain('const [portalContainer, setPortalContainer] = useState');
    expect(appShell).toContain('onPortalContainerChange={setPortalContainer}');
    expect(appShell).toContain('function AppShellFrame');
    expect(appShell).toContain(
      '<SystemBarShell onPortalContainerChange={onPortalContainerChange}>'
    );
    expect(systemBarShell).toContain('ref={onPortalContainerChange}');
  });

  it('layers mobile sheets from the overlay stack rather than a fixed z-index', () => {
    const messageStyles = readWorkspaceFile('src/app/features/room/message/styles.css.ts');
    const sheet = readWorkspaceFile('src/app/components/MobileSwipeDownModal.tsx');

    expect(messageStyles).not.toContain('mobileSheetZIndex');
    expect(sheet).toContain('const zIndex = useOverlayLayer();');
    expect(sheet.match(/zIndex,/g)).toHaveLength(2);
  });

  it('falls back to the injected edge-to-edge inset before env() for the mobile sheet', () => {
    const messageStyles = readWorkspaceFile('src/app/features/room/message/styles.css.ts');

    expect(messageStyles).toContain(
      "'var(--mobile-sheet-safe-bottom, var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))'"
    );
    expect(messageStyles).not.toContain(
      "'var(--mobile-sheet-safe-bottom, env(safe-area-inset-bottom, 0px))'"
    );
  });

  it('uses the App shell as the only safe-area owner', () => {
    const appShell = readWorkspaceFile('src/app/components/app-shell/AppShell.tsx');
    const systemBarShell = readWorkspaceFile('src/app/components/app-shell/SystemBarShell.tsx');
    const mobileCapability = readWorkspaceFile('src-tauri/capabilities/mobile.json');

    expect(appShell).toContain(
      "const contentHeight = titlebarKind ? 'calc(100% - var(--tauri-titlebar-height))' : '100%';"
    );
    expect(appShell).toContain("height: '100%'");
    expect(appShell).toContain('height: contentHeight');
    expect(appShell).toContain('<ScreenSizeProvider value={screenSize}>');
    expect(systemBarShell).toContain('var(--safe-area-inset-top, env(safe-area-inset-top, 0px))');
    expect(systemBarShell).toContain(
      'var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))'
    );
    expect(systemBarShell).toContain('<SystemBarStrip\n        edge="top"');
    expect(systemBarShell).toContain(
      '{enabled && (\n        <SystemBarStrip\n          edge="bottom"'
    );
    expect(mobileCapability).toContain('"edge-to-edge:default"');
  });

  it('fills the full screen in standalone iOS PWAs unless the keyboard is open', () => {
    const indexCss = readWorkspaceFile('src/index.css');
    const indexTsx = readWorkspaceFile('src/index.tsx');
    const iosPwaViewport = readWorkspaceFile('src/app/utils/iosPwaViewport.ts');

    expect(indexCss).toContain('@media (display-mode: standalone)');
    expect(indexCss).toContain('@supports (-webkit-touch-callout: none)');
    expect(indexCss).toContain('var(--sable-ios-pwa-viewport-height, 100dvh)');
    expect(indexTsx).toContain('installIosPwaViewportHeight();');
    expect(iosPwaViewport).toContain("window.matchMedia('(display-mode: standalone)').matches");
    expect(iosPwaViewport).toContain('viewport.height + viewport.offsetTop');
    expect(iosPwaViewport).toContain('window.setTimeout(updateHeight, 350)');
    expect(iosPwaViewport).toContain('100vh');
    expect(iosPwaViewport).toContain('fullHeight');
    // Physical screen geometry reports device pixels and is wrong on iPad.
    expect(iosPwaViewport).not.toContain('window.screen');
    expect(iosPwaViewport).toContain('MIN_KEYBOARD_HEIGHT');
    expect(iosPwaViewport).toContain('isEditableFocused');
  });

  it('lets the android keyboard shrink the layout viewport', () => {
    const indexHtml = readWorkspaceFile('index.html');

    expect(indexHtml).toContain('interactive-widget=resizes-content');
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
      'src/app/components/global-banner/GlobalBannerRenderer.css.ts'
    );

    expect(notificationBannerStyles).toContain("position: 'fixed'");
    expect(notificationBannerStyles).toContain(
      "top: 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))'"
    );
    expect(telemetryBannerStyles).toContain("position: 'fixed'");
  });
});
