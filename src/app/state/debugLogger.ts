/**
 * Jotai atoms for debug logger state management
 */
import { atom } from 'jotai';
import { atomWithRefresh } from 'jotai/utils';
import { getDebugLogger } from '$utils/debugLogger';

const debugLogger = getDebugLogger();

/**
 * Atom for retrieving debug logs with refresh capability
 */
export const debugLogsAtom = atomWithRefresh(() => debugLogger.getLogs());

/**
 * Atom for enabling/disabling debug logging
 */
export const debugLoggerEnabledAtom = atom(
  debugLogger.isEnabled(),
  (get, set, enabled: boolean) => {
    debugLogger.setEnabled(enabled);
    set(debugLoggerEnabledAtom, enabled);
    set(debugLogsAtom);
  }
);

/**
 * Atom for filtered logs
 */
export const filteredDebugLogsAtom = atom((get) => get(debugLogsAtom));

/**
 * Action to clear all debug logs
 */
export const clearDebugLogsAtom = atom(null, (_, set) => {
  debugLogger.clear();
  set(debugLogsAtom);
});

/**
 * Action to export debug logs
 */
export const exportDebugLogsAtom = atom(null, () => debugLogger.exportLogs());
