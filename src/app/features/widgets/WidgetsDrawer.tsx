import type { FormEventHandler, MouseEventHandler } from 'react';
import { useEffect, useState } from 'react';
import {
  Box,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  MenuItem,
  Scroll,
  Text,
  Tooltip,
  TooltipProvider,
  config,
  Button,
  Line,
  toRem,
} from 'folds';
import type { Room } from '$types/matrix-sdk';

import { useMatrixClient } from '$hooks/useMatrixClient';
import type { RoomWidget } from '$hooks/useRoomWidgets';
import { useRoomWidgets, enrichWidgetUrl } from '$hooks/useRoomWidgets';
import { useSetSetting, useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { usePowerLevelsContext } from '$hooks/usePowerLevels';
import { useRoomCreators } from '$hooks/useRoomCreators';
import { useRoomPermissions } from '$hooks/useRoomPermissions';

import { createLogger } from '$utils/debug';
import { WidgetIframe } from './WidgetIframe';
import * as css from './WidgetsDrawer.css';
import { IntegrationManager } from './IntegrationManager';
import { CustomStateEvent } from '$types/matrix/room';
import { SidebarResizer } from '$pages/client/sidebar/SidebarResizer';
import { mobileOrTablet } from '$utils/user-agent';

type WidgetsDrawerHeaderProps = {
  activeWidget: RoomWidget | null;
  onBack: () => void;
};

const log = createLogger('WidgetsDrawer');

function WidgetDrawerHeader({ activeWidget, onBack }: WidgetsDrawerHeaderProps) {
  const setWidgetDrawer = useSetSetting(settingsAtom, 'isWidgetDrawer');

  return (
    <Header className={css.WidgetsDrawerHeader} variant="Background" size="600">
      <Box grow="Yes" alignItems="Center" gap="200">
        {activeWidget && (
          <Box shrink="No" alignItems="Center">
            <IconButton fill="None" onClick={onBack}>
              <Icon src={Icons.ArrowLeft} />
            </IconButton>
          </Box>
        )}
        <Box grow="Yes" alignItems="Center" gap="200">
          <Text size="H5" truncate>
            {activeWidget ? activeWidget.name || 'Widget' : 'Widgets'}
          </Text>
        </Box>
        <Box shrink="No" alignItems="Center">
          <TooltipProvider
            position="Bottom"
            align="End"
            offset={4}
            tooltip={
              <Tooltip>
                <Text>Close</Text>
              </Tooltip>
            }
          >
            {(triggerRef) => (
              <IconButton
                ref={triggerRef}
                variant="Background"
                onClick={() => setWidgetDrawer(false)}
              >
                <Icon src={Icons.Cross} />
              </IconButton>
            )}
          </TooltipProvider>
        </Box>
      </Box>
    </Header>
  );
}

type AddWidgetFormProps = {
  room: Room;
  onAdded: () => void;
};

function AddWidgetForm({ room, onAdded }: AddWidgetFormProps) {
  const mx = useMatrixClient();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;

    setAdding(true);
    try {
      const widgetId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      await mx.sendStateEvent(
        room.roomId,
        CustomStateEvent.RoomWidget,
        {
          type: 'm.custom',
          url: enrichWidgetUrl(url.trim()),
          name: name.trim(),
          id: widgetId,
          creatorUserId: mx.getUserId(),
        },
        widgetId
      );
      setName('');
      setUrl('');
      onAdded();
    } catch (err) {
      log.error('Failed to add widget:', err);
    } finally {
      setAdding(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Box className={css.AddWidgetForm} direction="Column" gap="200">
        <Text size="L400" priority="300">
          Add Widget
        </Text>
        <Input
          className={css.AddWidgetInput}
          size="300"
          placeholder="Widget Name"
          value={name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
        />
        <Input
          className={css.AddWidgetInput}
          size="300"
          placeholder="Widget URL (https://...)"
          value={url}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
        />
        <Button
          type="submit"
          size="300"
          variant="Primary"
          disabled={adding || !name.trim() || !url.trim()}
        >
          <Text size="B300">{adding ? 'Adding...' : 'Add Widget'}</Text>
        </Button>
      </Box>
    </form>
  );
}

type WidgetListItemProps = {
  widget: RoomWidget;
  onSelect: (widget: RoomWidget) => void;
  onRemove: (widget: RoomWidget) => void;
  canRemove: boolean;
};

function WidgetListItemView({ widget, onSelect, onRemove, canRemove }: WidgetListItemProps) {
  const handleRemove: MouseEventHandler<HTMLButtonElement> = (e) => {
    e.stopPropagation();
    onRemove(widget);
  };

  return (
    <MenuItem
      onClick={() => onSelect(widget)}
      size="300"
      radii="300"
      after={
        canRemove ? (
          <TooltipProvider
            position="Left"
            tooltip={
              <Tooltip>
                <Text>Remove Widget</Text>
              </Tooltip>
            }
          >
            {(triggerRef) => (
              <IconButton
                ref={triggerRef}
                size="300"
                variant="Critical"
                fill="None"
                onClick={handleRemove}
              >
                <Icon size="100" src={Icons.Delete} />
              </IconButton>
            )}
          </TooltipProvider>
        ) : undefined
      }
    >
      <Box grow="Yes" direction="Column">
        <Text size="T300" truncate>
          {widget.name || 'Unnamed Widget'}
        </Text>
        <Text size="T200" priority="300" truncate>
          {widget.type || 'm.custom'}
        </Text>
      </Box>
    </MenuItem>
  );
}

type WidgetsDrawerProps = {
  room: Room;
};

export function WidgetsDrawer({ room }: WidgetsDrawerProps) {
  const mx = useMatrixClient();
  const widgets = useRoomWidgets(room);
  const [activeWidget, setActiveWidget] = useState<RoomWidget | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showIntegrationManager, setShowIntegrationManager] = useState(false);

  const powerLevels = usePowerLevelsContext();
  const creators = useRoomCreators(room);
  const permissions = useRoomPermissions(creators, powerLevels);
  const canManageWidgets = permissions.stateEvent(CustomStateEvent.RoomWidget, mx.getSafeUserId());

  const [widgetSidebarWidth, setWidgetSidebarWidth] = useSetting(
    settingsAtom,
    'widgetSidebarWidth'
  );
  const [curWidth, setCurWidth] = useState(widgetSidebarWidth);
  useEffect(() => {
    setCurWidth(widgetSidebarWidth);
  }, [widgetSidebarWidth]);

  const handleRemoveWidget = async (widget: RoomWidget) => {
    try {
      await mx.sendStateEvent(room.roomId, CustomStateEvent.RoomWidget, {}, widget.id);
      if (activeWidget?.id === widget.id) {
        setActiveWidget(null);
      }
    } catch (err) {
      log.error('Failed to remove widget:', err);
    }
  };

  const handleBack = () => setActiveWidget(null);

  return (
    <Box
      className={css.WidgetsDrawer}
      shrink="No"
      direction="Column"
      style={{
        position: 'relative',
        width: !mobileOrTablet() ? toRem(curWidth) : 'inherit',
      }}
    >
      {!mobileOrTablet() && (
        <SidebarResizer
          setCurWidth={setCurWidth}
          sidebarWidth={widgetSidebarWidth}
          setSidebarWidth={setWidgetSidebarWidth}
          minValue={50}
          maxValue={1200}
          isReversed
        />
      )}
      <WidgetDrawerHeader activeWidget={activeWidget} onBack={handleBack} />
      {activeWidget ? (
        <Box className={css.WidgetIframeContainer} grow="Yes">
          <WidgetIframe key={activeWidget.id} widget={activeWidget} roomId={room.roomId} mx={mx} />
        </Box>
      ) : (
        <Scroll variant="Background" visibility="Hover">
          <Box direction="Column" gap="100" style={{ padding: config.space.S200 }}>
            {widgets.length === 0 && !showAddForm && (
              <Box style={{ padding: config.space.S300 }}>
                <Text size="T300" priority="300">
                  No widgets in this room.
                </Text>
              </Box>
            )}
            {widgets.map((widget) => (
              <WidgetListItemView
                key={widget.id}
                widget={widget}
                onSelect={setActiveWidget}
                onRemove={handleRemoveWidget}
                canRemove={canManageWidgets}
              />
            ))}
            {canManageWidgets && (
              <>
                <Line variant="Surface" size="300" />
                {showAddForm ? (
                  <AddWidgetForm room={room} onAdded={() => setShowAddForm(false)} />
                ) : (
                  <Box
                    direction="Column"
                    gap="100"
                    style={{
                      padding: `${config.space.S100} ${config.space.S300}`,
                    }}
                  >
                    <Button
                      size="300"
                      variant="Primary"
                      fill="Soft"
                      onClick={() => setShowIntegrationManager(true)}
                      before={<Icon size="100" src={Icons.Category} />}
                    >
                      <Text size="B300">Integration Manager</Text>
                    </Button>
                    <Button
                      size="300"
                      variant="Secondary"
                      fill="Soft"
                      onClick={() => setShowAddForm(true)}
                      before={<Icon size="100" src={Icons.Plus} />}
                    >
                      <Text size="B300">Add Custom Widget</Text>
                    </Button>
                  </Box>
                )}
              </>
            )}
          </Box>
        </Scroll>
      )}
      <IntegrationManager
        room={room}
        open={showIntegrationManager}
        onClose={() => setShowIntegrationManager(false)}
      />
    </Box>
  );
}
