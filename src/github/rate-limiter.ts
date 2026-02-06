import { AxiosResponse } from 'axios';

export class RateLimiter {
  static getWaitTime(response: AxiosResponse): number | null {
    if (!response || !response.headers) return null;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const remaining: number = parseInt(response.headers['x-ratelimit-remaining'] as string, 10);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const reset = parseInt(response.headers['x-ratelimit-reset'] as string, 10);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const retryAfter = response.headers['retry-after'] as string;

    // Primary rate limit
    if (remaining === 0 && reset) {
      const waitMs = reset * 1000 - Date.now();
      return Math.max(waitMs, 0);
    }

    // Secondary rate limit (Retry-After is usually in seconds)
    if (retryAfter) {
      return parseInt(retryAfter, 10) * 1000;
    }

    return null;
  }

  static async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
