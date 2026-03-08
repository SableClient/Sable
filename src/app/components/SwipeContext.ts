import { createContext, useContext } from 'react';
import { MotionValue } from 'motion/react';

export const SwipeContext = createContext<MotionValue<number> | null>(null);

export const useSwipeX = () => useContext(SwipeContext);
