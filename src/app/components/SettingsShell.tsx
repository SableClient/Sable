import type { ComponentType, JSX, ReactNode } from 'react';
import type { IconProps } from '@phosphor-icons/react';
import { Box, config, IconButton, MenuItem, Text } from 'folds';
import { PageNav, PageNavContent, PageNavHeader, PageRoot } from '$components/page';
import { SettingsSectionHeader } from '$components/page/style.css';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { composerIcon, settingsNavIcon, X } from '$components/icons/phosphor';

type PhosphorIcon = ComponentType<IconProps>;

export type SectionDescriptor = {
  label: string;
  icon: PhosphorIcon;
  activeIcon?: PhosphorIcon;
  Component: (props: { requestBack?: () => void; requestClose: () => void }) => JSX.Element | null;
  visible?: boolean;
};

export type SettingsShellProps<Id extends string> = {
  sections: Record<Id, SectionDescriptor>;
  /** Ordered list of section ids for the menu (controls order and visibility filtering). */
  sectionIds: ReadonlyArray<Id>;
  active: Id | null;
  onSelect: (id: Id) => void;
  onBack?: () => void;
  requestClose: () => void;
  /** Render custom header content inside PageNavHeader. Receives a `closeButton` slot. */
  renderHeader?: (closeButton: ReactNode) => ReactNode;
  /** Render custom footer below the menu (inside the PageNav column). */
  footer?: ReactNode;
  searchBar?: ReactNode;
  searchResults?: ReactNode;
  /** Optional wrapper rendered around the entire component (e.g. SwipeableOverlayWrapper). */
  wrapper?: (children: ReactNode) => ReactNode;
  /** Wrap the section viewport content (e.g. SettingsLinkProvider). Receives the viewport element. */
  renderSection?: (viewport: ReactNode) => ReactNode;
  /** Show the close button next to header text? (Settings: only when no section active; RoomSettings: always on mobile). */
  showCloseInHeader?: boolean;
  /** Passed through to PageRoot. RoomSettings disables mobile drawer. */
  mobileDrawer?: boolean;
  /** Text size for menu item labels. Defaults to 'T300'. */
  menuItemTextSize?: 'T300' | 'T400';
  /** aria-label for the close button. Defaults to 'Close'. */
  closeButtonAriaLabel?: string;
};

function SectionViewport<Id extends string>({
  sectionId,
  sections,
  requestBack,
  requestClose,
}: {
  sectionId: Id;
  sections: Record<Id, SectionDescriptor>;
  requestBack?: () => void;
  requestClose: () => void;
}) {
  const Section = sections[sectionId].Component;
  return <Section requestBack={requestBack} requestClose={requestClose} />;
}

export function SettingsShell<Id extends string>({
  sections,
  sectionIds,
  active,
  onSelect,
  onBack,
  requestClose,
  renderHeader,
  footer,
  searchBar,
  searchResults,
  wrapper,
  renderSection,
  showCloseInHeader,
  mobileDrawer,
  menuItemTextSize = 'T300',
  closeButtonAriaLabel = 'Close',
}: SettingsShellProps<Id>) {
  const screenSize = useScreenSizeContext();

  const shouldShowSectionBack = active !== null && screenSize === ScreenSize.Mobile;
  const sectionRequestBack = shouldShowSectionBack ? (onBack ?? requestClose) : undefined;

  const visibleIds = sectionIds.filter((id) => sections[id].visible !== false);

  const closeButton = showCloseInHeader ? (
    <IconButton aria-label={closeButtonAriaLabel} onClick={requestClose} variant="Background">
      {composerIcon(X)}
    </IconButton>
  ) : null;

  const nav =
    screenSize === ScreenSize.Mobile && active !== null ? undefined : (
      <PageNav size="300">
        <PageNavHeader className={SettingsSectionHeader} size="600">
          {renderHeader ? (
            renderHeader(closeButton)
          ) : (
            <Box grow="Yes" gap="200">
              <Box grow="Yes" alignItems="Center" gap="200">
                <Text size="H4" truncate>
                  Settings
                </Text>
              </Box>
              <Box shrink="No">{closeButton}</Box>
            </Box>
          )}
        </PageNavHeader>
        <Box grow="Yes" direction="Column">
          {searchBar && (
            <Box style={{ padding: config.space.S200 }} shrink="No">
              {searchBar}
            </Box>
          )}
          <PageNavContent>
            <div style={{ flexGrow: 1 }}>
              {searchResults ??
                visibleIds.map((id) => {
                  const section = sections[id];
                  const isActive = active === id;
                  const IconComponent =
                    isActive && section.activeIcon ? section.activeIcon : section.icon;

                  return (
                    <MenuItem
                      key={id}
                      variant="Background"
                      radii="400"
                      aria-pressed={isActive}
                      before={settingsNavIcon(IconComponent, isActive)}
                      onClick={() => onSelect(id)}
                    >
                      <Text
                        style={{
                          fontWeight: isActive ? config.fontWeight.W600 : undefined,
                        }}
                        size={menuItemTextSize}
                        truncate
                      >
                        {section.label}
                      </Text>
                    </MenuItem>
                  );
                })}
            </div>
          </PageNavContent>
          {footer}
        </Box>
      </PageNav>
    );

  const content =
    active && sections[active] && sections[active].visible !== false ? (
      <SectionViewport
        sectionId={active}
        sections={sections}
        requestBack={sectionRequestBack}
        requestClose={requestClose}
      />
    ) : null;

  const pageRoot = (
    <PageRoot nav={nav} mobileDrawer={mobileDrawer}>
      {renderSection ? renderSection(content) : content}
    </PageRoot>
  );

  if (wrapper) {
    return <>{wrapper(pageRoot)}</>;
  }

  return pageRoot;
}
