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
    [class*="Chip"]:active
`,
  {
    transform: 'scale(0.96) !important',
  }
);

globalStyle(
  `
    button:hover, 
    [role="button"]:hover
`,
  {
    transform: 'translateY(-1px)',
  }
);

globalStyle(
  `
    button[class*="_1684mq51"]:has(img):hover,
    [data-index] [class*="_1r9nvaso"]:hover,
    [data-index] [class*="_1r9nvaso"] *:hover,
    [data-index] button:has(p):hover
`,
  {
    transform: 'none !important',
  }
);
