/**
 * ThemeEngine — Pure DOM service (Clean Architecture).
 *
 * Responsible ONLY for writing/removing CSS custom properties on :root.
 */

export interface NeonGlassPrefs {
  primaryColor: string;
  blurRadius: number;
  bgOpacity: number;
  glowRadius: number;
  applySidebar: boolean;
  applyChat: boolean;
  applyModals: boolean;
  enableTransition?: boolean;
}

export const NEON_GLASS_DEFAULTS: NeonGlassPrefs = {
  primaryColor: '#00f0ff',
  blurRadius: 14,
  bgOpacity: 0.42,
  glowRadius: 12,
  applySidebar: true,
  applyChat: true,
  applyModals: true,
  enableTransition: true,
};

class ThemeEngineService {
  private transitionTimeout: NodeJS.Timeout | null = null;

  applyNeonGlass(prefs: Partial<NeonGlassPrefs>): void {
    try {
      const root = document.documentElement;
      const primary = this.sanitizeHexColor(prefs.primaryColor) ?? NEON_GLASS_DEFAULTS.primaryColor;
      const blur = this.sanitizeNumber(prefs.blurRadius, 0, 32) ?? NEON_GLASS_DEFAULTS.blurRadius;
      const opacity = this.sanitizeNumber(prefs.bgOpacity, 0.05, 1.0) ?? NEON_GLASS_DEFAULTS.bgOpacity;
      const glow = this.sanitizeNumber(prefs.glowRadius, 0, 30) ?? NEON_GLASS_DEFAULTS.glowRadius;
      const shouldTransition = prefs.enableTransition ?? NEON_GLASS_DEFAULTS.enableTransition;

      // Enable transition for smooth activation
      if (shouldTransition) {
        document.body.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
      }

      root.style.setProperty('--sable-primary-main', primary);
      root.style.setProperty('--sable-primary-on-main', '#ffffff');
      
      const rgb = this.hexToRgb(primary);
      if (rgb) root.style.setProperty('--sable-primary-main-rgb', rgb);

      root.style.setProperty('--ng-blur', `${blur}px`);
      root.style.setProperty('--ng-opacity', String(opacity));
      root.style.setProperty('--ng-glow', `0 0 ${glow}px ${primary}`);

      document.body.dataset.neonGlass = 'true';
      document.body.dataset.ngSidebar = String(prefs.applySidebar ?? NEON_GLASS_DEFAULTS.applySidebar);
      document.body.dataset.ngChat = String(prefs.applyChat ?? NEON_GLASS_DEFAULTS.applyChat);
      document.body.dataset.ngModals = String(prefs.applyModals ?? NEON_GLASS_DEFAULTS.applyModals);

      // Clean up transition after completion
      if (this.transitionTimeout) clearTimeout(this.transitionTimeout);
      this.transitionTimeout = setTimeout(() => {
        document.body.style.transition = '';
        this.transitionTimeout = null;
      }, 300);
    } catch (e) {
      console.error('[ThemeEngine] applyNeonGlass failed:', e);
    }
  }

  resetNeonGlass(): void {
    try {
      const root = document.documentElement;
      
      // Enable smooth transition for reset
      document.body.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

      root.style.removeProperty('--sable-primary-main');
      root.style.removeProperty('--sable-primary-on-main');
      root.style.removeProperty('--sable-primary-main-rgb');
      root.style.removeProperty('--ng-blur');
      root.style.removeProperty('--ng-opacity');
      root.style.removeProperty('--ng-glow');
      
      delete document.body.dataset.neonGlass;
      delete document.body.dataset.ngSidebar;
      delete document.body.dataset.ngChat;
      delete document.body.dataset.ngModals;

      // Clean up transition
      if (this.transitionTimeout) clearTimeout(this.transitionTimeout);
      this.transitionTimeout = setTimeout(() => {
        document.body.style.transition = '';
        this.transitionTimeout = null;
      }, 300);
    } catch (e) {
      console.error('[ThemeEngine] resetNeonGlass failed:', e);
    }
  }

  private sanitizeHexColor(val: unknown): string | null {
    if (typeof val !== 'string') return null;
    const t = val.trim();
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(t) ? t : null;
  }

  private sanitizeNumber(val: unknown, min: number, max: number): number | null {
    if (typeof val !== 'number' || !Number.isFinite(val)) return null;
    if (val < min || val > max) return null;
    return val;
  }

  private hexToRgb(hex: string): string | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? `${parseInt(result[1] as string, 16)}, ${parseInt(result[2] as string, 16)}, ${parseInt(result[3] as string, 16)}`
      : null;
  }
}

export const ThemeEngine = new ThemeEngineService();
