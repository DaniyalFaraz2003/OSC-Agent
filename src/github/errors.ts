export class GitHubError extends Error {
  constructor(
    public message: string,
    public status?: number,
    public originalError?: unknown,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

export class GitHubAuthenticationError extends GitHubError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
    this.name = 'GitHubAuthenticationError';
  }
}

export class GitHubRateLimitError extends GitHubError {
  constructor(
    public resetTime: Date,
    message: string = 'Rate limit exceeded',
  ) {
    super(message, 403);
    this.name = 'GitHubRateLimitError';
  }
}

export class GitHubNotFoundError extends GitHubError {
  constructor(resource: string) {
    super(`${resource} not found`, 404);
    this.name = 'GitHubNotFoundError';
  }
}
