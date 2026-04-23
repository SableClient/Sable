import { Box, Text } from 'folds';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getLoginPath } from '$pages/pathUtils';
import { useAuthServer } from '$hooks/useAuthServer';
import type { ResetPasswordPathSearchParams } from '$pages/paths';
import { PasswordResetForm } from './PasswordResetForm';

const useResetPasswordSearchParams = (
  searchParams: URLSearchParams
): ResetPasswordPathSearchParams =>
  useMemo(
    () => ({
      email: searchParams.get('email') ?? undefined,
    }),
    [searchParams]
  );

export function ResetPassword() {
  const server = useAuthServer();
  const [searchParams] = useSearchParams();
  const resetPasswordSearchParams = useResetPasswordSearchParams(searchParams);

  return (
    <Box direction="Column" gap="500">
      <Text size="H2" priority="400">
        Reset Password
      </Text>
      <PasswordResetForm defaultEmail={resetPasswordSearchParams.email} />
      <span data-spacing-node />

      <Text align="Center">
        Remember your password? <Link to={getLoginPath(server)}>Login</Link>
      </Text>
    </Box>
  );
}
