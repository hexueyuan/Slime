export class SlimeError extends Error {
  constructor(
    message: string,
    public code: string,
    public recoverable: boolean = true,
  ) {
    super(message);
    this.name = "SlimeError";
  }
}

export class AgentError extends SlimeError {
  constructor(message: string) {
    super(message, "AGENT_ERROR", true);
  }
}

export class BuildError extends SlimeError {
  constructor(
    message: string,
    public logs: string,
  ) {
    super(message, "BUILD_ERROR", true);
  }
}

export class GitError extends SlimeError {
  constructor(message: string) {
    super(message, "GIT_ERROR", true);
  }
}
