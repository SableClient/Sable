import { as, Box, Text } from 'folds';
import type { ReactNode } from 'react';
import classNames from 'classnames';
import * as css from './styles.css';

export const getDOMGroupId = (id: string): string => `EmojiBoardGroup-${id}`;

export const EmojiGroup = as<
  'div',
  {
    id: string;
    label: string;
    children: ReactNode;
  }
>(({ className, id, label, children, ...props }, ref) => (
  <Box
    id={getDOMGroupId(id)}
    data-group-id={id}
    className={classNames(css.EmojiGroup, className)}
    direction="Column"
    gap="200"
    {...props}
    ref={ref}
  >
    <Text id={`EmojiGroup-${id}-label`} as="label" className={css.EmojiGroupLabel} size="O400">
      {label}
    </Text>
    <div aria-labelledby={`EmojiGroup-${id}-label`} className={css.EmojiGroupContent}>
      <Box wrap="Wrap" justifyContent="Center">
        {children}
      </Box>
    </div>
  </Box>
));
