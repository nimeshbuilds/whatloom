/** Build-time settings shared by the local app and its static browser studio. */
export const HOSTED_STUDIO = process.env.NEXT_PUBLIC_HOSTED === 'true';
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '');
export const REPOSITORY_URL = process.env.NEXT_PUBLIC_REPOSITORY_URL || 'https://github.com/nimeshbuilds/whatloom';
export const MAC_DOWNLOAD_URL = `${REPOSITORY_URL}/releases/latest`;

/** Plain images and public assets do not receive Next.js's basePath automatically. */
export function assetPath(path: string): string {
  return `${BASE_PATH}${path.startsWith('/') ? path : `/${path}`}`;
}
