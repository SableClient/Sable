import { ComponentProps, forwardRef } from 'react';
import { IconButton, Input, config } from 'folds';
import { EyeIcon } from '@phosphor-icons/react/dist/csr/Eye';
import { EyeSlashIcon } from '@phosphor-icons/react/dist/csr/EyeSlash';
import { UseStateProvider } from '$components/UseStateProvider';
import { PhosphorIcon } from '$components/PhosphorIcon';

type PasswordInputProps = Omit<ComponentProps<typeof Input>, 'type' | 'size'> & {
  size: '400' | '500';
};
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ variant = 'Background', size, style, after, ...props }, ref) => {
    const paddingRight: string = size === '500' ? config.space.S300 : config.space.S200;

    return (
      <UseStateProvider initial={false}>
        {(visible, setVisible) => (
          <Input
            {...props}
            ref={ref}
            style={{ paddingRight, ...style }}
            type={visible ? 'text' : 'password'}
            size={size}
            variant={variant}
            after={
              <>
                {after}
                <IconButton
                  onClick={() => setVisible(!visible)}
                  type="button"
                  variant={visible ? 'Warning' : variant}
                  size="300"
                  radii="300"
                >
                  <PhosphorIcon
                    style={{ opacity: config.opacity.P300 }}
                    size="100"
                    as={visible ? EyeIcon : EyeSlashIcon}
                  />
                </IconButton>
              </>
            }
          />
        )}
      </UseStateProvider>
    );
  }
);
