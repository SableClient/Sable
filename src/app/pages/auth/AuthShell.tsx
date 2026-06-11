import { Box, Header, Scroll, Text } from 'folds';
import classNames from 'classnames';
import * as PatternsCss from '$styles/Patterns.css';
import CinnySVG from '$public/favicon.png';
import { AuthFooter } from './AuthFooter';
import * as css from './styles.css';

type AuthShellProps = {
  children: React.ReactNode;
  isAddingAccount?: boolean;
};

export function AuthShell({ children, isAddingAccount }: AuthShellProps) {
  return (
    <Scroll variant="Background" visibility="Hover" size="300" hideTrack>
      <Box
        className={classNames(css.AuthLayout, PatternsCss.BackgroundDotPattern)}
        direction="Column"
        alignItems="Center"
        justifyContent="Center"
        gap="400"
        style={{ minHeight: '100%' }}
      >
        <Box direction="Column" className={css.AuthCard}>
          <Header className={css.AuthHeader} size="600" variant="Surface">
            <Box grow="Yes" direction="Row" gap="300" alignItems="Center">
              <img className={css.AuthLogo} src={CinnySVG} alt="Cinny Logo" />
              <Text size="H3">Sable</Text>
            </Box>
            {isAddingAccount && (
              <Text size="T200" priority="300" style={{ marginLeft: 'auto', marginRight: 4 }}>
                Adding account
              </Text>
            )}
          </Header>
          <Box className={css.AuthCardContent} direction="Column">
            {children}
          </Box>
        </Box>
        <AuthFooter />
      </Box>
    </Scroll>
  );
}
