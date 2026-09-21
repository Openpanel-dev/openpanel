// ============================================================================
// Primary Export - This is what you want
// ============================================================================

export type {
  ColorScheme,
  FacehashProps,
  Intensity3D,
  Variant,
} from './facehash';
export {
  DEFAULT_COLORS,
  DEFAULT_COLORS_DARK,
  DEFAULT_COLORS_LIGHT,
  Facehash,
} from './facehash';

// ============================================================================
// Avatar Compound Components - For image + fallback pattern
// ============================================================================

export {
  Avatar,
  type AvatarContextValue,
  type AvatarProps,
  useAvatarContext,
} from './avatar';
export { AvatarFallback, type AvatarFallbackProps } from './avatar-fallback';
export { AvatarImage, type AvatarImageProps } from './avatar-image';

// ============================================================================
// Face Components - For custom compositions
// ============================================================================

export {
  CrossFace,
  CurvedFace,
  FACES,
  type FaceComponent,
  type FaceProps,
  LineFace,
  RoundFace,
} from './faces';

// ============================================================================
// Utilities
// ============================================================================

export { stringHash } from './utils/hash';
