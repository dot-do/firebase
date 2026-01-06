/**
 * Structured logging module with configurable log levels
 *
 * Provides a flexible logging abstraction supporting:
 * - Log levels: debug, info, warn, error
 * - Structured logging with JSON output format
 * - Configurable output destination
 * - Context metadata support
 */

/**
 * Log levels in order of severity (lowest to highest)
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * Numeric values for log levels for comparison
 */
const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

/**
 * Configuration options for the logger
 */
export interface LoggerConfig {
  /**
   * Minimum log level to output. Messages below this level are ignored.
   * @default 'info'
   */
  level?: LogLevel

  /**
   * Output format: 'json' for structured logging, 'text' for human-readable
   * @default 'text'
   */
  format?: 'json' | 'text'

  /**
   * Output function for log messages. Defaults to console methods.
   */
  output?: LogOutput

  /**
   * Default context to include in all log entries
   */
  context?: Record<string, unknown>

  /**
   * Whether to include timestamps in log entries
   * @default true
   */
  timestamp?: boolean

  /**
   * Service name to include in log entries
   */
  service?: string
}

/**
 * Output interface for custom log destinations
 */
export interface LogOutput {
  debug(message: string): void
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}

/**
 * Structured log entry for JSON format output
 */
export interface LogEntry {
  timestamp?: string
  level: LogLevel
  message: string
  service?: string
  context?: Record<string, unknown>
  error?: {
    name: string
    message: string
    stack?: string
  }
}

/**
 * Default console-based output
 */
const defaultOutput: LogOutput = {
  debug: (msg) => console.debug(msg),
  info: (msg) => console.info(msg),
  warn: (msg) => console.warn(msg),
  error: (msg) => console.error(msg),
}

/**
 * Logger class providing structured logging with configurable levels
 */
export class Logger {
  private config: Required<Omit<LoggerConfig, 'context' | 'service'>> & Pick<LoggerConfig, 'context' | 'service'>

  constructor(config: LoggerConfig = {}) {
    this.config = {
      level: config.level ?? 'info',
      format: config.format ?? 'text',
      output: config.output ?? defaultOutput,
      timestamp: config.timestamp ?? true,
      context: config.context,
      service: config.service,
    }
  }

  /**
   * Check if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_VALUES[level] >= LOG_LEVEL_VALUES[this.config.level]
  }

  /**
   * Format a log entry for output
   */
  private formatEntry(entry: LogEntry): string {
    if (this.config.format === 'json') {
      return JSON.stringify(entry)
    }

    // Text format: [TIMESTAMP] LEVEL: message {context}
    const parts: string[] = []

    if (entry.timestamp) {
      parts.push(`[${entry.timestamp}]`)
    }

    if (entry.service) {
      parts.push(`[${entry.service}]`)
    }

    parts.push(`${entry.level.toUpperCase()}:`)
    parts.push(entry.message)

    if (entry.context && Object.keys(entry.context).length > 0) {
      parts.push(JSON.stringify(entry.context))
    }

    if (entry.error) {
      parts.push(`\n  Error: ${entry.error.name}: ${entry.error.message}`)
      if (entry.error.stack) {
        parts.push(`\n  Stack: ${entry.error.stack}`)
      }
    }

    return parts.join(' ')
  }

  /**
   * Create a log entry from the given parameters
   */
  private createEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): LogEntry {
    const entry: LogEntry = {
      level,
      message,
    }

    if (this.config.timestamp) {
      entry.timestamp = new Date().toISOString()
    }

    if (this.config.service) {
      entry.service = this.config.service
    }

    // Merge default context with provided context
    const mergedContext = {
      ...this.config.context,
      ...context,
    }

    if (Object.keys(mergedContext).length > 0) {
      entry.context = mergedContext
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      }
    }

    return entry
  }

  /**
   * Log a message at the specified level
   */
  private log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error): void {
    if (!this.shouldLog(level)) {
      return
    }

    const entry = this.createEntry(level, message, context, error)
    const formatted = this.formatEntry(entry)
    this.config.output[level](formatted)
  }

  /**
   * Log a debug message
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context)
  }

  /**
   * Log an info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context)
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context)
  }

  /**
   * Log an error message
   * @param message - Error message or Error object
   * @param contextOrError - Additional context or Error object
   * @param error - Error object if context was provided
   */
  error(message: string | Error, contextOrError?: Record<string, unknown> | Error, error?: Error): void {
    if (message instanceof Error) {
      this.log('error', message.message, undefined, message)
    } else if (contextOrError instanceof Error) {
      this.log('error', message, undefined, contextOrError)
    } else {
      this.log('error', message, contextOrError, error)
    }
  }

  /**
   * Create a child logger with additional context
   */
  child(context: Record<string, unknown>): Logger {
    return new Logger({
      ...this.config,
      context: {
        ...this.config.context,
        ...context,
      },
    })
  }

  /**
   * Update the logger configuration
   */
  configure(config: Partial<LoggerConfig>): void {
    if (config.level !== undefined) {
      this.config.level = config.level
    }
    if (config.format !== undefined) {
      this.config.format = config.format
    }
    if (config.output !== undefined) {
      this.config.output = config.output
    }
    if (config.timestamp !== undefined) {
      this.config.timestamp = config.timestamp
    }
    if (config.context !== undefined) {
      this.config.context = { ...this.config.context, ...config.context }
    }
    if (config.service !== undefined) {
      this.config.service = config.service
    }
  }

  /**
   * Get the current log level
   */
  getLevel(): LogLevel {
    return this.config.level
  }

  /**
   * Set the log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level
  }

  /**
   * Check if debug level logging is enabled
   */
  isDebugEnabled(): boolean {
    return this.shouldLog('debug')
  }

  /**
   * Check if info level logging is enabled
   */
  isInfoEnabled(): boolean {
    return this.shouldLog('info')
  }

  /**
   * Check if warn level logging is enabled
   */
  isWarnEnabled(): boolean {
    return this.shouldLog('warn')
  }

  /**
   * Check if error level logging is enabled
   */
  isErrorEnabled(): boolean {
    return this.shouldLog('error')
  }
}

/**
 * Create a logger instance with the given configuration
 */
export function createLogger(config: LoggerConfig = {}): Logger {
  return new Logger(config)
}

/**
 * Default logger instance
 */
export const logger = createLogger()
