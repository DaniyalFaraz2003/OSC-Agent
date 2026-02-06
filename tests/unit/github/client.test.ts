import { GitHubClient } from '../../../src/github/client';
import axios from 'axios';
import type { AxiosInstance } from 'axios';
import { GitHubAuthenticationError, GitHubNotFoundError, GitHubRateLimitError } from '../../../src/github/errors';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GitHubClient Unit Tests', () => {
  let client: GitHubClient;
  const mockAxiosInstance = {
    get: jest.fn(),
    post: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
    request: jest.fn(),
  };
  const getResponseErrorInterceptor: () => unknown = () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
    return mockAxiosInstance.interceptors.response.use.mock.calls[0][1];
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Force axios.create to return our mock instance
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    mockedAxios.create.mockReturnValue(mockAxiosInstance as unknown as AxiosInstance);
    client = new GitHubClient({ token: 'test-token' });
  });

  it('should fetch a repository correctly', async () => {
    const mockRepo = { name: 'test-repo', full_name: 'owner/test-repo' };
    mockAxiosInstance.get.mockResolvedValueOnce({ data: mockRepo });

    const repo = await client.getRepository('owner', 'test-repo');
    expect(repo.name).toBe('test-repo');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/repos/owner/test-repo');
  });

  it('listIssues should fetch an array of issues', async () => {
    const mockIssues = [
      { number: 1, title: 'Bug' },
      { number: 2, title: 'Feature' },
    ];
    mockAxiosInstance.get.mockResolvedValueOnce({ data: mockIssues });

    const result = await client.listIssues('owner', 'repo');

    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/repos/owner/repo/issues');
    expect(result).toHaveLength(2);
    expect(result[0]?.title).toBe('Bug');
  });

  it('getIssue should fetch a single issue by number', async () => {
    const mockIssue = { number: 42, title: 'The Answer' };
    mockAxiosInstance.get.mockResolvedValueOnce({ data: mockIssue });

    const result = await client.getIssue('owner', 'repo', 42);

    expect(mockAxiosInstance.get).toHaveBeenCalledWith('/repos/owner/repo/issues/42');
    expect(result.number).toBe(42);
  });

  it('createPR should post correct payload to pull request endpoint', async () => {
    const mockPR = { number: 1, html_url: 'http://github.com/pr/1' };
    mockAxiosInstance.post.mockResolvedValueOnce({ data: mockPR });

    const payload = { title: 'New PR', head: 'feat', base: 'main' };
    const result = await client.createPR('owner', 'repo', payload.title, payload.head, payload.base);

    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/repos/owner/repo/pulls', payload);
    expect(result.html_url).toBe(mockPR.html_url);
  });

  it('createComment should post comment to the correct issue', async () => {
    const mockComment = { id: 999, body: 'Hello World' };
    mockAxiosInstance.post.mockResolvedValueOnce({ data: mockComment });

    const result = await client.createComment('owner', 'repo', 42, 'Hello World');

    expect(mockAxiosInstance.post).toHaveBeenCalledWith('/repos/owner/repo/issues/42/comments', { body: 'Hello World' });
    expect(result.id).toBe(999);
  });

  it('should throw GitHubAuthenticationError on 401', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const interceptor = getResponseErrorInterceptor() as (error: unknown) => Promise<void>;
    const error = {
      response: { status: 401, statusText: 'Unauthorized' },
    };

    await expect(interceptor(error)).rejects.toThrow(GitHubAuthenticationError);
  });

  it('should throw GitHubNotFoundError on 404', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const interceptor = getResponseErrorInterceptor() as (error: unknown) => Promise<void>;
    const error = {
      response: { status: 404, statusText: 'Not Found' },
    };

    await expect(interceptor(error)).rejects.toThrow(GitHubNotFoundError);
  });

  it('should throw GitHubRateLimitError on 403 when no wait time is provided', async () => {
    const interceptor = getResponseErrorInterceptor() as (error: unknown) => Promise<void>;
    const error = {
      response: {
        status: 403,
        headers: { 'x-ratelimit-reset': '1600000000' },
        statusText: 'Forbidden',
      },
    };

    await expect(interceptor(error)).rejects.toThrow(GitHubRateLimitError);
  });
});
