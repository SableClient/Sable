import { verificationMethodIdentifierToMethod } from 'matrix-js-sdk/lib/rust-crypto/verification';
import type { RustCrypto } from 'matrix-js-sdk/lib/rust-crypto/rust-crypto';
import type { VerificationRequest } from '$types/matrix-sdk';
import type { OlmMachineProxy, StartedVerification } from './olmMachine/proxy';

type RustCryptoInternals = {
  // eslint-disable-next-line no-underscore-dangle
  _supportedVerificationMethods: string[];
  makeVerificationRequest: (request: unknown) => VerificationRequest;
  outgoingRequestProcessor: { makeOutgoingRequest: (request: unknown) => Promise<void> };
  sendVerificationRequestContent: (roomId: string, content: string) => Promise<string>;
};

const internals = (rustCrypto: RustCrypto): RustCryptoInternals =>
  rustCrypto as unknown as RustCryptoInternals;

export const installVerificationOverrides = (
  rustCrypto: RustCrypto,
  proxy: OlmMachineProxy
): void => {
  const inner = internals(rustCrypto);
  const methods = (): number[] =>
    // eslint-disable-next-line no-underscore-dangle
    inner._supportedVerificationMethods.map(verificationMethodIdentifierToMethod);

  const complete = async (started: StartedVerification): Promise<VerificationRequest> => {
    if (started.outgoingRequest) {
      await inner.outgoingRequestProcessor.makeOutgoingRequest(started.outgoingRequest);
    }
    return inner.makeVerificationRequest(started.request);
  };

  rustCrypto.requestDeviceVerification = async (userId, deviceId) =>
    complete(await proxy.requestDeviceVerification(userId, deviceId, methods()));

  rustCrypto.requestOwnUserVerification = async () =>
    complete(await proxy.requestOwnUserVerification(methods()));

  rustCrypto.requestVerificationDM = async (userId, roomId) => {
    const chosen = methods();
    const content = await proxy.verificationRequestContent(userId, roomId, chosen);
    const eventId = await inner.sendVerificationRequestContent(roomId, content);
    const started = await proxy.requestVerificationDm(userId, roomId, eventId, chosen);
    return inner.makeVerificationRequest(started.request);
  };
};
