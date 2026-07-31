import type { IMegolmSessionData } from 'matrix-js-sdk/lib/@types/crypto';
import { createDebugLogger } from '$utils/debugLogger';
import { engineInvoke, type EngineIdentity } from './olmMachine/engineInvoke';

const migrationLog = createDebugLogger('rust-crypto-migration');

export type RoomKeySource = {
  exportRoomKeys: () => Promise<IMegolmSessionData[]>;
};

export type KeyHandoverResult = {
  exported: number;
  imported: number;
  batches: number;
};

export async function handOverRoomKeys(
  source: RoomKeySource,
  identity: EngineIdentity,
  options: { batchSize?: number } = {}
): Promise<KeyHandoverResult> {
  const batchSize = options.batchSize ?? 500;
  if (batchSize < 1) throw new Error('batchSize must be at least 1');

  const keys = await source.exportRoomKeys();
  let imported = 0;
  let batches = 0;

  for (let offset = 0; offset < keys.length; offset += batchSize) {
    const batch = keys.slice(offset, offset + batchSize);
    // eslint-disable-next-line no-await-in-loop
    const result = (await engineInvoke(identity, 'importExportedRoomKeys', {
      keys: JSON.stringify(batch),
    })) as { importedCount: number };
    imported += result.importedCount;
    batches += 1;
  }

  migrationLog.info(
    'general',
    `Handed over ${imported}/${keys.length} room keys in ${batches} batches`
  );

  return { exported: keys.length, imported, batches };
}
