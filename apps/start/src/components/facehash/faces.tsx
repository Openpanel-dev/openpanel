import type * as React from 'react';

export type FaceProps = {
  className?: string;
  style?: React.CSSProperties;
};

export const RoundFace: React.FC<FaceProps> = ({ className, style }) => (
  <svg
    aria-hidden="true"
    className={className}
    style={style}
    viewBox="0 0 100 100"
  >
    <title>Round Eyes</title>
    <circle cx="35" cy="45" fill="currentColor" r="8" />
    <circle cx="65" cy="45" fill="currentColor" r="8" />
  </svg>
);

export const CrossFace: React.FC<FaceProps> = ({ className, style }) => (
  <svg
    aria-hidden="true"
    className={className}
    style={style}
    viewBox="0 0 100 100"
  >
    <title>Cross Eyes</title>
    <path
      d="M27 37 L43 53 M43 37 L27 53"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="4"
    />
    <path
      d="M57 37 L73 53 M73 37 L57 53"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="4"
    />
  </svg>
);

export const LineFace: React.FC<FaceProps> = ({ className, style }) => (
  <svg
    aria-hidden="true"
    className={className}
    style={style}
    viewBox="0 0 100 100"
  >
    <title>Line Eyes</title>
    <line
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="4"
      x1="27"
      x2="43"
      y1="45"
      y2="45"
    />
    <line
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="4"
      x1="57"
      x2="73"
      y1="45"
      y2="45"
    />
  </svg>
);

export const CurvedFace: React.FC<FaceProps> = ({ className, style }) => (
  <svg
    aria-hidden="true"
    className={className}
    style={style}
    viewBox="0 0 100 100"
  >
    <title>Curved Eyes</title>
    <path
      d="M27 50 Q35 38 43 50"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="4"
    />
    <path
      d="M57 50 Q65 38 73 50"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="4"
    />
  </svg>
);

export const FACES = [RoundFace, CrossFace, LineFace, CurvedFace] as const;

export type FaceComponent = (typeof FACES)[number];
