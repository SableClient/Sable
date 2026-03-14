import { useEffect, useState, useCallback, useMemo, MouseEventHandler } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { Box, Text, Button, color, config, Badge, Menu, MenuItem, PopOut, RectCords } from 'folds';
import { SequenceCard } from '$components/sequence-card';

import { debugLoggerEnabledAtom, debugLogsAtom, clearDebugLogsAtom } from '$state/debugLogger';
import { LogEntry, getDebugLogger, LogLevel, LogCategory } from '$utils/debugLogger';
import { SequenceCardStyle } from '$features/settings/styles.css';

const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });
};

const getLevelColor = (level: string): string => {
  switch (level) {
    case 'error':
      return color.Critical.Main;
    case 'warn':
      return color.Warning.Main;
    case 'info':
      return color.Success.Main;
    default:
      return color.Secondary.Main;
  }
};

const getCategoryBadgeVariant = (
  category: string
): 'Primary' | 'Secondary' | 'Success' | 'Warning' | 'Critical' => {
  switch (category) {
    case 'error':
      return 'Critical';
    case 'sync':
      return 'Primary';
    case 'notification':
      return 'Success';
    case 'message':
      return 'Secondary';
    case 'call':
      return 'Warning';
    default:
      return 'Secondary';
  }
};

function LogEntryItem({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Box
      direction="Column"
      gap="100"
      style={{
        padding: config.space.S200,
        backgroundColor: color.Surface.Container,
        borderRadius: config.radii.R300,
        fontSize: '11px',
        fontFamily: 'monospace',
      }}
    >
      <Box gap="200" alignItems="Center" justifyContent="SpaceBetween">
        <Box gap="200" alignItems="Center">
          <Text
            size="T200"
            style={{
              color: getLevelColor(entry.level),
              fontWeight: 'bold',
              minWidth: '50px',
            }}
          >
            {entry.level.toUpperCase()}
          </Text>
          <Badge variant={getCategoryBadgeVariant(entry.category)} fill="Soft" size="300">
            <Text size="T200">{entry.category}</Text>
          </Badge>
          <Text size="T200" style={{ opacity: 0.6 }}>
            {formatTimestamp(entry.timestamp)}
          </Text>
          <Text size="T200" style={{ opacity: 0.8 }}>
            [{entry.namespace}]
          </Text>
        </Box>
        {entry.data != null && (
          <Button
            variant="Secondary"
            fill="None"
            size="300"
            radii="300"
            onClick={() => setExpanded(!expanded)}
          >
            <Text size="T200">{expanded ? 'Hide' : 'Show'} Data</Text>
          </Button>
        )}
      </Box>
      <Text size="T200" style={{ wordBreak: 'break-word' }}>
        {entry.message}
      </Text>
      {expanded && entry.data != null && (
        <Box
          direction="Column"
          style={{
            padding: config.space.S200,
            backgroundColor: color.Surface.ContainerActive,
            borderRadius: config.radii.R300,
            maxHeight: '200px',
            overflow: 'auto',
          }}
        >
          <Text
            as="pre"
            size="T200"
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
            }}
          >
            {JSON.stringify(entry.data, null, 2)}
          </Text>
        </Box>
      )}
    </Box>
  );
}

export function DebugLogViewer() {
  const [enabled, setEnabled] = useAtom(debugLoggerEnabledAtom);
  const logs = useAtomValue(debugLogsAtom);
  const clearLogs = useSetAtom(clearDebugLogsAtom);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useState<HTMLDivElement | null>(null)[0];
  const [filterLevel, setFilterLevel] = useState<LogLevel | 'all'>('all');
  const [filterCategory, setFilterCategory] = useState<LogCategory | 'all'>('all');
  const [categoryAnchor, setCategoryAnchor] = useState<RectCords | undefined>();
  const [levelAnchor, setLevelAnchor] = useState<RectCords | undefined>();

  const handleOpenCategoryMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    evt.stopPropagation();
    setCategoryAnchor(evt.currentTarget.getBoundingClientRect());
  };

  const handleOpenLevelMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    evt.stopPropagation();
    setLevelAnchor(evt.currentTarget.getBoundingClientRect());
  };

  // Filter logs based on current filters
  const filteredLogs = useMemo(() => {
    if (filterLevel === 'all' && filterCategory === 'all') {
      return logs;
    }

    const debugLogger = getDebugLogger();
    return debugLogger.getFilteredLogs({
      level: filterLevel !== 'all' ? filterLevel : undefined,
      category: filterCategory !== 'all' ? filterCategory : undefined,
    });
  }, [logs, filterLevel, filterCategory]);

  // Auto-refresh logs when new entries arrive
  useEffect(() => {
    if (!enabled) return undefined;

    const debugLogger = getDebugLogger();
    const unsubscribe = debugLogger.addListener(() => {
      // Trigger re-render by refreshing the atom
      // This will be handled by the debugLogsAtom's refresh mechanism
    });

    return unsubscribe;
  }, [enabled]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && scrollRef) {
      scrollRef.scrollTop = scrollRef.scrollHeight;
    }
  }, [filteredLogs, autoScroll, scrollRef]);

  const handleExportLogs = useCallback(
    (filtered: boolean) => {
      const debugLogger = getDebugLogger();
      let jsonData: string;

      if (filtered && (filterLevel !== 'all' || filterCategory !== 'all')) {
        // Export filtered logs
        const logsToExport = debugLogger.getFilteredLogs({
          level: filterLevel !== 'all' ? filterLevel : undefined,
          category: filterCategory !== 'all' ? filterCategory : undefined,
        });
        jsonData = JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            build: `v${APP_VERSION}${BUILD_HASH ? ` (${BUILD_HASH})` : ''}`,
            filters: {
              level: filterLevel !== 'all' ? filterLevel : 'none',
              category: filterCategory !== 'all' ? filterCategory : 'none',
            },
            logsCount: logsToExport.length,
            logs: logsToExport.map((log) => ({
              ...log,
              timestamp: new Date(log.timestamp).toISOString(),
            })),
          },
          null,
          2
        );
      } else {
        // Export all logs
        jsonData = debugLogger.exportLogs();
      }

      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const filterSuffix =
        filtered && (filterLevel !== 'all' || filterCategory !== 'all')
          ? `-${filterCategory !== 'all' ? filterCategory : 'all'}-${filterLevel !== 'all' ? filterLevel : 'all'}`
          : '';
      a.download = `sable-debug-logs${filterSuffix}-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [filterLevel, filterCategory]
  );

  const handleCopyToClipboard = useCallback(
    (filtered: boolean) => {
      const debugLogger = getDebugLogger();
      let jsonData: string;

      if (filtered && (filterLevel !== 'all' || filterCategory !== 'all')) {
        const logsToExport = debugLogger.getFilteredLogs({
          level: filterLevel !== 'all' ? filterLevel : undefined,
          category: filterCategory !== 'all' ? filterCategory : undefined,
        });
        jsonData = JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            build: `v${APP_VERSION}${BUILD_HASH ? ` (${BUILD_HASH})` : ''}`,
            filters: {
              level: filterLevel !== 'all' ? filterLevel : 'none',
              category: filterCategory !== 'all' ? filterCategory : 'none',
            },
            logsCount: logsToExport.length,
            logs: logsToExport.map((log) => ({
              ...log,
              timestamp: new Date(log.timestamp).toISOString(),
            })),
          },
          null,
          2
        );
      } else {
        jsonData = debugLogger.exportLogs();
      }

      navigator.clipboard.writeText(jsonData);
    },
    [filterLevel, filterCategory]
  );

  return (
    <Box direction="Column" gap="100">
      <Box style={{ display: 'flex', flexDirection: 'column', gap: config.space.S400 }}>
        <Box alignItems="Center" justifyContent="SpaceBetween">
          <Text size="L400">Debug Log Status</Text>
          <Badge variant={enabled ? 'Success' : 'Secondary'} fill="Solid">
            <Text size="B300">{enabled ? 'Active' : 'Inactive'}</Text>
          </Badge>
        </Box>

        <Text size="T300" style={{ opacity: 0.8 }}>
          Internal debug logging captures sync state, network events, notifications, messages,
          calls, UI component lifecycle, and timeline operations. Logs are stored in memory (max
          1000 entries) and cleared when you close the app.
        </Text>

        {/* Filter Controls */}
        <Box gap="200" alignItems="Center" style={{ flexWrap: 'wrap' }}>
          <Text size="T300" style={{ opacity: 0.8 }}>
            Filters:
          </Text>
          <PopOut
            anchor={categoryAnchor}
            offset={4}
            alignOffset={-4}
            position="Bottom"
            align="Start"
            content={
              <Menu>
                <MenuItem
                  size="300"
                  radii="300"
                  onClick={() => {
                    setFilterCategory('all');
                    setCategoryAnchor(undefined);
                  }}
                  disabled={filterCategory === 'all'}
                >
                  <Text size="T300">All Categories</Text>
                </MenuItem>
                <MenuItem
                  size="300"
                  radii="300"
                  onClick={() => {
                    setFilterCategory('sync');
                    setCategoryAnchor(undefined);
                  }}
                  disabled={filterCategory === 'sync'}
                >
                  <Text size="T300">Sync</Text>
                </MenuItem>
                <MenuItem
                  size="300"
                  radii="300"
                  onClick={() => {
                    setFilterCategory('network');
                    setCategoryAnchor(undefined);
                  }}
                  disabled={filterCategory === 'network'}
                >
                  <Text size="T300">Network</Text>
                </MenuItem>
                <MenuItem
                  size="300"
                  radii="300"
                  onClick={() => {
                    setFilterCategory('notification');
                    setCategoryAnchor(undefined);
                  }}
                  disabled={filterCategory === 'notification'}
                >
                  <Text size="T300">Notification</Text>
                </MenuItem>
                <MenuItem
                  size="300"
                  radii="300"
                  onClick={() => {
                    setFilterCategory('message');
                    setCategoryAnchor(undefined);
                  }}
                  disabled={filterCategory === 'message'}
                >
                  <Text size="T300">Message</Text>
                </MenuItem>
                <MenuItem
                  size="300"
                  radii="300"
                  onClick={() => {
                    setFilterCategory('call');
                    setCategoryAnchor(undefined);
                  }}
                  disabled={filterCategory === 'call'}
                >
                  <Text size="T300">Call</Text>
                </MenuItem>
                <MenuItem
                  size="300"
                  radii="300"
                  onClick={() => {
                    setFilterCategory('ui');
                    setCategoryAnchor(undefined);
                  }}
                  disabled={filterCategory === 'ui'}
                >
                  <Text size="T300">UI</Text>
                </MenuItem>
                <MenuItem
                  size="300"
                  radii="300"
                  onClick={() => {
                    setFilterCategory('timeline');
                    setCategoryAnchor(undefined);
                  }}
                  disabled={filterCategory === 'timeline'}
                >
                  <Text size="T300">Timeline</Text>
                </MenuItem>
                <MenuItem
                  size="300"
                  radii="300"
                  onClick={() => {
                    setFilterCategory('general');
                    setCategoryAnchor(undefined);
                  }}
                  disabled={filterCategory === 'general'}
                >
                  <Text size="T300">General</Text>
                </MenuItem>
                <MenuItem
                  size="300"
                  radii="300"
                  onClick={() => {
                    setFilterCategory('error');
                    setCategoryAnchor(undefined);
                  }}
                  disabled={filterCategory === 'error'}
                >
                  <Text size="T300">Error</Text>
                </MenuItem>
              </Menu>
            }
          >
            <Button
              onClick={handleOpenCategoryMenu}
              variant="Secondary"
              fill="Soft"
              size="300"
              radii="300"
            >
              <Text size="B300">Category: {filterCategory === 'all' ? 'All' : filterCategory}</Text>
            </Button>
          </PopOut>

          <PopOut
            anchor={levelAnchor}
            offset={4}
            alignOffset={-4}
            position="Bottom"
            align="Start"
            content={
              <Menu>
                <MenuItem
                  size="300"
                  radii="300"
                  onClick={() => {
                    setFilterLevel('all');
                    setLevelAnchor(undefined);
                  }}
                  disabled={filterLevel === 'all'}
                >
                  <Text size="T300">All Levels</Text>
                </MenuItem>
                <MenuItem
                  size="300"
                  radii="300"
                  onClick={() => {
                    setFilterLevel('debug');
                    setLevelAnchor(undefined);
                  }}
                  disabled={filterLevel === 'debug'}
                >
                  <Text size="T300">Debug</Text>
                </MenuItem>
                <MenuItem
                  size="300"
                  radii="300"
                  onClick={() => {
                    setFilterLevel('info');
                    setLevelAnchor(undefined);
                  }}
                  disabled={filterLevel === 'info'}
                >
                  <Text size="T300">Info</Text>
                </MenuItem>
                <MenuItem
                  size="300"
                  radii="300"
                  onClick={() => {
                    setFilterLevel('warn');
                    setLevelAnchor(undefined);
                  }}
                  disabled={filterLevel === 'warn'}
                >
                  <Text size="T300">Warning</Text>
                </MenuItem>
                <MenuItem
                  size="300"
                  radii="300"
                  onClick={() => {
                    setFilterLevel('error');
                    setLevelAnchor(undefined);
                  }}
                  disabled={filterLevel === 'error'}
                >
                  <Text size="T300">Error</Text>
                </MenuItem>
              </Menu>
            }
          >
            <Button
              onClick={handleOpenLevelMenu}
              variant="Secondary"
              fill="Soft"
              size="300"
              radii="300"
            >
              <Text size="B300">Level: {filterLevel === 'all' ? 'All' : filterLevel}</Text>
            </Button>
          </PopOut>

          {(filterLevel !== 'all' || filterCategory !== 'all') && (
            <Button
              variant="Secondary"
              fill="Soft"
              size="300"
              radii="300"
              onClick={() => {
                setFilterLevel('all');
                setFilterCategory('all');
              }}
            >
              <Text size="B300">Clear Filters</Text>
            </Button>
          )}
        </Box>

        <Box gap="200" style={{ flexWrap: 'wrap' }}>
          <Button
            variant={enabled ? 'Critical' : 'Success'}
            fill="Soft"
            size="300"
            radii="300"
            onClick={() => setEnabled(!enabled)}
          >
            <Text size="B300">{enabled ? 'Disable Logging' : 'Enable Logging'}</Text>
          </Button>
          <Button
            variant="Secondary"
            fill="Soft"
            size="300"
            radii="300"
            onClick={() => handleExportLogs(false)}
            disabled={logs.length === 0}
          >
            <Text size="B300">Export All</Text>
          </Button>
          <Button
            variant="Secondary"
            fill="Soft"
            size="300"
            radii="300"
            onClick={() => handleExportLogs(true)}
            disabled={filteredLogs.length === 0}
          >
            <Text size="B300">Export Filtered ({filteredLogs.length})</Text>
          </Button>
          <Button
            variant="Secondary"
            fill="Soft"
            size="300"
            radii="300"
            onClick={() => handleCopyToClipboard(true)}
            disabled={filteredLogs.length === 0}
          >
            <Text size="B300">Copy Filtered</Text>
          </Button>
          <Button
            variant="Critical"
            fill="Soft"
            size="300"
            radii="300"
            onClick={clearLogs}
            disabled={logs.length === 0}
          >
            <Text size="B300">Clear Logs ({logs.length})</Text>
          </Button>
        </Box>

        {enabled && (
          <SequenceCard
            className={SequenceCardStyle}
            variant="SurfaceVariant"
            direction="Column"
            gap="200"
          >
            <Box alignItems="Center" justifyContent="SpaceBetween">
              <Text size="L400">
                Recent Logs (
                {filterLevel !== 'all' || filterCategory !== 'all'
                  ? `${filteredLogs.length}/${logs.length}`
                  : `${logs.length}/1000`}
                )
              </Text>
              <Button
                variant="Secondary"
                fill="None"
                size="300"
                radii="300"
                onClick={() => setAutoScroll(!autoScroll)}
              >
                <Text size="T200">Auto-scroll: {autoScroll ? 'On' : 'Off'}</Text>
              </Button>
            </Box>

            <Box
              direction="Column"
              gap="200"
              style={{
                maxHeight: '500px',
                overflow: 'auto',
                padding: config.space.S200,
              }}
            >
              {filteredLogs.length === 0 ? (
                <Box
                  style={{
                    padding: config.space.S700,
                    textAlign: 'center',
                    opacity: 0.6,
                  }}
                >
                  <Text size="T300">
                    {logs.length === 0
                      ? 'No logs captured yet. Use the app to generate log entries.'
                      : 'No logs match the current filters.'}
                  </Text>
                </Box>
              ) : (
                filteredLogs.map((log) => (
                  <LogEntryItem key={`${log.timestamp}-${log.namespace}`} entry={log} />
                ))
              )}
            </Box>
          </SequenceCard>
        )}
      </Box>
    </Box>
  );
}
