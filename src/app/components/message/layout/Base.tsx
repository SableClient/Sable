import { as } from 'folds';
import classNames from 'classnames';
import * as css from './layout.css';

export const MessageBase = as<'div', css.MessageBaseVariants>(
  (
    {
      className,
      highlight,
      notifyHighlight,
      selected,
      isMarked,
      collapse,
      autoCollapse,
      space,
      mobile,
      ...props
    },
    ref
  ) => (
    <div
      className={classNames(
        css.MessageBase({
          highlight,
          notifyHighlight,
          isMarked,
          selected,
          collapse,
          autoCollapse,
          space,
          mobile,
        }),
        className
      )}
      {...props}
      ref={ref}
    />
  )
);

export const AvatarBase = as<'span'>(({ className, ...props }, ref) => (
  <span className={classNames(css.AvatarBase, className)} {...props} ref={ref} />
));

export const Username = as<'span'>(({ as: AsUsername = 'span', className, ...props }, ref) => (
  <AsUsername className={classNames(css.Username, className)} {...props} ref={ref} />
));

export const UsernameBold = as<'b'>(({ as: AsUsernameBold = 'b', className, ...props }, ref) => (
  <AsUsernameBold className={classNames(css.UsernameBold, className)} {...props} ref={ref} />
));

export const PronounPill = as<'span'>(
  ({ as: AsPronounPill = 'span', className, ...props }, ref) => (
    <AsPronounPill className={classNames(css.PronounPill, className)} {...props} ref={ref} />
  )
);

export const MessageTextBody = as<'div', css.MessageTextBodyVariants & { notice?: boolean }>(
  (
    { as: AsComp = 'div', children, className, preWrap, jumboEmoji, emote, notice, ...props },
    ref
  ) => (
    <AsComp
      className={classNames(css.MessageTextBody({ preWrap, jumboEmoji, emote, notice }), className)}
      {...props}
      ref={ref}
      dir="auto"
    >
      {children}
    </AsComp>
  )
);
