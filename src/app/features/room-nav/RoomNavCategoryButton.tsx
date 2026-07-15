import { as, Chip, IconButton, Text } from 'folds';
import classNames from 'classnames';
import { CaretDown, CaretRight, chipCaretIcon } from '$components/icons/phosphor';
import * as css from './styles.css';

export const RoomNavCategoryButton = as<'button', { closed?: boolean }>(
  ({ className, closed, children, ...props }, ref) => {
    if (children)
      return (
        <Chip
          className={classNames(css.CategoryButton, className)}
          variant="Background"
          radii="400"
          after={
            <span className={css.CategoryButtonIcon}>
              {chipCaretIcon(closed ? CaretRight : CaretDown)}
            </span>
          }
          {...props}
          ref={ref}
        >
          {children && (
            <Text size="B400" priority="300" truncate>
              {children}
            </Text>
          )}
        </Chip>
      );
    return (
      <IconButton
        className={classNames(css.CategoryButton, className)}
        variant="Background"
        radii="400"
        {...props}
        style={{ padding: '0' }}
        ref={ref}
      >
        <span className={css.CategoryButtonIcon} style={{ padding: '0' }}>
          {chipCaretIcon(closed ? CaretRight : CaretDown)}
        </span>
      </IconButton>
    );
  }
);
