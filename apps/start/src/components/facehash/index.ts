// ============================================================================
// Primary Export - This is what you want
// ============================================================================

export type { FacehashProps, Intensity3D, Variant, ColorScheme } from './facehash';
export {
  Facehash,
  DEFAULT_COLORS,
  DEFAULT_COLORS_LIGHT,
  DEFAULT_COLORS_DARK,
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
