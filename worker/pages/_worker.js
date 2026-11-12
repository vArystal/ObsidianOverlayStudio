/**
 * Cloudflare Pages entry. Advanced mode: one Worker handles every route.
 * `index.mjs` is copied from worker/index.mjs by scripts/build-pages.mjs so the two
 * deployments (Workers + Pages) always run identical code.
 */
export { default } from './index.mjs'
