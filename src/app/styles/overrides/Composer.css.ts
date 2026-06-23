import { style, globalStyle } from '@vanilla-extract/css';

export const floatingEditor = style({
  minWidth: '100%',
});

export const floatingToolbar = style({
  minWidth: '100%',
});

globalStyle(
  `
    ${floatingEditor} > div, 
    ${floatingEditor} [class*="Editor"], 
    ${floatingEditor} [role="textbox"]`,
  {
    backgroundColor: 'transparent',
    boxShadow: 'none',
    padding: '0 !important',
    color: 'var(--sable-primary-on-container)',
  }
);

globalStyle(`${floatingEditor} [class*="EditorTextarea"]`, {
  paddingTop: '13px !important',
});

globalStyle(`${floatingEditor} [class*="EditorPlaceholderTextVisual"]`, {
  paddingTop: '13px !important',
});

globalStyle(`${floatingEditor} ${floatingToolbar} button`, {
  borderRadius: '20px',
  backgroundColor: 'transparent',
  border: 'none',
  color: 'var(--sable-sec-on-container)',
  padding: '8px',
  cursor: 'pointer',
});

globalStyle(`${floatingEditor} ${floatingToolbar} button *`, {
  color: 'inherit',
});

globalStyle(`${floatingEditor} ${floatingToolbar} button:hover`, {
  backgroundColor: 'var(--sable-surface-container-hover)',
  color: 'var(--sable-primary-main)',
});
