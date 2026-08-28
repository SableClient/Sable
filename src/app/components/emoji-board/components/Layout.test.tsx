import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Base } from './styles.css';
import { EmojiBoardLayout } from './Layout';

const renderLayout = (props: Partial<Parameters<typeof EmojiBoardLayout>[0]> = {}) =>
  render(
    <EmojiBoardLayout data-testid="board" header={<div data-testid="header" />} {...props}>
      <div data-testid="body" />
    </EmojiBoardLayout>
  );

describe('EmojiBoardLayout', () => {
  // folds' `Line` is an unlabelled div, so the separator is counted positionally:
  // the board holds the main column, then the separator, then the sidebar.
  it('omits the sidebar separator when there is no sidebar', () => {
    // The GIF tab passes no sidebar, and a stray vertical rule showed up there.
    renderLayout();
    expect(screen.getByTestId('board').children).toHaveLength(1);
    expect(screen.queryByTestId('sidebar')).toBeNull();
  });

  it('renders a separator alongside a sidebar', () => {
    renderLayout({ sidebar: <div data-testid="sidebar" /> });
    expect(screen.getByTestId('board').children).toHaveLength(3);
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });

  it('treats full-viewport width and sheet presentation as independent', () => {
    const { rerender } = renderLayout({ isFullWidth: true });
    const widthOnly = screen.getByTestId('board').className;

    rerender(
      <EmojiBoardLayout data-testid="board" header={<div />} isFullWidth sheet>
        <div />
      </EmojiBoardLayout>
    );
    const widthAndSheet = screen.getByTestId('board').className;

    expect(widthOnly).toContain(Base({ isFullWidth: true }));
    expect(widthAndSheet).toContain(Base({ isFullWidth: true, sheet: true }));
    expect(widthOnly).not.toBe(widthAndSheet);
  });

  it('keeps the header and body wrappers so the scroll area can fill the sheet', () => {
    renderLayout({ sheet: true });
    expect(screen.getByTestId('header').parentElement?.className).toBeTruthy();
    expect(screen.getByTestId('body').parentElement?.className).toBeTruthy();
  });
});
