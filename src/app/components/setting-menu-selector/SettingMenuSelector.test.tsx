import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SettingMenuSelector, type SettingMenuOption } from './SettingMenuSelector';

describe('SettingMenuSelector', () => {
  it('renders the selected label, opens the menu, and selects an option', () => {
    const onSelect = vi.fn<(value: 'light' | 'dark') => void>();
    const options: SettingMenuOption<'light' | 'dark'>[] = [
      { value: 'light', label: 'Light', description: 'Plain theme' },
      { value: 'dark', label: 'Dark', description: 'High contrast' },
    ];

    render(<SettingMenuSelector value="dark" options={options} onSelect={onSelect} />);

    expect(screen.getByRole('button', { name: 'Dark' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));

    expect(screen.getByText('Plain theme')).toBeInTheDocument();
    expect(screen.getByText('High contrast')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Light'));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith('light');
    expect(screen.queryByText('Plain theme')).not.toBeInTheDocument();
  });

  it('disables the trigger while loading', () => {
    const onSelect = vi.fn<() => void>();

    render(
      <SettingMenuSelector
        value="dark"
        loading
        options={[{ value: 'dark', label: 'Dark' }]}
        onSelect={onSelect}
      />
    );

    expect(screen.getByRole('button', { name: 'Dark' })).toBeDisabled();
  });

  it('supports custom trigger and option rendering', () => {
    const onSelect = vi.fn<(value: 'one' | 'two') => void>();
    const options: SettingMenuOption<'one' | 'two'>[] = [
      { value: 'one', label: 'One' },
      { value: 'two', label: 'Two' },
    ];

    render(
      <SettingMenuSelector
        value="one"
        options={options}
        onSelect={onSelect}
        renderTrigger={({ selectedOption, openMenu }) => (
          <button type="button" onClick={openMenu}>
            Pick {selectedOption.label}
          </button>
        )}
        renderOption={({ option, selected }) => <span aria-pressed={selected}>{option.label}</span>}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pick One' }));
    fireEvent.click(screen.getByText('Two'));

    expect(onSelect).toHaveBeenCalledWith('two');
  });
});
