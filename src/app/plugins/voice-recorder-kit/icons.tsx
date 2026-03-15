import type { FC } from 'react';

export const PlayIcon: FC<{ size?: number }> = function ({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 7L17 12L8.5 17Z" fill="currentColor" />
    </svg>
  );
};

export const ResumeIcon: FC<{ size?: number }> = function ({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <polygon points="8,5 19,12 8,19" fill="currentColor" />
    </svg>
  );
};

export const PauseIcon: FC<{ size?: number }> = function ({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <rect x="6" y="5" width="4" height="14" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" fill="currentColor" />
    </svg>
  );
};

export const StopIcon: FC<{ size?: number }> = function ({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <rect x="6" y="6" width="12" height="12" fill="currentColor" />
    </svg>
  );
};

export const DeleteIcon: FC<{ size?: number }> = function ({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M4 7H20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9 4H15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M6 7L7 20C7.06457 20.7423 7.3378 21.25 8.25 21.25H15.75C16.6622 21.25 16.9354 20.7423 17 20L18 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 11V17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M14 11V17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
};

export const RepeatIcon: FC<{ size?: number }> = function ({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path
        d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
        fill="currentColor"
      />
    </svg>
  );
};
