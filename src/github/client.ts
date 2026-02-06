import axios, { AxiosInstance, AxiosError } from 'axios';
import { GitHubRepository, GitHubIssue, GitHubPullRequest, GitHubComment, GitHubClientOptions } from './types';
import { GitHubError, GitHubAuthenticationError, GitHubRateLimitError, GitHubNotFoundError } from './errors';
import { RateLimiter } from './rate-limiter';

export class GitHubClient {
  private axiosInstance: AxiosInstance;
  private logEnabled: boolean;

  constructor(options: GitHubClientOptions) {
    this.logEnabled = options.logRequests ?? false;
    this.axiosInstance = axios.create({
      baseURL: options.baseUrl || 'https://api.github.com',
      timeout: options.timeout || 10000,
      headers: {
        Authorization: `token ${options.token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Robust-GitHub-Client',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    if (this.logEnabled) {
      this.axiosInstance.interceptors.request.use((config) => {
        console.log(`[GitHub API] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      });
    }

    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const response = error.response;
        if (!response) throw new GitHubError('Network Error', 0, error);

        // Handle Rate Limiting
        const waitTime = RateLimiter.getWaitTime(response);
        if ((response.status === 403 || response.status === 429) && waitTime) {
          console.warn(`Rate limit hit. Retrying after ${waitTime}ms...`);
          await RateLimiter.sleep(waitTime);
          return this.axiosInstance.request(error.config!);
        }

        // Map HTTP Errors to Custom Errors
        switch (response.status) {
          case 401:
            throw new GitHubAuthenticationError();
          case 404:
            throw new GitHubNotFoundError('Resource');
          case 403: {
            const reset = new Date(parseInt(response.headers['x-ratelimit-reset'] as string) * 1000);
            throw new GitHubRateLimitError(reset);
          }
          default:
            throw new GitHubError(response.statusText, response.status, error);
        }
      },
    );
  }

  async getRepository(owner: string, repo: string): Promise<GitHubRepository> {
    const { data } = await this.axiosInstance.get<GitHubRepository>(`/repos/${owner}/${repo}`);
    return data;
  }

  async listIssues(owner: string, repo: string): Promise<GitHubIssue[]> {
    const { data } = await this.axiosInstance.get<GitHubIssue[]>(`/repos/${owner}/${repo}/issues`);
    return data;
  }

  async getIssue(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue> {
    const { data } = await this.axiosInstance.get<GitHubIssue>(`/repos/${owner}/${repo}/issues/${issueNumber}`);
    return data;
  }

  async createPR(owner: string, repo: string, title: string, head: string, base: string): Promise<GitHubPullRequest> {
    const { data } = await this.axiosInstance.post<GitHubPullRequest>(`/repos/${owner}/${repo}/pulls`, {
      title,
      head,
      base,
    });
    return data;
  }

  async createComment(owner: string, repo: string, issueNumber: number, body: string): Promise<GitHubComment> {
    const { data } = await this.axiosInstance.post<GitHubComment>(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, { body });
    return data;
  }
}
