import { Box, color, Text } from 'folds';
import { WarningIcon } from '@phosphor-icons/react/dist/csr/Warning';
import { PhosphorIcon } from '$components/PhosphorIcon';

export function FieldError({ message }: { message: string }) {
  return (
    <Box style={{ color: color.Critical.Main }} alignItems="Center" gap="100">
      <PhosphorIcon as={WarningIcon} size="50" weight="fill" />
      <Text size="T200">
        <b>{message}</b>
      </Text>
    </Box>
  );
}
