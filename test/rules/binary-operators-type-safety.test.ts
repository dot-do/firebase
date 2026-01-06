import { describe, it, expect, beforeEach } from 'vitest'
import {
  createEvaluator,
  type EvaluatorContext,
  type RulesEvaluator,
  EvaluationError,
} from '../../src/rules/evaluator'

/**
 * RED Tests: Type-Safe Binary Operations
 *
 * These tests verify that binary operators properly validate operand types
 * and throw EvaluationError when incompatible types are used, rather than
 * producing unexpected JavaScript coercion results or runtime crashes.
 *
 * Issue: firebase-m70
 * Blocks: firebase-5lhv (Replace any casts with type guards in evaluator binary operations)
 *
 * Currently, the evaluator uses `as any` casts for binary operations:
 *   - (leftValue as any) < (rightValue as any)
 *   - (leftValue as any) + (rightValue as any)
 *   etc.
 *
 * This allows invalid operations like:
 *   - "hello" - 5  (produces NaN)
 *   - true < "world" (JavaScript coercion)
 *   - null + 10 (produces 10)
 *
 * These tests expect proper EvaluationError to be thrown for incompatible types.
 */

describe('Binary Operators Type Safety', () => {
  let evaluator: RulesEvaluator

  // Helper to create a simple context for testing
  function createContext(resourceData: Record<string, unknown> = {}): EvaluatorContext {
    return {
      request: {
        auth: null,
        resource: { data: {} },
        method: 'get',
        path: '/databases/default/documents/test/123',
        time: new Date(),
      },
      resource: {
        data: resourceData,
        id: '123',
        __name__: 'test/123',
      },
      database: 'default',
    }
  }

  beforeEach(() => {
    evaluator = createEvaluator()
  })

  describe('Less Than Operator (<) - Type Safety', () => {
    it('should throw EvaluationError when comparing string < number', () => {
      const context = createContext({ str: 'hello', num: 5 })

      expect(() => evaluator.evaluate('resource.data.str < resource.data.num', context))
        .toThrow(EvaluationError)
    })

    it('should throw EvaluationError when comparing number < string', () => {
      const context = createContext({ str: 'hello', num: 5 })

      expect(() => evaluator.evaluate('resource.data.num < resource.data.str', context))
        .toThrow(EvaluationError)
    })

    it('should throw EvaluationError when comparing boolean < number', () => {
      const context = createContext({ bool: true, num: 5 })

      expect(() => evaluator.evaluate('resource.data.bool < resource.data.num', context))
        .toThrow(EvaluationError)
    })

    it('should throw EvaluationError when comparing null < number', () => {
      const context = createContext({ nullVal: null, num: 5 })

      expect(() => evaluator.evaluate('resource.data.nullVal < resource.data.num', context))
        .toThrow(EvaluationError)
    })

    it('should throw EvaluationError when comparing array < number', () => {
      const context = createContext({ arr: [1, 2, 3], num: 5 })

      expect(() => evaluator.evaluate('resource.data.arr < resource.data.num', context))
        .toThrow(EvaluationError)
    })

    it('should throw EvaluationError when comparing object < number', () => {
      const context = createContext({ obj: { a: 1 }, num: 5 })

      expect(() => evaluator.evaluate('resource.data.obj < resource.data.num', context))
        .toThrow(EvaluationError)
    })
  })

  describe('Greater Than Operator (>) - Type Safety', () => {
    it('should throw EvaluationError when comparing string > number', () => {
      const context = createContext({ str: 'hello', num: 5 })

      expect(() => evaluator.evaluate('resource.data.str > resource.data.num', context))
        .toThrow(EvaluationError)
    })

    it('should throw EvaluationError when comparing boolean > string', () => {
      const context = createContext({ bool: true, str: 'hello' })

      expect(() => evaluator.evaluate('resource.data.bool > resource.data.str', context))
        .toThrow(EvaluationError)
    })

    it('should throw EvaluationError when comparing null > string', () => {
      const context = createContext({ nullVal: null, str: 'hello' })

      expect(() => evaluator.evaluate('resource.data.nullVal > resource.data.str', context))
        .toThrow(EvaluationError)
    })
  })

  describe('Less Than or Equal Operator (<=) - Type Safety', () => {
    it('should throw EvaluationError when comparing string <= number', () => {
      const context = createContext({ str: 'hello', num: 5 })

      expect(() => evaluator.evaluate('resource.data.str <= resource.data.num', context))
        .toThrow(EvaluationError)
    })

    it('should throw EvaluationError when comparing boolean <= number', () => {
      const context = createContext({ bool: false, num: 0 })

      expect(() => evaluator.evaluate('resource.data.bool <= resource.data.num', context))
        .toThrow(EvaluationError)
    })
  })

  describe('Greater Than or Equal Operator (>=) - Type Safety', () => {
    it('should throw EvaluationError when comparing string >= number', () => {
      const context = createContext({ str: 'hello', num: 5 })

      expect(() => evaluator.evaluate('resource.data.str >= resource.data.num', context))
        .toThrow(EvaluationError)
    })

    it('should throw EvaluationError when comparing array >= string', () => {
      const context = createContext({ arr: [1, 2], str: 'hello' })

      expect(() => evaluator.evaluate('resource.data.arr >= resource.data.str', context))
        .toThrow(EvaluationError)
    })
  })

  describe('Addition Operator (+) - Type Safety', () => {
    it('should throw EvaluationError when adding boolean + number', () => {
      const context = createContext({ bool: true, num: 5 })

      expect(() => evaluator.evaluate('resource.data.bool + resource.data.num', context))
        .toThrow(EvaluationError)
    })

    it('should throw EvaluationError when adding null + number', () => {
      const context = createContext({ nullVal: null, num: 5 })

      expect(() => evaluator.evaluate('resource.data.nullVal + resource.data.num', context))
        .toThrow(EvaluationError)
    })

    it('should throw EvaluationError when adding array + number', () => {
      const context = createContext({ arr: [1, 2], num: 5 })

      expect(() => evaluator.evaluate('resource.data.arr + resource.data.num', context))
        .toThrow(EvaluationError)
    })

    it('should throw EvaluationError when adding object + string', () => {
      const context = createContext({ obj: { a: 1 }, str: 'hello' })

      expect(() => evaluator.evaluate('resource.data.obj + resource.data.str', context))
        .toThrow(EvaluationError)
    })

    // Note: string + string is valid (concatenation), number + number is valid
    it('should allow number + number (valid operation)', () => {
      const context = createContext({ a: 5, b: 3 })

      expect(() => evaluator.evaluate('resource.data.a + resource.data.b', context))
        .not.toThrow()
      expect(evaluator.evaluate('resource.data.a + resource.data.b', context)).toBe(8)
    })

    it('should allow string + string (valid concatenation)', () => {
      const context = createContext({ a: 'hello', b: ' world' })

      expect(() => evaluator.evaluate('resource.data.a + resource.data.b', context))
        .not.toThrow()
      expect(evaluator.evaluate('resource.data.a + resource.data.b', context)).toBe('hello world')
    })

    it('should throw EvaluationError when adding string + number (mixed types)', () => {
      const context = createContext({ str: 'count: ', num: 5 })

      // This is a key test - JavaScript would coerce this to "count: 5"
      // but Firebase rules should be strict about types
      expect(() => evaluator.evaluate('resource.data.str + resource.data.num', context))
        .toThrow(EvaluationError)
    })
  })

  describe('Subtraction Operator (-) - Type Safety', () => {
    it('should throw EvaluationError when subtracting string - number', () => {
      const context = createContext({ str: 'hello', num: 5 })

      expect(() => evaluator.evaluate('resource.data.str - resource.data.num', context))
        .toThrow(EvaluationError)
    })

    it('should throw EvaluationError when subtracting number - string', () => {
      const context = createContext({ num: 10, str: '5' })

      // JavaScript would coerce "5" to 5 and return 5
      // But rules should be type-strict
      expect(() => evaluator.evaluate('resource.data.num - resource.data.str', context))
        .toThrow(EvaluationError)
    })

    it('should throw EvaluationError when subtracting boolean - number', () => {
      const context = createContext({ bool: true, num: 1 })

      // JavaScript: true - 1 = 0
      expect(() => evaluator.evaluate('resource.data.bool - resource.data.num', context))
        .toThrow(EvaluationError)
    })

    it('should throw EvaluationError when subtracting null - number', () => {
      const context = createContext({ nullVal: null, num: 5 })

      // JavaScript: null - 5 = -5
      expect(() => evaluator.evaluate('resource.data.nullVal - resource.data.num', context))
        .toThrow(EvaluationError)
    })

    it('should throw EvaluationError when subtracting array - array', () => {
      const context = createContext({ arr1: [1, 2], arr2: [1] })

      expect(() => evaluator.evaluate('resource.data.arr1 - resource.data.arr2', context))
        .toThrow(EvaluationError)
    })

    it('should allow number - number (valid operation)', () => {
      const context = createContext({ a: 10, b: 3 })

      expect(() => evaluator.evaluate('resource.data.a - resource.data.b', context))
        .not.toThrow()
      expect(evaluator.evaluate('resource.data.a - resource.data.b', context)).toBe(7)
    })
  })

  describe('Multiplication Operator (*) - Type Safety', () => {
    it('should throw EvaluationError when multiplying string * number', () => {
      const context = createContext({ str: 'hello', num: 3 })

      expect(() => evaluator.evaluate('resource.data.str * resource.data.num', context))
        .toThrow(EvaluationError)
    })

    it('should throw EvaluationError when multiplying boolean * number', () => {
      const context = createContext({ bool: true, num: 5 })

      // JavaScript: true * 5 = 5
      expect(() => evaluator.evaluate('resource.data.bool * resource.data.num', context))
        .toThrow(EvaluationError)
    })

    it('should throw EvaluationError when multiplying null * number', () => {
      const context = createContext({ nullVal: null, num: 5 })

      // JavaScript: null * 5 = 0
      expect(() => evaluator.evaluate('resource.data.nullVal * resource.data.num', context))
        .toThrow(EvaluationError)
    })

    it('should throw EvaluationError when multiplying array * number', () => {
      const context = createContext({ arr: [1, 2], num: 2 })

      expect(() => evaluator.evaluate('resource.data.arr * resource.data.num', context))
        .toThrow(EvaluationError)
    })

    it('should allow number * number (valid operation)', () => {
      const context = createContext({ a: 4, b: 3 })

      expect(() => evaluator.evaluate('resource.data.a * resource.data.b', context))
        .not.toThrow()
      expect(evaluator.evaluate('resource.data.a * resource.data.b', context)).toBe(12)
    })
  })

  describe('Division Operator (/) - Type Safety', () => {
    it('should throw EvaluationError when dividing string / number', () => {
      const context = createContext({ str: 'hello', num: 5 })

      expect(() => evaluator.evaluate('resource.data.str / resource.data.num', context))
        .toThrow(EvaluationError)
    })

    it('should throw EvaluationError when dividing number / string', () => {
      const context = createContext({ num: 10, str: '2' })

      // JavaScript: 10 / "2" = 5
      expect(() => evaluator.evaluate('resource.data.num / resource.data.str', context))
        .toThrow(EvaluationError)
    })

    it('should throw EvaluationError when dividing boolean / number', () => {
      const context = createContext({ bool: true, num: 2 })

      // JavaScript: true / 2 = 0.5
      expect(() => evaluator.evaluate('resource.data.bool / resource.data.num', context))
        .toThrow(EvaluationError)
    })

    it('should throw EvaluationError when dividing null / number', () => {
      const context = createContext({ nullVal: null, num: 5 })

      // JavaScript: null / 5 = 0
      expect(() => evaluator.evaluate('resource.data.nullVal / resource.data.num', context))
        .toThrow(EvaluationError)
    })

    it('should allow number / number (valid operation)', () => {
      const context = createContext({ a: 10, b: 2 })

      expect(() => evaluator.evaluate('resource.data.a / resource.data.b', context))
        .not.toThrow()
      expect(evaluator.evaluate('resource.data.a / resource.data.b', context)).toBe(5)
    })

    it('should handle division by zero correctly', () => {
      const context = createContext({ a: 10, b: 0 })

      // Division by zero throws EvaluationError (consistent with division-by-zero.test.ts)
      expect(() => evaluator.evaluate('resource.data.a / resource.data.b', context))
        .toThrow(EvaluationError)
    })
  })

  describe('Modulo Operator (%) - Type Safety', () => {
    it('should throw EvaluationError when using modulo with string % number', () => {
      const context = createContext({ str: 'hello', num: 3 })

      expect(() => evaluator.evaluate('resource.data.str % resource.data.num', context))
        .toThrow(EvaluationError)
    })

    it('should throw EvaluationError when using modulo with number % string', () => {
      const context = createContext({ num: 10, str: '3' })

      // JavaScript: 10 % "3" = 1
      expect(() => evaluator.evaluate('resource.data.num % resource.data.str', context))
        .toThrow(EvaluationError)
    })

    it('should throw EvaluationError when using modulo with boolean % number', () => {
      const context = createContext({ bool: true, num: 2 })

      // JavaScript: true % 2 = 1
      expect(() => evaluator.evaluate('resource.data.bool % resource.data.num', context))
        .toThrow(EvaluationError)
    })

    it('should throw EvaluationError when using modulo with null % number', () => {
      const context = createContext({ nullVal: null, num: 5 })

      // JavaScript: null % 5 = 0
      expect(() => evaluator.evaluate('resource.data.nullVal % resource.data.num', context))
        .toThrow(EvaluationError)
    })

    it('should throw EvaluationError when using modulo with array % number', () => {
      const context = createContext({ arr: [10], num: 3 })

      expect(() => evaluator.evaluate('resource.data.arr % resource.data.num', context))
        .toThrow(EvaluationError)
    })

    it('should allow number % number (valid operation)', () => {
      const context = createContext({ a: 10, b: 3 })

      expect(() => evaluator.evaluate('resource.data.a % resource.data.b', context))
        .not.toThrow()
      expect(evaluator.evaluate('resource.data.a % resource.data.b', context)).toBe(1)
    })
  })

  describe('Error Messages Should Be Descriptive', () => {
    it('should include type information in error message for comparison operators', () => {
      const context = createContext({ str: 'hello', num: 5 })

      try {
        evaluator.evaluate('resource.data.str < resource.data.num', context)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).toBeInstanceOf(EvaluationError)
        const message = (error as EvaluationError).message.toLowerCase()
        // Error message should mention the operator and types
        expect(message).toMatch(/(type|cannot|invalid|incompatible|<|comparison)/i)
      }
    })

    it('should include type information in error message for arithmetic operators', () => {
      const context = createContext({ str: 'hello', num: 5 })

      try {
        evaluator.evaluate('resource.data.str - resource.data.num', context)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).toBeInstanceOf(EvaluationError)
        const message = (error as EvaluationError).message.toLowerCase()
        // Error message should mention the operator and types
        expect(message).toMatch(/(type|cannot|invalid|incompatible|-|subtract|arithmetic)/i)
      }
    })
  })

  describe('Edge Cases with Undefined Values', () => {
    it('should throw EvaluationError when comparing undefined < number', () => {
      const context = createContext({ num: 5 })
      // resource.data.undefined will be null (missing field)

      expect(() => evaluator.evaluate('resource.data.undefined < resource.data.num', context))
        .toThrow(EvaluationError)
    })

    it('should throw EvaluationError when adding undefined + number', () => {
      const context = createContext({ num: 5 })

      expect(() => evaluator.evaluate('resource.data.undefined + resource.data.num', context))
        .toThrow(EvaluationError)
    })
  })

  describe('Valid Same-Type Comparisons Should Still Work', () => {
    it('should allow number < number', () => {
      const context = createContext({ a: 3, b: 5 })
      expect(evaluator.evaluate('resource.data.a < resource.data.b', context)).toBe(true)
    })

    it('should allow number > number', () => {
      const context = createContext({ a: 5, b: 3 })
      expect(evaluator.evaluate('resource.data.a > resource.data.b', context)).toBe(true)
    })

    it('should allow number <= number', () => {
      const context = createContext({ a: 5, b: 5 })
      expect(evaluator.evaluate('resource.data.a <= resource.data.b', context)).toBe(true)
    })

    it('should allow number >= number', () => {
      const context = createContext({ a: 5, b: 3 })
      expect(evaluator.evaluate('resource.data.a >= resource.data.b', context)).toBe(true)
    })

    it('should allow string comparison for ordering', () => {
      const context = createContext({ a: 'apple', b: 'banana' })
      expect(evaluator.evaluate('resource.data.a < resource.data.b', context)).toBe(true)
    })
  })
})
