export class PloybundleError extends Error {
  public readonly code: string;
  public readonly hint?: string;

  constructor(message: string, code: string, hint?: string) {
    super(message);
    this.name = "PloybundleError";
    this.code = code;
    this.hint = hint;
  }

  toJSON(): Record<string, unknown> {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      hint: this.hint,
    };
  }
}

export class ConfigError extends PloybundleError {
  constructor(message: string, hint?: string) {
    super(message, "CONFIG_ERROR", hint);
    this.name = "ConfigError";
  }
}

export class SshError extends PloybundleError {
  constructor(message: string, hint?: string) {
    super(message, "SSH_ERROR", hint);
    this.name = "SshError";
  }
}

export class PlatformError extends PloybundleError {
  constructor(message: string, hint?: string) {
    super(message, "PLATFORM_ERROR", hint);
    this.name = "PlatformError";
  }
}

export class ValidationError extends PloybundleError {
  public readonly fields: Record<string, string>;

  constructor(message: string, fields: Record<string, string>, hint?: string) {
    super(message, "VALIDATION_ERROR", hint);
    this.name = "ValidationError";
    this.fields = fields;
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      fields: this.fields,
    };
  }
}

export class DeployError extends PloybundleError {
  public readonly phase: string;

  constructor(message: string, phase: string, hint?: string) {
    super(message, "DEPLOY_ERROR", hint);
    this.name = "DeployError";
    this.phase = phase;
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      phase: this.phase,
    };
  }
}

export class ServiceError extends PloybundleError {
  public readonly service: string;

  constructor(message: string, service: string, hint?: string) {
    super(message, "SERVICE_ERROR", hint);
    this.name = "ServiceError";
    this.service = service;
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      service: this.service,
    };
  }
}
