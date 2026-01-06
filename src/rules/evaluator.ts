/**
 * Firebase Security Rules Expression Evaluator
 *
 * This module evaluates parsed security rules expressions in a given context.
 * It handles all operators, member expressions, function calls, and provides
 * context with request, resource, and path variables.
 */

import type {
  ExpressionNode,
  BinaryExpressionNode,
  UnaryExpressionNode,
  MemberExpressionNode,
  CallExpressionNode,
  IdentifierNode,
  StringLiteralNode,
  NumberLiteralNode,
  BooleanLiteralNode,
  NullLiteralNode,
  ArrayLiteralNode,
} from './parser'
import { safeRegexTest, RegexSecurityError } from './safe-regex'

// ============================================================================
// Context Types
// ============================================================================

export interface AuthContext {
  uid: string | null
  token: {
    email?: string
    email_verified?: boolean
    phone_number?: string
    name?: string
    [key: string]: unknown // custom claims
  }
}

export interface RequestContext {
  auth: AuthContext | null
  resource: {
    data: Record<string, unknown>
  }
  method: 'get' | 'list' | 'create' | 'update' | 'delete'
  path: string
  time: Date
}

export interface ResourceContext {
  data: Record<string, unknown>
  id: string
  __name__: string
}

export interface EvaluatorContext {
  request: RequestContext
  resource: ResourceContext | null
  database: string
}

// ============================================================================
// Evaluation Error
// ============================================================================

export class EvaluationError extends Error {
  constructor(message: string, public readonly expression?: string) {
    super(message)
    this.name = 'EvaluationError'
  }
}

// ============================================================================
// Simple Expression Parser
// ============================================================================

/**
 * Simple tokenizer for parsing expressions
 */
class Tokenizer {
  private pos = 0
  private line = 1
  private column = 1

  constructor(private source: string) {}

  private get current(): string {
    return this.source[this.pos]
  }

  private peek(offset = 1): string {
    return this.source[this.pos + offset]
  }

  private advance(): void {
    if (this.current === '\n') {
      this.line++
      this.column = 1
    } else {
      this.column++
    }
    this.pos++
  }

  private skipWhitespace(): void {
    while (this.pos < this.source.length && /\s/.test(this.current)) {
      this.advance()
    }
  }

  public tokenize(): Token[] {
    const tokens: Token[] = []

    while (this.pos < this.source.length) {
      this.skipWhitespace()
      if (this.pos >= this.source.length) break

      const start = this.pos
      const line = this.line
      const column = this.column

      // String literals
      if (this.current === '"' || this.current === "'") {
        const quote = this.current
        this.advance()
        let value = ''
        while (this.pos < this.source.length && this.current !== quote) {
          if ((this.current as string) === '\\') {
            this.advance()
            if (this.pos < this.source.length) {
              const escaped = this.current as string
              switch (escaped) {
                case 'n':
                  value += '\n'
                  break
                case 't':
                  value += '\t'
                  break
                case 'r':
                  value += '\r'
                  break
                case '\\':
                  value += '\\'
                  break
                case '"':
                  value += '"'
                  break
                case "'":
                  value += "'"
                  break
                default:
                  value += escaped
              }
              this.advance()
            }
          } else {
            value += this.current
            this.advance()
          }
        }
        if (this.current === quote) {
          this.advance()
        }
        tokens.push({ type: 'string', value, start, end: this.pos, line, column })
        continue
      }

      // Numbers
      if (/[0-9]/.test(this.current)) {
        let value = ''
        while (this.pos < this.source.length && /[0-9.]/.test(this.current)) {
          value += this.current
          this.advance()
        }
        tokens.push({ type: 'number', value, start, end: this.pos, line, column })
        continue
      }

      // Two-character operators
      if (this.pos + 1 < this.source.length) {
        const twoChar = this.current + this.peek()
        if (['==', '!=', '<=', '>=', '&&', '||'].includes(twoChar)) {
          this.advance()
          this.advance()
          tokens.push({ type: 'operator', value: twoChar, start, end: this.pos, line, column })
          continue
        }
      }

      // Path literals starting with /
      if (this.current === '/') {
        let value = '/'
        this.advance()
        // Track depth of $() interpolation
        let interpolationDepth = 0
        while (this.pos < this.source.length) {
          // Handle $( interpolation start
          if ((this.current as string) === '$' && this.peek() === '(') {
            value += this.current
            this.advance()
            value += this.current
            this.advance()
            interpolationDepth++
            continue
          }
          // Handle ) - check if it closes interpolation or the function call
          if ((this.current as string) === ')') {
            if (interpolationDepth > 0) {
              value += this.current
              this.advance()
              interpolationDepth--
              continue
            } else {
              // This closes the function call, stop here
              break
            }
          }
          // Regular path characters
          if (/[a-zA-Z0-9_/.$-]/.test(this.current)) {
            value += this.current
            this.advance()
          } else {
            break
          }
        }
        // If we captured more than just '/', treat it as a path literal (like a string)
        if (value.length > 1) {
          tokens.push({ type: 'string', value, start, end: this.pos, line, column })
          continue
        } else {
          // Otherwise it's a division operator
          tokens.push({ type: 'operator', value: '/', start, end: this.pos, line, column })
          continue
        }
      }

      // Single-character operators and punctuation
      if ('()[]{},.!<>+-*%'.includes(this.current)) {
        const value = this.current
        this.advance()
        tokens.push({ type: 'operator', value, start, end: this.pos, line, column })
        continue
      }

      // Identifiers and keywords
      if (/[a-zA-Z_$]/.test(this.current)) {
        let value = ''
        while (this.pos < this.source.length && /[a-zA-Z0-9_$]/.test(this.current)) {
          value += this.current
          this.advance()
        }

        // Check for keywords
        if (['true', 'false', 'null', 'in'].includes(value)) {
          tokens.push({ type: 'keyword', value, start, end: this.pos, line, column })
        } else {
          tokens.push({ type: 'identifier', value, start, end: this.pos, line, column })
        }
        continue
      }

      throw new EvaluationError(`Unexpected character: ${this.current} at line ${line}, column ${column}`)
    }

    return tokens
  }
}

interface Token {
  type: 'string' | 'number' | 'identifier' | 'operator' | 'keyword'
  value: string
  start: number
  end: number
  line: number
  column: number
}

/**
 * Simple recursive descent parser for expressions
 */
class ExpressionParser {
  private pos = 0

  constructor(private tokens: Token[]) {}

  private get current(): Token | undefined {
    return this.tokens[this.pos]
  }

  private peek(offset = 1): Token | undefined {
    return this.tokens[this.pos + offset]
  }

  private advance(): Token {
    return this.tokens[this.pos++]
  }

  private expect(type: Token['type'], value?: string): Token {
    if (!this.current || this.current.type !== type || (value && this.current.value !== value)) {
      throw new EvaluationError(
        `Expected ${type}${value ? ` '${value}'` : ''}, got ${this.current?.type} '${this.current?.value}'`
      )
    }
    return this.advance()
  }

  public parse(): ExpressionNode {
    return this.parseLogicalOr()
  }

  private parseLogicalOr(): ExpressionNode {
    let left = this.parseLogicalAnd()

    while (this.current?.type === 'operator' && this.current.value === '||') {
      const operator = this.advance()
      const right = this.parseLogicalAnd()
      left = {
        type: 'BinaryExpression',
        operator: '||',
        left,
        right,
        start: left.start,
        end: right.end,
        line: operator.line,
        column: operator.column,
      }
    }

    return left
  }

  private parseLogicalAnd(): ExpressionNode {
    let left = this.parseComparison()

    while (this.current?.type === 'operator' && this.current.value === '&&') {
      const operator = this.advance()
      const right = this.parseComparison()
      left = {
        type: 'BinaryExpression',
        operator: '&&',
        left,
        right,
        start: left.start,
        end: right.end,
        line: operator.line,
        column: operator.column,
      }
    }

    return left
  }

  private parseComparison(): ExpressionNode {
    let left = this.parseAdditive()

    while (
      this.current?.type === 'operator' &&
      ['==', '!=', '<', '>', '<=', '>='].includes(this.current.value)
    ) {
      const operator = this.advance()
      const right = this.parseAdditive()
      left = {
        type: 'BinaryExpression',
        operator: operator.value as any,
        left,
        right,
        start: left.start,
        end: right.end,
        line: operator.line,
        column: operator.column,
      }
    }

    // Handle 'in' operator
    if (this.current?.type === 'keyword' && this.current.value === 'in') {
      const operator = this.advance()
      const right = this.parseAdditive()
      left = {
        type: 'BinaryExpression',
        operator: 'in',
        left,
        right,
        start: left.start,
        end: right.end,
        line: operator.line,
        column: operator.column,
      }
    }

    return left
  }

  private parseAdditive(): ExpressionNode {
    let left = this.parseMultiplicative()

    while (this.current?.type === 'operator' && ['+', '-'].includes(this.current.value)) {
      const operator = this.advance()
      const right = this.parseMultiplicative()
      left = {
        type: 'BinaryExpression',
        operator: operator.value as any,
        left,
        right,
        start: left.start,
        end: right.end,
        line: operator.line,
        column: operator.column,
      }
    }

    return left
  }

  private parseMultiplicative(): ExpressionNode {
    let left = this.parseUnary()

    while (this.current?.type === 'operator' && ['*', '/', '%'].includes(this.current.value)) {
      const operator = this.advance()
      const right = this.parseUnary()
      left = {
        type: 'BinaryExpression',
        operator: operator.value as any,
        left,
        right,
        start: left.start,
        end: right.end,
        line: operator.line,
        column: operator.column,
      }
    }

    return left
  }

  private parseUnary(): ExpressionNode {
    if (this.current?.type === 'operator' && ['!', '-'].includes(this.current.value)) {
      const operator = this.advance()
      const argument = this.parseUnary()
      return {
        type: 'UnaryExpression',
        operator: operator.value as any,
        argument,
        start: operator.start,
        end: argument.end,
        line: operator.line,
        column: operator.column,
      }
    }

    return this.parsePostfix()
  }

  private parsePostfix(): ExpressionNode {
    let expr = this.parsePrimary()

    while (true) {
      // Member access with dot
      if (this.current?.type === 'operator' && this.current.value === '.') {
        this.advance()
        const property = this.expect('identifier')
        expr = {
          type: 'MemberExpression',
          object: expr,
          property: {
            type: 'Identifier',
            name: property.value,
            start: property.start,
            end: property.end,
            line: property.line,
            column: property.column,
          },
          computed: false,
          start: expr.start,
          end: property.end,
          line: property.line,
          column: property.column,
        }
      }
      // Array/computed member access
      else if (this.current?.type === 'operator' && this.current.value === '[') {
        const bracket = this.advance()
        const property = this.parse()
        this.expect('operator', ']')
        expr = {
          type: 'MemberExpression',
          object: expr,
          property,
          computed: true,
          start: expr.start,
          end: this.tokens[this.pos - 1].end,
          line: bracket.line,
          column: bracket.column,
        }
      }
      // Function call
      else if (this.current?.type === 'operator' && this.current.value === '(') {
        const paren = this.advance()
        const args: ExpressionNode[] = []

        while (this.current && !(this.current.type === 'operator' && (this.current.value as string) === ')')) {
          args.push(this.parse())
          if (this.current?.type === 'operator' && (this.current.value as string) === ',') {
            this.advance()
          }
        }

        this.expect('operator', ')')
        expr = {
          type: 'CallExpression',
          callee: expr,
          arguments: args,
          start: expr.start,
          end: this.tokens[this.pos - 1].end,
          line: paren.line,
          column: paren.column,
        }
      } else {
        break
      }
    }

    return expr
  }

  private parsePrimary(): ExpressionNode {
    if (!this.current) {
      throw new EvaluationError('Unexpected end of expression')
    }

    // Parenthesized expression
    if (this.current.type === 'operator' && this.current.value === '(') {
      this.advance()
      const expr = this.parse()
      this.expect('operator', ')')
      return expr
    }

    // Array literal
    if (this.current.type === 'operator' && this.current.value === '[') {
      const start = this.advance()
      const elements: ExpressionNode[] = []

      while (this.current && !(this.current.type === 'operator' && (this.current.value as string) === ']')) {
        elements.push(this.parse())
        if (this.current?.type === 'operator' && (this.current.value as string) === ',') {
          this.advance()
        }
      }

      const end = this.expect('operator', ']')
      return {
        type: 'ArrayLiteral',
        elements,
        start: start.start,
        end: end.end,
        line: start.line,
        column: start.column,
      }
    }

    // String literal
    if (this.current.type === 'string') {
      const token = this.advance()
      return {
        type: 'StringLiteral',
        value: token.value,
        raw: `"${token.value}"`,
        start: token.start,
        end: token.end,
        line: token.line,
        column: token.column,
      }
    }

    // Number literal
    if (this.current.type === 'number') {
      const token = this.advance()
      return {
        type: 'NumberLiteral',
        value: parseFloat(token.value),
        raw: token.value,
        start: token.start,
        end: token.end,
        line: token.line,
        column: token.column,
      }
    }

    // Boolean and null keywords
    if (this.current.type === 'keyword') {
      const token = this.advance()
      if (token.value === 'true' || token.value === 'false') {
        return {
          type: 'BooleanLiteral',
          value: token.value === 'true',
          start: token.start,
          end: token.end,
          line: token.line,
          column: token.column,
        }
      }
      if (token.value === 'null') {
        return {
          type: 'NullLiteral',
          value: null,
          start: token.start,
          end: token.end,
          line: token.line,
          column: token.column,
        }
      }
    }

    // Identifier
    if (this.current.type === 'identifier') {
      const token = this.advance()
      return {
        type: 'Identifier',
        name: token.value,
        start: token.start,
        end: token.end,
        line: token.line,
        column: token.column,
      }
    }

    throw new EvaluationError(`Unexpected token: ${this.current.type} '${this.current.value}'`)
  }
}

// ============================================================================
// Rules Evaluator
// ============================================================================

export class RulesEvaluator {
  private static readonly MAX_RECURSION_DEPTH = 100
  private documentStore: Map<string, ResourceContext | null> = new Map()

  constructor() {
    // Initialize with some mock documents for testing
    this.documentStore.set('/databases/default/documents/users/user123', {
      data: {
        role: 'admin',
        verified: true,
        email: 'user123@example.com',
      },
      id: 'user123',
      __name__: 'users/user123',
    })

    this.documentStore.set('/databases/default/documents/rate_limits/user123', {
      data: {
        commentCount: 50,
        lastReset: new Date(),
      },
      id: 'user123',
      __name__: 'rate_limits/user123',
    })

    this.documentStore.set('/databases/default/documents/organizations/org1/members/user123', {
      data: {
        role: 'member',
        joinedAt: new Date(),
      },
      id: 'user123',
      __name__: 'organizations/org1/members/user123',
    })
  }

  /**
   * Evaluates an expression string in the given context
   */
  public evaluate(expression: string, context: EvaluatorContext): unknown {
    try {
      // Handle string interpolation $(variable)
      const interpolated = this.interpolateExpression(expression, context)

      // Parse the expression
      const tokenizer = new Tokenizer(interpolated)
      const tokens = tokenizer.tokenize()
      const parser = new ExpressionParser(tokens)
      const ast = parser.parse()

      // Evaluate the AST
      return this.evaluateNode(ast, context)
    } catch (error) {
      if (error instanceof EvaluationError) {
        throw error
      }
      throw new EvaluationError(`Failed to evaluate expression: ${error instanceof Error ? error.message : String(error)}`, expression)
    }
  }

  /**
   * Gets a document by path
   */
  public get(path: string): ResourceContext | null {
    return this.documentStore.get(path) || null
  }

  /**
   * Checks if a document exists at the given path
   */
  public exists(path: string): boolean {
    return this.documentStore.has(path)
  }

  /**
   * Interpolates $(variable) expressions in the string
   */
  private interpolateExpression(expression: string, context: EvaluatorContext): string {
    return expression.replace(/\$\(([^)]+)\)/g, (_, varPath) => {
      // Parse and evaluate the variable path
      try {
        const tokenizer = new Tokenizer(varPath)
        const tokens = tokenizer.tokenize()
        const parser = new ExpressionParser(tokens)
        const ast = parser.parse()
        const value = this.evaluateNode(ast, context)
        return String(value)
      } catch {
        return ''
      }
    })
  }

  /**
   * Evaluates an AST node in the given context
   */
  private evaluateNode(node: ExpressionNode, context: EvaluatorContext, depth: number = 0): unknown {
    if (depth > RulesEvaluator.MAX_RECURSION_DEPTH) {
      throw new EvaluationError('Maximum recursion depth exceeded in rules evaluation')
    }

    switch (node.type) {
      case 'BinaryExpression':
        return this.evaluateBinaryExpression(node, context, depth + 1)
      case 'UnaryExpression':
        return this.evaluateUnaryExpression(node, context, depth + 1)
      case 'MemberExpression':
        return this.evaluateMemberExpression(node, context, depth + 1)
      case 'CallExpression':
        return this.evaluateCallExpression(node, context, depth + 1)
      case 'Identifier':
        return this.evaluateIdentifier(node, context)
      case 'StringLiteral':
        return node.value
      case 'NumberLiteral':
        return node.value
      case 'BooleanLiteral':
        return node.value
      case 'NullLiteral':
        return null
      case 'ArrayLiteral':
        return node.elements.map(el => this.evaluateNode(el, context, depth + 1))
      default:
        throw new EvaluationError(`Unsupported node type: ${(node as any).type}`)
    }
  }

  /**
   * Evaluates a binary expression with short-circuit evaluation for && and ||
   */
  private evaluateBinaryExpression(node: BinaryExpressionNode, context: EvaluatorContext, depth: number): unknown {
    const { operator, left, right } = node

    // Short-circuit evaluation for logical operators
    if (operator === '&&') {
      const leftValue = this.evaluateNode(left, context, depth)
      if (!this.isTruthy(leftValue)) {
        return false
      }
      const rightValue = this.evaluateNode(right, context, depth)
      return this.isTruthy(rightValue)
    }

    if (operator === '||') {
      const leftValue = this.evaluateNode(left, context, depth)
      if (this.isTruthy(leftValue)) {
        return true
      }
      const rightValue = this.evaluateNode(right, context, depth)
      return this.isTruthy(rightValue)
    }

    // Evaluate both operands for other operators
    const leftValue = this.evaluateNode(left, context, depth)
    const rightValue = this.evaluateNode(right, context, depth)

    switch (operator) {
      case '==':
        return leftValue === rightValue
      case '!=':
        return leftValue !== rightValue
      case '<':
        return (leftValue as any) < (rightValue as any)
      case '>':
        return (leftValue as any) > (rightValue as any)
      case '<=':
        return (leftValue as any) <= (rightValue as any)
      case '>=':
        return (leftValue as any) >= (rightValue as any)
      case '+':
        return (leftValue as any) + (rightValue as any)
      case '-':
        return (leftValue as any) - (rightValue as any)
      case '*':
        return (leftValue as any) * (rightValue as any)
      case '/':
        if (rightValue === 0) {
          throw new EvaluationError('division by zero')
        }
        return (leftValue as any) / (rightValue as any)
      case '%':
        return (leftValue as any) % (rightValue as any)
      case 'in':
        if (Array.isArray(rightValue)) {
          return rightValue.includes(leftValue)
        }
        return false
      default:
        throw new EvaluationError(`Unsupported binary operator: ${operator}`)
    }
  }

  /**
   * Evaluates a unary expression
   */
  private evaluateUnaryExpression(node: UnaryExpressionNode, context: EvaluatorContext, depth: number): unknown {
    const value = this.evaluateNode(node.argument, context, depth)

    switch (node.operator) {
      case '!':
        return !this.isTruthy(value)
      case '-':
        return -(value as number)
      default:
        throw new EvaluationError(`Unsupported unary operator: ${node.operator}`)
    }
  }

  /**
   * Evaluates a member expression (e.g., request.auth.uid)
   */
  private evaluateMemberExpression(node: MemberExpressionNode, context: EvaluatorContext, depth: number): unknown {
    const object = this.evaluateNode(node.object, context, depth)

    // Null safety: if object is null or undefined, return null
    if (object === null || object === undefined) {
      return null
    }

    // Get the property name
    let propertyName: string | number
    if (node.computed) {
      // Computed property like obj[expr]
      propertyName = this.evaluateNode(node.property, context, depth) as string | number
    } else {
      // Dot notation like obj.prop
      if (node.property.type !== 'Identifier') {
        throw new EvaluationError('Non-computed member expression must have identifier property')
      }
      propertyName = node.property.name
    }

    // Access the property
    const value = (object as any)[propertyName]

    // Return null for undefined properties (null safety)
    return value === undefined ? null : value
  }

  /**
   * Evaluates a call expression (function call)
   */
  private evaluateCallExpression(node: CallExpressionNode, context: EvaluatorContext, depth: number): unknown {
    // Check if this is a method call (member expression callee)
    if (node.callee.type === 'MemberExpression') {
      const object = this.evaluateNode(node.callee.object, context, depth)
      const methodName =
        node.callee.property.type === 'Identifier' ? node.callee.property.name : String(this.evaluateNode(node.callee.property, context, depth))

      // Evaluate arguments
      const args = node.arguments.map(arg => this.evaluateNode(arg, context, depth))

      return this.callMethod(object, methodName, args, context)
    }

    // Check if this is a builtin function call
    if (node.callee.type === 'Identifier') {
      const functionName = node.callee.name
      const args = node.arguments.map(arg => this.evaluateNode(arg, context, depth))

      return this.callBuiltin(functionName, args, context)
    }

    throw new EvaluationError('Unsupported call expression')
  }

  /**
   * Evaluates an identifier (variable reference)
   */
  private evaluateIdentifier(node: IdentifierNode, context: EvaluatorContext): unknown {
    const { name } = node

    // Check context variables
    if (name === 'request') {
      return context.request
    }
    if (name === 'resource') {
      return context.resource
    }
    if (name === 'database') {
      return context.database
    }

    throw new EvaluationError(`Unknown identifier: ${name}`)
  }

  /**
   * Calls a builtin function
   */
  private callBuiltin(name: string, args: unknown[], context: EvaluatorContext): unknown {
    switch (name) {
      case 'get': {
        if (args.length !== 1) {
          throw new EvaluationError(`get() expects 1 argument, got ${args.length}`)
        }
        const path = String(args[0])
        return this.get(path)
      }

      case 'exists': {
        if (args.length !== 1) {
          throw new EvaluationError(`exists() expects 1 argument, got ${args.length}`)
        }
        const path = String(args[0])
        return this.exists(path)
      }

      default:
        throw new EvaluationError(`Unknown builtin function: ${name}`)
    }
  }

  /**
   * Calls a method on an object
   */
  private callMethod(object: unknown, methodName: string, args: unknown[], context: EvaluatorContext): unknown {
    if (object === null || object === undefined) {
      throw new EvaluationError(`Cannot call method '${methodName}' on null or undefined`)
    }

    // String methods
    if (typeof object === 'string') {
      switch (methodName) {
        case 'matches': {
          if (args.length !== 1) {
            throw new EvaluationError(`matches() expects 1 argument, got ${args.length}`)
          }
          const pattern = String(args[0])
          // Use safe regex execution to prevent ReDoS attacks
          const result = safeRegexTest(pattern, object)
          if (!result.success) {
            if (result.rejectedForSafety) {
              throw new EvaluationError(`Regex pattern rejected for security: ${result.error}`)
            }
            throw new EvaluationError(`Invalid regex pattern: ${result.error}`)
          }
          return result.result
        }

        case 'size': {
          if (args.length !== 0) {
            throw new EvaluationError(`size() expects 0 arguments, got ${args.length}`)
          }
          return object.length
        }
      }
    }

    // Array methods
    if (Array.isArray(object)) {
      switch (methodName) {
        case 'hasAny': {
          if (args.length !== 1) {
            throw new EvaluationError(`hasAny() expects 1 argument, got ${args.length}`)
          }
          const items = args[0]
          if (!Array.isArray(items)) {
            throw new EvaluationError('hasAny() argument must be an array')
          }
          return items.some(item => object.includes(item))
        }

        case 'hasAll': {
          if (args.length !== 1) {
            throw new EvaluationError(`hasAll() expects 1 argument, got ${args.length}`)
          }
          const items = args[0]
          if (!Array.isArray(items)) {
            throw new EvaluationError('hasAll() argument must be an array')
          }
          return items.every(item => object.includes(item))
        }

        case 'size': {
          if (args.length !== 0) {
            throw new EvaluationError(`size() expects 0 arguments, got ${args.length}`)
          }
          return object.length
        }
      }
    }

    throw new EvaluationError(`Unknown method '${methodName}' on type ${typeof object}`)
  }

  /**
   * Determines if a value is truthy (for logical operations)
   */
  private isTruthy(value: unknown): boolean {
    if (value === null || value === undefined) {
      return false
    }
    if (typeof value === 'boolean') {
      return value
    }
    if (typeof value === 'number') {
      return value !== 0
    }
    if (typeof value === 'string') {
      return value.length > 0
    }
    return true
  }
}

/**
 * Creates a new evaluator instance
 */
export function createEvaluator(): RulesEvaluator {
  return new RulesEvaluator()
}
