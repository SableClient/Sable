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

export const diagnosticCaptureActiveAtom = atom(
  debugLogger.isCaptureActive(),
  (_, set, active: boolean) => {
    if (active && !debugLogger.isCaptureActive()) debugLogger.startCapture();
    if (!active && debugLogger.isCaptureActive()) debugLogger.stopCapture();
    set(diagnosticCaptureActiveAtom, active);
    set(debugLogsAtom);
  }
);

/**
 * Action to clear all debug logs
 */
export const clearDebugLogsAtom = atom(null, (_, set) => {
  debugLogger.clear();
  set(debugLogsAtom);
});
