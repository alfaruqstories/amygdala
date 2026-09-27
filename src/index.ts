/**
 * Amygdala public surface. Build code (doors, fake, extraction) is
 * home-agnostic; the deploy plug lives in ./cloudflare.
 */
export * from './types';
export * from './boundary';
export * from './ids';
export * from './embedder';
export * from './doors/save';
export * from './doors/recall';
export * from './extract/types';
export * from './extract/scripted';
export * from './fake/fake-boundary';
