import type * as React from 'react';

export type FaceProps = {
  className?: string;
  style?: React.CSSProperties;
};

/**
 * Round eyes face - simple circular eyes
 */
export const RoundFace: React.FC<FaceProps> = ({ className, style }) => (
  <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden="true">
    <title>Round Eyes</title>
    <circle cx="35" cy="45" r="8" fill="currentColor" />
    <circle cx="65" cy="45" r="8" fill="currentColor" />
  </svg>
);

/**
 * Cross eyes face - X-shaped eyes
 */
export const CrossFace: React.FC<FaceProps> = ({ className, style }) => (
  <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden="true">
    <title>Cross Eyes</title>
    <path d="M27 37 L43 53 M43 37 L27 53" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    <path d="M57 37 L73 53 M73 37 L57 53" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
  </svg>
);

/**
 * Line eyes face - horizontal line eyes
 */
export const LineFace: React.FC<FaceProps> = ({ className, style }) => (
  <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden="true">
    <title>Line Eyes</title>
    <line x1="27" y1="45" x2="43" y2="45" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    <line x1="57" y1="45" x2="73" y2="45" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
  </svg>
);

/**
 * Curved eyes face - sleepy/happy curved eyes
 */
export const CurvedFace: React.FC<FaceProps> = ({ className, style }) => (
  <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden="true">
    <title>Curved Eyes</title>
    <path d="M27 50 Q35 38 43 50" stroke="currentColor" strokeWidth="4" strokeLinecap="round" fill="none" />
    <path d="M57 50 Q65 38 73 50" stroke="currentColor" strokeWidth="4" strokeLinecap="round" fill="none" />
  </svg>
);

/**
 * All available face components
 */
export const FACES = [RoundFace, CrossFace, LineFace, CurvedFace] as const;

export type FaceComponent = (typeof FACES)[number];
