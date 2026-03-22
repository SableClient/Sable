import {
  FormEventHandler,
  KeyboardEventHandler,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { MatrixError } from '$types/matrix-sdk';
import { Box, color, Input, Spinner, Text, toRem } from 'folds';
import { HashIcon } from '@phosphor-icons/react/dist/csr/Hash';
import { WarningIcon } from '@phosphor-icons/react/dist/csr/Warning';
import { isKeyHotkey } from 'is-hotkey';
import { getMxIdServer } from '$utils/matrix';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { replaceSpaceWithDash } from '$utils/common';
import { AsyncState, AsyncStatus, useAsync } from '$hooks/useAsyncCallback';
import { useDebounce } from '$hooks/useDebounce';
import { PhosphorIcon } from '$components/PhosphorIcon';

export function CreateRoomAliasInput({ disabled }: { disabled?: boolean }) {
  const mx = useMatrixClient();
  const aliasInputRef = useRef<HTMLInputElement>(null);
  const [aliasAvail, setAliasAvail] = useState<AsyncState<boolean, Error>>({
    status: AsyncStatus.Idle,
  });

  useEffect(() => {
    if (aliasAvail.status === AsyncStatus.Success && aliasInputRef.current?.value === '') {
      setAliasAvail({ status: AsyncStatus.Idle });
    }
  }, [aliasAvail]);

  const checkAliasAvail = useAsync(
    useCallback(
      async (aliasLocalPart: string) => {
        const roomAlias = `#${aliasLocalPart}:${getMxIdServer(mx.getSafeUserId())}`;
        try {
          const result = await mx.getRoomIdForAlias(roomAlias);
          return typeof result.room_id !== 'string';
        } catch (e) {
          if (e instanceof MatrixError && e.httpStatus === 404) {
            return true;
          }
          throw e;
        }
      },
      [mx]
    ),
    setAliasAvail
  );
  const aliasAvailable: boolean | undefined =
    aliasAvail.status === AsyncStatus.Success ? aliasAvail.data : undefined;

  const debounceCheckAliasAvail = useDebounce(checkAliasAvail, { wait: 500 });

  const handleAliasChange: FormEventHandler<HTMLInputElement> = (evt) => {
    const aliasInput = evt.currentTarget;
    const aliasLocalPart = replaceSpaceWithDash(aliasInput.value);
    if (aliasLocalPart) {
      aliasInput.value = aliasLocalPart;
      debounceCheckAliasAvail(aliasLocalPart);
    } else {
      setAliasAvail({ status: AsyncStatus.Idle });
    }
  };

  const handleAliasKeyDown: KeyboardEventHandler<HTMLInputElement> = (evt) => {
    if (isKeyHotkey('enter', evt)) {
      evt.preventDefault();

      const aliasInput = evt.currentTarget;
      const aliasLocalPart = replaceSpaceWithDash(aliasInput.value);
      if (aliasLocalPart) {
        checkAliasAvail(aliasLocalPart);
      } else {
        setAliasAvail({ status: AsyncStatus.Idle });
      }
    }
  };

  return (
    <Box shrink="No" direction="Column" gap="100">
      <Text size="L400">Address (Optional)</Text>
      <Text size="T200" priority="300">
        Pick an unique address to make it discoverable.
      </Text>
      <Input
        ref={aliasInputRef}
        onChange={handleAliasChange}
        before={
          aliasAvail.status === AsyncStatus.Loading ? (
            <Spinner size="100" variant="Secondary" />
          ) : (
            <PhosphorIcon size="100" as={HashIcon} />
          )
        }
        after={
          <Text style={{ maxWidth: toRem(150) }} truncate>
            :{getMxIdServer(mx.getSafeUserId())}
          </Text>
        }
        onKeyDown={handleAliasKeyDown}
        name="aliasInput"
        size="500"
        variant={aliasAvailable === true ? 'Success' : 'SurfaceVariant'}
        radii="400"
        autoComplete="off"
        disabled={disabled}
      />
      {aliasAvailable === false && (
        <Box style={{ color: color.Critical.Main }} alignItems="Center" gap="100">
          <PhosphorIcon as={WarningIcon} weight="fill" size="50" />
          <Text size="T200">
            <b>This address is already taken. Please select a different one.</b>
          </Text>
        </Box>
      )}
    </Box>
  );
}
