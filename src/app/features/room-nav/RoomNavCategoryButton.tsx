import { as, Chip, Icon, IconButton, Icons, Text } from 'folds';
import classNames from 'classnames';
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
            <Icon
              className={css.CategoryButtonIcon}
              size="50"
              src={closed ? Icons.ChevronRight : Icons.ChevronBottom}
            />
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
        <Icon
          className={css.CategoryButtonIcon}
          size="50"
          style={{ padding: '0' }}
          src={closed ? Icons.ChevronRight : Icons.ChevronBottom}
        />
      </IconButton>
    );
  }
);
