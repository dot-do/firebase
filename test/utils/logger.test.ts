import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  Logger,
  createLogger,
  logger,
  type LogLevel,
  type LogOutput,
} from '../../src/utils/logger.js'

describe('Logger', () => {
  let mockOutput: LogOutput
  let logs: { level: LogLevel; message: string }[]

  beforeEach(() => {
    logs = []
    mockOutput = {
      debug: vi.fn((msg) => logs.push({ level: 'debug', message: msg })),
      info: vi.fn((msg) => logs.push({ level: 'info', message: msg })),
      warn: vi.fn((msg) => logs.push({ level: 'warn', message: msg })),
      error: vi.fn((msg) => logs.push({ level: 'error', message: msg })),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('log levels', () => {
    it('should log messages at or above the configured level', () => {
      const logger = createLogger({ level: 'info', output: mockOutput, timestamp: false })

      logger.debug('debug message')
      logger.info('info message')
      logger.warn('warn message')
      logger.error('error message')

      expect(mockOutput.debug).not.toHaveBeenCalled()
      expect(mockOutput.info).toHaveBeenCalled()
      expect(mockOutput.warn).toHaveBeenCalled()
      expect(mockOutput.error).toHaveBeenCalled()
    })

    it('should log all levels when set to debug', () => {
      const logger = createLogger({ level: 'debug', output: mockOutput, timestamp: false })

      logger.debug('debug message')
      logger.info('info message')
      logger.warn('warn message')
      logger.error('error message')

      expect(mockOutput.debug).toHaveBeenCalled()
      expect(mockOutput.info).toHaveBeenCalled()
      expect(mockOutput.warn).toHaveBeenCalled()
      expect(mockOutput.error).toHaveBeenCalled()
    })

    it('should only log error when set to error', () => {
      const logger = createLogger({ level: 'error', output: mockOutput, timestamp: false })

      logger.debug('debug message')
      logger.info('info message')
      logger.warn('warn message')
      logger.error('error message')

      expect(mockOutput.debug).not.toHaveBeenCalled()
      expect(mockOutput.info).not.toHaveBeenCalled()
      expect(mockOutput.warn).not.toHaveBeenCalled()
      expect(mockOutput.error).toHaveBeenCalled()
    })

    it('should allow changing log level at runtime', () => {
      const logger = createLogger({ level: 'error', output: mockOutput, timestamp: false })

      logger.info('should not appear')
      expect(mockOutput.info).not.toHaveBeenCalled()

      logger.setLevel('info')
      logger.info('should appear')
      expect(mockOutput.info).toHaveBeenCalled()
    })

    it('should report current log level', () => {
      const logger = createLogger({ level: 'warn' })
      expect(logger.getLevel()).toBe('warn')

      logger.setLevel('debug')
      expect(logger.getLevel()).toBe('debug')
    })

    it('should report enabled levels correctly', () => {
      const logger = createLogger({ level: 'warn' })

      expect(logger.isDebugEnabled()).toBe(false)
      expect(logger.isInfoEnabled()).toBe(false)
      expect(logger.isWarnEnabled()).toBe(true)
      expect(logger.isErrorEnabled()).toBe(true)
    })
  })

  describe('text format', () => {
    it('should format messages in text mode', () => {
      const logger = createLogger({
        format: 'text',
        output: mockOutput,
        timestamp: false,
      })

      logger.info('test message')

      expect(logs[0].message).toBe('INFO: test message')
    })

    it('should include context in text format', () => {
      const logger = createLogger({
        format: 'text',
        output: mockOutput,
        timestamp: false,
      })

      logger.info('test message', { key: 'value', num: 42 })

      expect(logs[0].message).toContain('INFO: test message')
      expect(logs[0].message).toContain('"key":"value"')
      expect(logs[0].message).toContain('"num":42')
    })

    it('should include service name in text format', () => {
      const logger = createLogger({
        format: 'text',
        output: mockOutput,
        timestamp: false,
        service: 'my-service',
      })

      logger.info('test message')

      expect(logs[0].message).toContain('[my-service]')
    })

    it('should include timestamp when enabled', () => {
      const logger = createLogger({
        format: 'text',
        output: mockOutput,
        timestamp: true,
      })

      logger.info('test message')

      // Should contain ISO timestamp pattern
      expect(logs[0].message).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })
  })

  describe('JSON format', () => {
    it('should format messages as JSON', () => {
      const logger = createLogger({
        format: 'json',
        output: mockOutput,
        timestamp: false,
      })

      logger.info('test message')

      const parsed = JSON.parse(logs[0].message)
      expect(parsed.level).toBe('info')
      expect(parsed.message).toBe('test message')
    })

    it('should include context in JSON format', () => {
      const logger = createLogger({
        format: 'json',
        output: mockOutput,
        timestamp: false,
      })

      logger.info('test message', { key: 'value', num: 42 })

      const parsed = JSON.parse(logs[0].message)
      expect(parsed.context.key).toBe('value')
      expect(parsed.context.num).toBe(42)
    })

    it('should include service in JSON format', () => {
      const logger = createLogger({
        format: 'json',
        output: mockOutput,
        timestamp: false,
        service: 'auth-service',
      })

      logger.info('test message')

      const parsed = JSON.parse(logs[0].message)
      expect(parsed.service).toBe('auth-service')
    })

    it('should include timestamp in JSON format when enabled', () => {
      const logger = createLogger({
        format: 'json',
        output: mockOutput,
        timestamp: true,
      })

      logger.info('test message')

      const parsed = JSON.parse(logs[0].message)
      expect(parsed.timestamp).toBeDefined()
      expect(new Date(parsed.timestamp).getTime()).not.toBeNaN()
    })

    it('should include error details in JSON format', () => {
      const logger = createLogger({
        format: 'json',
        output: mockOutput,
        timestamp: false,
      })

      const err = new Error('test error')
      logger.error('something failed', err)

      const parsed = JSON.parse(logs[0].message)
      expect(parsed.error.name).toBe('Error')
      expect(parsed.error.message).toBe('test error')
      expect(parsed.error.stack).toBeDefined()
    })
  })

  describe('error logging', () => {
    it('should log Error objects directly', () => {
      const logger = createLogger({
        format: 'json',
        output: mockOutput,
        timestamp: false,
      })

      const err = new Error('direct error')
      logger.error(err)

      const parsed = JSON.parse(logs[0].message)
      expect(parsed.message).toBe('direct error')
      expect(parsed.error.name).toBe('Error')
    })

    it('should log message with context and error', () => {
      const logger = createLogger({
        format: 'json',
        output: mockOutput,
        timestamp: false,
      })

      const err = new Error('nested error')
      logger.error('operation failed', { operation: 'save' }, err)

      const parsed = JSON.parse(logs[0].message)
      expect(parsed.message).toBe('operation failed')
      expect(parsed.context.operation).toBe('save')
      expect(parsed.error.message).toBe('nested error')
    })
  })

  describe('child loggers', () => {
    it('should create child logger with additional context', () => {
      const parent = createLogger({
        format: 'json',
        output: mockOutput,
        timestamp: false,
        context: { service: 'api' },
      })

      const child = parent.child({ requestId: '123' })
      child.info('handling request')

      const parsed = JSON.parse(logs[0].message)
      expect(parsed.context.service).toBe('api')
      expect(parsed.context.requestId).toBe('123')
    })

    it('should not affect parent logger context', () => {
      const parent = createLogger({
        format: 'json',
        output: mockOutput,
        timestamp: false,
        context: { service: 'api' },
      })

      const child = parent.child({ requestId: '123' })
      child.info('child log')
      parent.info('parent log')

      const childParsed = JSON.parse(logs[0].message)
      const parentParsed = JSON.parse(logs[1].message)

      expect(childParsed.context.requestId).toBe('123')
      expect(parentParsed.context.requestId).toBeUndefined()
    })

    it('should inherit parent log level', () => {
      const parent = createLogger({
        level: 'warn',
        output: mockOutput,
        timestamp: false,
      })

      const child = parent.child({ requestId: '123' })
      child.info('should not appear')
      child.warn('should appear')

      expect(mockOutput.info).not.toHaveBeenCalled()
      expect(mockOutput.warn).toHaveBeenCalled()
    })
  })

  describe('configure', () => {
    it('should update configuration at runtime', () => {
      const logger = createLogger({
        level: 'info',
        format: 'text',
        output: mockOutput,
        timestamp: false,
      })

      logger.configure({ format: 'json', level: 'debug' })

      logger.debug('test message')

      expect(mockOutput.debug).toHaveBeenCalled()
      const parsed = JSON.parse(logs[0].message)
      expect(parsed.level).toBe('debug')
    })

    it('should merge context when configuring', () => {
      const logger = createLogger({
        format: 'json',
        output: mockOutput,
        timestamp: false,
        context: { env: 'test' },
      })

      logger.configure({ context: { version: '1.0' } })
      logger.info('test')

      const parsed = JSON.parse(logs[0].message)
      expect(parsed.context.env).toBe('test')
      expect(parsed.context.version).toBe('1.0')
    })
  })

  describe('default logger', () => {
    it('should export a default logger instance', () => {
      expect(logger).toBeInstanceOf(Logger)
      expect(logger.getLevel()).toBe('info')
    })
  })

  describe('createLogger factory', () => {
    it('should create logger with default config', () => {
      const log = createLogger()
      expect(log).toBeInstanceOf(Logger)
      expect(log.getLevel()).toBe('info')
    })

    it('should create logger with custom config', () => {
      const log = createLogger({
        level: 'debug',
        format: 'json',
        service: 'test-service',
      })

      expect(log.getLevel()).toBe('debug')
      expect(log.isDebugEnabled()).toBe(true)
    })
  })
})
