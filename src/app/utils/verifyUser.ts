import type { MatrixClient, Room, VerificationRequest } from '$types/matrix-sdk';
import { KnownMembership } from '$types/matrix-sdk';

/**
 * Find a DM room with a specific user.
 * A DM room is a room with exactly 2 joined members (us and the target user).
 */
function findDMWithUser(client: MatrixClient, userId: string): Room | undefined {
  const allRooms = Array.from(client.getRooms());

  return allRooms
    .filter((room: Room) => {
      if (room.getMyMembership() !== KnownMembership.Join) return false;

      const members = room.getJoinedMembers();
      if (members.length !== 2) return false;

      return members.some((m: { userId: string }) => m.userId === userId);
    })
    .sort((a: Room, b: Room) => {
      return (b.getLastActiveTimestamp() ?? 0) - (a.getLastActiveTimestamp() ?? 0);
    })[0];
}

/**
 * Start a user-to-user verification with the given user.
 *
 * This creates or finds a DM room and sends a verification request.
 * The returned VerificationRequest is used by the UI to track the verification state.
 *
 * @param client - The Matrix client
 * @param userId - The user ID to verify
 * @returns The VerificationRequest, or undefined if verification couldn't be started
 */
export async function verifyUser(
  client: MatrixClient,
  userId: string
): Promise<VerificationRequest | undefined> {
  const crypto = client.getCrypto();
  if (!crypto) {
    console.warn('Crypto not available');
    return undefined;
  }

  const myUserId = client.getUserId();

  // Don't verify ourselves
  if (userId === myUserId) return undefined;

  // Check if user has cross-signing keys
  const hasCrossSigning = await crypto.userHasCrossSigningKeys(userId, true);
  if (!hasCrossSigning) {
    console.warn(`User ${userId} does not have cross-signing keys`);
    return undefined;
  }

  // Check if user is already verified
  const userVerificationStatus = await crypto.getUserVerificationStatus(userId);
  if (userVerificationStatus?.isVerified()) {
    // User is already verified, nothing to do
    return undefined;
  }

  // Find or create a DM room
  const dmRoom = findDMWithUser(client, userId);

  // Check if there's already a pending verification request
  if (dmRoom) {
    const existingRequest = crypto.findVerificationRequestDMInProgress(dmRoom.roomId, userId);
    if (existingRequest) {
      // There's already a pending request, return it
      return existingRequest;
    }
  }

  // Start verification - this will create/find a DM and send a verification request
  const request = await crypto.requestVerificationDM(userId, dmRoom?.roomId);

  // The verification request will be received via CryptoEvent.VerificationRequestReceived
  // and handled by the existing verification hooks
  return request;
}
