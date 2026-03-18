import { globalStyle } from '@vanilla-extract/css';

globalStyle(
  `
    button, 
    [role="button"], 
    [class*="Button"], 
    [class*="Chip"], 
    [class*="MenuItem"]
`,
  {
    transition: 'transform 0.1s ease-in-out, background-color 0.15s ease !important',
  }
);

globalStyle(
  `
    button:active, 
    [role="button"]:active, 
    [class*="Button"]:active, 
    [class*="Chip"]:active, 
    [class*="MenuItem"]:active
`,
  {
    transform: 'scale(0.96) !important',
  }
);

globalStyle(
  `
    button:hover:not([data-sidebar-item] button):not([data-sidebar-folder] button), 
    [role="button"]:hover:not([data-sidebar-item] [role="button"]):not([data-sidebar-folder] [role="button"])
`,
  {
    transform: 'translateY(-1px)',
  }
);

// :not here is a temporary way to sidestep this global imitation without affecting everything else.
globalStyle(
  `
    button[class*="_1684mq51"]:has(img):hover:not([data-sidebar-item] button),
    [data-index] [class*="_1r9nvaso"]:hover:not([data-sidebar-item] [class*="_1r9nvaso"]),
    [data-index] [class*="_1r9nvaso"] *:hover:not([data-sidebar-item] [class*="_1r9nvaso"] *),
    [data-index] button:has(p):hover:not([data-sidebar-item] button)
`,
  {
    transform: 'none !important',
  }
);
