import type { MouseEventHandler } from 'react';

type CategoryAction =
  | {
      type: 'PUT';
      value: string;
    }
  | {
      type: 'DELETE';
      value: string;
    };
export const useCategoryHandler = (
  setAtom: (action: CategoryAction) => void,
  closed: (categoryId: string) => boolean
) => {
  const handleCategoryClick: MouseEventHandler<HTMLButtonElement> = (evt) => {
    const categoryId = evt.currentTarget.getAttribute('data-category-id');
    if (!categoryId) return;
    if (closed(categoryId)) {
      setAtom({ type: 'DELETE', value: categoryId });
      return;
    }
    setAtom({ type: 'PUT', value: categoryId });
  };

  return handleCategoryClick;
};
