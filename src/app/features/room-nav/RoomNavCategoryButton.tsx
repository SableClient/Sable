import { as, Chip, Text } from 'folds';
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import classNames from 'classnames';
import { PhosphorIcon } from '$components/PhosphorIcon';
import * as css from './styles.css';

export const RoomNavCategoryButton = as<'button', { closed?: boolean }>(
  ({ className, closed, children, ...props }, ref) => (
    <Chip
      className={classNames(css.CategoryButton, className)}
      variant="Background"
      radii="400"
      after={
        <PhosphorIcon
          className={css.CategoryButtonIcon}
          size="50"
          as={closed ? CaretRightIcon : CaretDownIcon}
        />
      }
      {...props}
      ref={ref}
    >
      <Text size="B400" priority="300" truncate>
        {children}
      </Text>
    </Chip>
  )
);
