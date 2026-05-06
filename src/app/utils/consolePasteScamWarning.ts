// This is probably not very accurate, but doesn't really matter I suppose
function isDockedDevtoolsLikely(): boolean {
  const gapW = window.outerWidth - window.innerWidth;
  const gapH = window.outerHeight - window.innerHeight;
  const threshold = 160;
  return gapW >= threshold || gapH >= threshold;
}

export function installConsolePasteScamWarning(): void {
  const BANNER_STYLE =
    'font-size:56px;font-weight:900;color:#ff0033;background:#1a0006;padding:16px 24px;border:6px solid #ff0033;line-height:1.1;';
  const BODY_STYLE =
    'font-size:22px;font-weight:700;color:#ffb3c1;background:#120008;padding:14px 20px;line-height:1.35;max-width:920px;';
  const CONTRIBUTE_STYLE =
    'font-size:18px;font-weight:600;color:#a8d4ff;background:#0a1520;padding:12px 20px;line-height:1.35;max-width:920px;';

  const spamWarnings = () => {
    const repeat = 15;
    const betweenPairsMs = 300;

    const emitPair = (index: number) => {
      console.warn('%cSTOP', BANNER_STYLE);
      console.warn(
        '%cIf anyone told you to paste code or text here, you are being scammed. Close this window, do not paste anything, and report their account.',
        BODY_STYLE
      );
      if (index + 1 < repeat) {
        window.setTimeout(() => {
          emitPair(index + 1);
        }, betweenPairsMs);
      } else {
        window.setTimeout(() => {
          console.warn(
            "%cIf you know what you're doing, check out our GitHub and contribute: https://github.com/SableClient/Sable",
            CONTRIBUTE_STYLE
          );
        }, betweenPairsMs);
      }
    };

    emitPair(0);
  };

  let devtoolsWasOpen = false;

  const check = () => {
    const devtoolsLikelyOpen = isDockedDevtoolsLikely();
    if (devtoolsLikelyOpen && !devtoolsWasOpen) {
      spamWarnings();
    }
    devtoolsWasOpen = devtoolsLikelyOpen;
  };

  window.setInterval(check, 1500);
  window.addEventListener('resize', () => queueMicrotask(check));

  queueMicrotask(check);
}
