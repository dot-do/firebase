import { describe, it, expect, beforeEach } from 'vitest'
import {
  createEvaluator,
  EvaluationError,
  type EvaluatorContext,
  type RulesEvaluator,
} from '../../src/rules/evaluator'

/**
 * Tests for division by zero handling in the rules evaluator.
 *
 * Division by zero is a common source of bugs in security rules.
 * The evaluator should throw an EvaluationError rather than returning
 * Infinity or NaN, which could lead to unexpected rule behavior.
 *
 * Test cases:
 * - 1 / 0 - Direct division by zero (would return Infinity in JS)
 * - 0 / 0 - Zero divided by zero (would return NaN in JS)
 * - x / (y - y) - Division by computed zero
 * - Modulo by zero (x % 0)
 */

describe('Division by Zero Handling', () => {
  let evaluator: RulesEvaluator

  const createContext = (data: Record<string, unknown> = {}): EvaluatorContext => ({
    request: {
      auth: {
        uid: 'user123',
        token: {},
      },
      resource: { data },
      method: 'get',
      path: '/databases/default/documents/test/123',
      time: new Date(),
    },
    resource: {
      data,
      id: '123',
      __name__: 'test/123',
    },
    database: 'default',
  })

  beforeEach(() => {
    evaluator = createEvaluator()
  })

  describe('Direct division by zero: 1 / 0', () => {
    it('should throw EvaluationError for 1 / 0', () => {
      const context = createContext()

      expect(() => evaluator.evaluate('1 / 0', context)).toThrow(EvaluationError)
      expect(() => evaluator.evaluate('1 / 0', context)).toThrow(/division by zero/i)
    })

    it('should throw EvaluationError for any positive number divided by zero', () => {
      const context = createContext()

      expect(() => evaluator.evaluate('42 / 0', context)).toThrow(EvaluationError)
      expect(() => evaluator.evaluate('100 / 0', context)).toThrow(/division by zero/i)
    })

    it('should throw EvaluationError for negative number divided by zero', () => {
      const context = createContext({ value: -5 })

      expect(() => evaluator.evaluate('resource.data.value / 0', context)).toThrow(EvaluationError)
      expect(() => evaluator.evaluate('-10 / 0', context)).toThrow(/division by zero/i)
    })
  })

  describe('Zero divided by zero: 0 / 0', () => {
    it('should throw EvaluationError for 0 / 0', () => {
      const context = createContext()

      expect(() => evaluator.evaluate('0 / 0', context)).toThrow(EvaluationError)
      expect(() => evaluator.evaluate('0 / 0', context)).toThrow(/division by zero/i)
    })

    it('should throw EvaluationError when both operands are zero from variables', () => {
      const context = createContext({ zero: 0 })

      expect(() => evaluator.evaluate('resource.data.zero / resource.data.zero', context)).toThrow(
        EvaluationError
      )
    })
  })

  describe('Computed division by zero: x / (y - y)', () => {
    it('should throw EvaluationError for x / (y - y) where y - y equals zero', () => {
      const context = createContext({ x: 10, y: 5 })

      expect(() =>
        evaluator.evaluate('resource.data.x / (resource.data.y - resource.data.y)', context)
      ).toThrow(EvaluationError)
      expect(() =>
        evaluator.evaluate('resource.data.x / (resource.data.y - resource.data.y)', context)
      ).toThrow(/division by zero/i)
    })

    it('should throw EvaluationError when divisor evaluates to zero through computation', () => {
      const context = createContext({ a: 10, b: 10 })

      expect(() =>
        evaluator.evaluate('100 / (resource.data.a - resource.data.b)', context)
      ).toThrow(EvaluationError)
    })

    it('should throw EvaluationError for division by zero in nested expressions', () => {
      const context = createContext({ val: 5 })

      // (val * 2) / (val - val) should throw
      expect(() =>
        evaluator.evaluate(
          '(resource.data.val * 2) / (resource.data.val - resource.data.val)',
          context
        )
      ).toThrow(EvaluationError)
    })
  })

  describe('Modulo by zero: x % 0', () => {
    it('should throw EvaluationError for modulo by zero', () => {
      const context = createContext()

      expect(() => evaluator.evaluate('10 % 0', context)).toThrow(EvaluationError)
      expect(() => evaluator.evaluate('10 % 0', context)).toThrow(/division by zero|modulo by zero/i)
    })

    it('should throw EvaluationError for 0 % 0', () => {
      const context = createContext()

      expect(() => evaluator.evaluate('0 % 0', context)).toThrow(EvaluationError)
    })

    it('should throw EvaluationError for computed modulo by zero', () => {
      const context = createContext({ x: 5 })

      expect(() =>
        evaluator.evaluate('resource.data.x % (resource.data.x - resource.data.x)', context)
      ).toThrow(EvaluationError)
    })
  })

  describe('Valid division operations should still work', () => {
    it('should correctly evaluate non-zero division', () => {
      const context = createContext()

      expect(evaluator.evaluate('10 / 2', context)).toBe(5)
      expect(evaluator.evaluate('15 / 3', context)).toBe(5)
      expect(evaluator.evaluate('7 / 2', context)).toBe(3.5)
    })

    it('should correctly evaluate division with variables', () => {
      const context = createContext({ numerator: 100, denominator: 4 })

      expect(
        evaluator.evaluate('resource.data.numerator / resource.data.denominator', context)
      ).toBe(25)
    })

    it('should correctly evaluate modulo with non-zero divisor', () => {
      const context = createContext()

      expect(evaluator.evaluate('10 % 3', context)).toBe(1)
      expect(evaluator.evaluate('15 % 5', context)).toBe(0)
    })

    it('should correctly evaluate 0 / nonZero', () => {
      const context = createContext()

      expect(evaluator.evaluate('0 / 5', context)).toBe(0)
      expect(evaluator.evaluate('0 / 100', context)).toBe(0)
    })
  })

  describe('Division by zero in complex expressions', () => {
    it('should throw when division by zero occurs in a larger expression', () => {
      const context = createContext({ a: 10 })

      // Even if there are other valid operations, division by zero should throw
      expect(() => evaluator.evaluate('resource.data.a + (1 / 0)', context)).toThrow(
        EvaluationError
      )
    })

    it('should throw when division by zero is part of a comparison', () => {
      const context = createContext()

      expect(() => evaluator.evaluate('(1 / 0) > 0', context)).toThrow(EvaluationError)
    })

    it('should short-circuit before division by zero in && with false left operand', () => {
      const context = createContext()

      // This should NOT throw because && short-circuits when left is false
      // The division by zero expression is never evaluated
      expect(() => evaluator.evaluate('false && (1 / 0) > 0', context)).not.toThrow()
      expect(evaluator.evaluate('false && (1 / 0) > 0', context)).toBe(false)
    })

    it('should short-circuit before division by zero in || with true left operand', () => {
      const context = createContext()

      // This should NOT throw because || short-circuits when left is true
      // The division by zero expression is never evaluated
      expect(() => evaluator.evaluate('true || (1 / 0) > 0', context)).not.toThrow()
      expect(evaluator.evaluate('true || (1 / 0) > 0', context)).toBe(true)
    })

    it('should throw when short-circuit does not prevent division by zero', () => {
      const context = createContext()

      // && with true left operand evaluates right side
      expect(() => evaluator.evaluate('true && (1 / 0) > 0', context)).toThrow(EvaluationError)

      // || with false left operand evaluates right side
      expect(() => evaluator.evaluate('false || (1 / 0) > 0', context)).toThrow(EvaluationError)
    })
  })

  describe('Error message quality', () => {
    it('should provide a clear error message for division by zero', () => {
      const context = createContext()

      try {
        evaluator.evaluate('1 / 0', context)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).toBeInstanceOf(EvaluationError)
        expect((error as EvaluationError).message).toMatch(/division by zero/i)
      }
    })
  })
})
