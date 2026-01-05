/**
 * Firebase Security Rules DSL Parser
 *
 * This module parses Firebase Security Rules DSL into an Abstract Syntax Tree (AST).
 * It supports Firestore and Storage security rules syntax.
 */

// ============================================================================
// AST Node Types
// ============================================================================

export type ASTNodeType =
  | 'RulesFile'
  | 'ServiceDeclaration'
  | 'MatchBlock'
  | 'PathPattern'
  | 'PathSegment'
  | 'PathVariable'
  | 'WildcardVariable'
  | 'FunctionDeclaration'
  | 'FunctionParameter'
  | 'AllowStatement'
  | 'IfCondition'
  | 'BinaryExpression'
  | 'UnaryExpression'
  | 'MemberExpression'
  | 'CallExpression'
  | 'Identifier'
  | 'StringLiteral'
  | 'NumberLiteral'
  | 'BooleanLiteral'
  | 'NullLiteral'
  | 'ArrayLiteral'
  | 'Comment'
  | 'BlockComment'

export interface ASTNode {
  type: ASTNodeType
  start: number
  end: number
  line: number
  column: number
}

export interface RulesFileNode extends ASTNode {
  type: 'RulesFile'
  version: string
  services: ServiceDeclarationNode[]
  comments: (CommentNode | BlockCommentNode)[]
}

export interface ServiceDeclarationNode extends ASTNode {
  type: 'ServiceDeclaration'
  service: 'cloud.firestore' | 'firebase.storage'
  body: MatchBlockNode[]
}

export interface MatchBlockNode extends ASTNode {
  type: 'MatchBlock'
  path: PathPatternNode
  body: (MatchBlockNode | AllowStatementNode | FunctionDeclarationNode)[]
}

export interface PathPatternNode extends ASTNode {
  type: 'PathPattern'
  segments: (PathSegmentNode | PathVariableNode | WildcardVariableNode)[]
  raw: string
}

export interface PathSegmentNode extends ASTNode {
  type: 'PathSegment'
  value: string
}

export interface PathVariableNode extends ASTNode {
  type: 'PathVariable'
  name: string
}

export interface WildcardVariableNode extends ASTNode {
  type: 'WildcardVariable'
  name: string
  recursive: boolean
}

export interface FunctionDeclarationNode extends ASTNode {
  type: 'FunctionDeclaration'
  name: string
  parameters: FunctionParameterNode[]
  body: ExpressionNode
}

export interface FunctionParameterNode extends ASTNode {
  type: 'FunctionParameter'
  name: string
}

export type AllowOperation =
  | 'read'
  | 'write'
  | 'get'
  | 'list'
  | 'create'
  | 'update'
  | 'delete'

export interface AllowStatementNode extends ASTNode {
  type: 'AllowStatement'
  operations: AllowOperation[]
  condition: ExpressionNode | null
}

export interface IfConditionNode extends ASTNode {
  type: 'IfCondition'
  condition: ExpressionNode
}

export type BinaryOperator =
  | '&&'
  | '||'
  | '=='
  | '!='
  | '<'
  | '>'
  | '<='
  | '>='
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | 'in'

export interface BinaryExpressionNode extends ASTNode {
  type: 'BinaryExpression'
  operator: BinaryOperator
  left: ExpressionNode
  right: ExpressionNode
}

export type UnaryOperator = '!' | '-'

export interface UnaryExpressionNode extends ASTNode {
  type: 'UnaryExpression'
  operator: UnaryOperator
  argument: ExpressionNode
}

export interface MemberExpressionNode extends ASTNode {
  type: 'MemberExpression'
  object: ExpressionNode
  property: ExpressionNode
  computed: boolean
}

export interface CallExpressionNode extends ASTNode {
  type: 'CallExpression'
  callee: ExpressionNode
  arguments: ExpressionNode[]
}

export interface IdentifierNode extends ASTNode {
  type: 'Identifier'
  name: string
}

export interface StringLiteralNode extends ASTNode {
  type: 'StringLiteral'
  value: string
  raw: string
}

export interface NumberLiteralNode extends ASTNode {
  type: 'NumberLiteral'
  value: number
  raw: string
}

export interface BooleanLiteralNode extends ASTNode {
  type: 'BooleanLiteral'
  value: boolean
}

export interface NullLiteralNode extends ASTNode {
  type: 'NullLiteral'
  value: null
}

export interface ArrayLiteralNode extends ASTNode {
  type: 'ArrayLiteral'
  elements: ExpressionNode[]
}

export interface CommentNode extends ASTNode {
  type: 'Comment'
  value: string
}

export interface BlockCommentNode extends ASTNode {
  type: 'BlockComment'
  value: string
}

export type ExpressionNode =
  | BinaryExpressionNode
  | UnaryExpressionNode
  | MemberExpressionNode
  | CallExpressionNode
  | IdentifierNode
  | StringLiteralNode
  | NumberLiteralNode
  | BooleanLiteralNode
  | NullLiteralNode
  | ArrayLiteralNode

export type RulesAST = RulesFileNode

// ============================================================================
// Error Types
// ============================================================================

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly line: number,
    public readonly column: number,
    public readonly offset: number,
    public readonly source?: string
  ) {
    super(`${message} at line ${line}, column ${column}`)
    this.name = 'ParseError'
  }
}

export class LexerError extends ParseError {
  constructor(
    message: string,
    line: number,
    column: number,
    offset: number,
    source?: string
  ) {
    super(message, line, column, offset, source)
    this.name = 'LexerError'
  }
}

export class SyntaxError extends ParseError {
  constructor(
    message: string,
    line: number,
    column: number,
    offset: number,
    public readonly token?: string,
    source?: string
  ) {
    super(message, line, column, offset, source)
    this.name = 'SyntaxError'
  }
}

// ============================================================================
// Parser Options
// ============================================================================

export interface ParseOptions {
  /** Include comments in the AST */
  preserveComments?: boolean
  /** Include source location information */
  locations?: boolean
  /** Source file name for error messages */
  sourceFile?: string
}

// ============================================================================
// Parser Result
// ============================================================================

export interface ParseResult {
  ast: RulesAST
  errors: ParseError[]
  warnings: string[]
}

// ============================================================================
// Lexer/Tokenizer
// ============================================================================

enum TokenType {
  // Keywords
  RULES_VERSION = 'RULES_VERSION',
  SERVICE = 'SERVICE',
  MATCH = 'MATCH',
  ALLOW = 'ALLOW',
  IF = 'IF',
  FUNCTION = 'FUNCTION',
  RETURN = 'RETURN',

  // Literals
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  TRUE = 'TRUE',
  FALSE = 'FALSE',
  NULL = 'NULL',

  // Identifiers and paths
  IDENTIFIER = 'IDENTIFIER',
  PATH = 'PATH',

  // Operators
  EQUALS = 'EQUALS',
  EQUAL_EQUAL = 'EQUAL_EQUAL',
  NOT_EQUAL = 'NOT_EQUAL',
  LESS_THAN = 'LESS_THAN',
  GREATER_THAN = 'GREATER_THAN',
  LESS_EQUAL = 'LESS_EQUAL',
  GREATER_EQUAL = 'GREATER_EQUAL',
  AND = 'AND',
  OR = 'OR',
  NOT = 'NOT',
  IN = 'IN',
  IS = 'IS',
  PLUS = 'PLUS',
  MINUS = 'MINUS',
  MULTIPLY = 'MULTIPLY',
  DIVIDE = 'DIVIDE',
  MODULO = 'MODULO',

  // Punctuation
  SEMICOLON = 'SEMICOLON',
  COLON = 'COLON',
  COMMA = 'COMMA',
  DOT = 'DOT',
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  LBRACE = 'LBRACE',
  RBRACE = 'RBRACE',
  LBRACKET = 'LBRACKET',
  RBRACKET = 'RBRACKET',
  DOLLAR = 'DOLLAR',

  // Comments
  COMMENT = 'COMMENT',
  BLOCK_COMMENT = 'BLOCK_COMMENT',

  // Special
  EOF = 'EOF',
}

interface Token {
  type: TokenType
  value: string
  start: number
  end: number
  line: number
  column: number
}

class Lexer {
  private source: string
  private pos = 0
  private line = 1
  private column = 0
  private tokens: Token[] = []

  constructor(source: string) {
    this.source = source
  }

  tokenize(): Token[] {
    while (this.pos < this.source.length) {
      this.skipWhitespace()
      if (this.pos >= this.source.length) break

      // Comments
      if (this.peek() === '/' && this.peekNext() === '/') {
        this.scanLineComment()
        continue
      }
      if (this.peek() === '/' && this.peekNext() === '*') {
        this.scanBlockComment()
        continue
      }

      // Path pattern (starts with /)
      // Check if this looks like a path (contains { or } or $ which indicates path interpolation)
      if (this.peek() === '/' && this.isPathStart()) {
        this.scanPath()
        continue
      }

      // String literals
      if (this.peek() === '"' || this.peek() === "'") {
        this.scanString()
        continue
      }

      // Numbers
      if (this.isDigit(this.peek())) {
        this.scanNumber()
        continue
      }

      // Keywords and identifiers
      if (this.isAlpha(this.peek())) {
        this.scanIdentifierOrKeyword()
        continue
      }

      // Operators and punctuation
      if (this.scanOperatorOrPunctuation()) {
        continue
      }

      throw new LexerError(
        `Unexpected character '${this.peek()}'`,
        this.line,
        this.column,
        this.pos,
        this.source
      )
    }

    this.tokens.push({
      type: TokenType.EOF,
      value: '',
      start: this.pos,
      end: this.pos,
      line: this.line,
      column: this.column,
    })

    return this.tokens
  }

  private peek(): string {
    return this.source[this.pos] || ''
  }

  private peekNext(): string {
    return this.source[this.pos + 1] || ''
  }

  private advance(): string {
    const char = this.source[this.pos++]
    if (char === '\n') {
      this.line++
      this.column = 0
    } else {
      this.column++
    }
    return char
  }

  private skipWhitespace(): void {
    while (this.pos < this.source.length && /\s/.test(this.peek())) {
      this.advance()
    }
  }

  private isDigit(char: string): boolean {
    return /[0-9]/.test(char)
  }

  private isAlpha(char: string): boolean {
    return /[a-zA-Z_]/.test(char)
  }

  private isAlphaNumeric(char: string): boolean {
    return /[a-zA-Z0-9_]/.test(char)
  }

  private isPathStart(): boolean {
    // Check if this looks like a path pattern (e.g., /databases/{id}/... or /databases/$(id)/...)
    const saved = this.pos
    this.pos++
    let hasPathIndicator = false

    while (this.pos < this.source.length) {
      const char = this.peek()

      // Path indicators: {, }, $
      if (char === '{' || char === '}' || char === '$') {
        hasPathIndicator = true
      }

      // If we hit whitespace or certain punctuation, stop
      if (/\s/.test(char) || char === ';' || char === ':' || char === ')') {
        this.pos = saved
        return hasPathIndicator
      }

      // Continue through path characters
      if (char === '/' || char === '(' || char === ')' || this.isAlphaNumeric(char) || char === '-' || char === '_' || char === '=' || char === '*' || char === '$' || char === '{' || char === '}') {
        this.pos++
        continue
      }

      break
    }

    this.pos = saved
    return hasPathIndicator
  }

  private scanPath(): void {
    const start = this.pos
    const startLine = this.line
    const startColumn = this.column

    let value = ''
    let parenDepth = 0 // Track $() nesting

    while (this.pos < this.source.length) {
      const char = this.peek()

      // Track parentheses for $() interpolation
      if (char === '$' && this.peekNext() === '(') {
        value += this.advance() // $
        value += this.advance() // (
        parenDepth++
        continue
      }

      if (parenDepth > 0 && char === ')') {
        value += this.advance()
        parenDepth--
        continue
      }

      // If we're not in an interpolation and see ), that's the end of the path
      if (parenDepth === 0 && char === ')') {
        break
      }

      // Include all path characters
      if (char === '{' || char === '}' || char === '/' || this.isAlphaNumeric(char) || char === '-' || char === '_' || char === '=' || char === '*' || char === '.') {
        value += this.advance()
      } else {
        break
      }
    }

    this.tokens.push({
      type: TokenType.PATH,
      value,
      start,
      end: this.pos,
      line: startLine,
      column: startColumn,
    })
  }

  private scanString(): void {
    const start = this.pos
    const startLine = this.line
    const startColumn = this.column
    const quote = this.advance()
    let value = ''

    while (this.pos < this.source.length && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.advance()
        const escaped = this.advance()
        // Handle escape sequences
        switch (escaped) {
          case 'n': value += '\n'; break
          case 't': value += '\t'; break
          case 'r': value += '\r'; break
          case '\\': value += '\\'; break
          case '"': value += '"'; break
          case "'": value += "'"; break
          default: value += escaped
        }
      } else {
        value += this.advance()
      }
    }

    if (this.peek() !== quote) {
      throw new LexerError(
        'Unterminated string literal',
        startLine,
        startColumn,
        start,
        this.source
      )
    }

    this.advance() // closing quote

    this.tokens.push({
      type: TokenType.STRING,
      value,
      start,
      end: this.pos,
      line: startLine,
      column: startColumn,
    })
  }

  private scanNumber(): void {
    const start = this.pos
    const startLine = this.line
    const startColumn = this.column
    let value = ''

    while (this.isDigit(this.peek())) {
      value += this.advance()
    }

    if (this.peek() === '.' && this.isDigit(this.peekNext())) {
      value += this.advance() // .
      while (this.isDigit(this.peek())) {
        value += this.advance()
      }
    }

    this.tokens.push({
      type: TokenType.NUMBER,
      value,
      start,
      end: this.pos,
      line: startLine,
      column: startColumn,
    })
  }

  private scanIdentifierOrKeyword(): void {
    const start = this.pos
    const startLine = this.line
    const startColumn = this.column
    let value = ''

    // Only scan the identifier part, not dots
    while (this.isAlphaNumeric(this.peek())) {
      value += this.advance()
    }

    // Check for keywords
    let type = TokenType.IDENTIFIER
    switch (value) {
      case 'rules_version': type = TokenType.RULES_VERSION; break
      case 'service': type = TokenType.SERVICE; break
      case 'match': type = TokenType.MATCH; break
      case 'allow': type = TokenType.ALLOW; break
      case 'if': type = TokenType.IF; break
      case 'function': type = TokenType.FUNCTION; break
      case 'return': type = TokenType.RETURN; break
      case 'true': type = TokenType.TRUE; break
      case 'false': type = TokenType.FALSE; break
      case 'null': type = TokenType.NULL; break
      case 'in': type = TokenType.IN; break
      case 'is': type = TokenType.IS; break
    }

    this.tokens.push({
      type,
      value,
      start,
      end: this.pos,
      line: startLine,
      column: startColumn,
    })
  }

  private scanLineComment(): void {
    const start = this.pos
    const startLine = this.line
    const startColumn = this.column

    this.advance() // /
    this.advance() // /

    let value = ''
    while (this.pos < this.source.length && this.peek() !== '\n') {
      value += this.advance()
    }

    this.tokens.push({
      type: TokenType.COMMENT,
      value,
      start,
      end: this.pos,
      line: startLine,
      column: startColumn,
    })
  }

  private scanBlockComment(): void {
    const start = this.pos
    const startLine = this.line
    const startColumn = this.column

    this.advance() // /
    this.advance() // *

    let value = ''
    while (this.pos < this.source.length) {
      if (this.peek() === '*' && this.peekNext() === '/') {
        this.advance()
        this.advance()
        break
      }
      value += this.advance()
    }

    this.tokens.push({
      type: TokenType.BLOCK_COMMENT,
      value,
      start,
      end: this.pos,
      line: startLine,
      column: startColumn,
    })
  }

  private scanOperatorOrPunctuation(): boolean {
    const start = this.pos
    const startLine = this.line
    const startColumn = this.column
    const char = this.peek()
    const next = this.peekNext()

    let type: TokenType | null = null
    let value = ''

    // Two-character operators
    if (char === '=' && next === '=') {
      type = TokenType.EQUAL_EQUAL
      value = '=='
      this.advance()
      this.advance()
    } else if (char === '!' && next === '=') {
      type = TokenType.NOT_EQUAL
      value = '!='
      this.advance()
      this.advance()
    } else if (char === '<' && next === '=') {
      type = TokenType.LESS_EQUAL
      value = '<='
      this.advance()
      this.advance()
    } else if (char === '>' && next === '=') {
      type = TokenType.GREATER_EQUAL
      value = '>='
      this.advance()
      this.advance()
    } else if (char === '&' && next === '&') {
      type = TokenType.AND
      value = '&&'
      this.advance()
      this.advance()
    } else if (char === '|' && next === '|') {
      type = TokenType.OR
      value = '||'
      this.advance()
      this.advance()
    } else {
      // Single-character operators
      switch (char) {
        case '=': type = TokenType.EQUALS; value = '='; this.advance(); break
        case '<': type = TokenType.LESS_THAN; value = '<'; this.advance(); break
        case '>': type = TokenType.GREATER_THAN; value = '>'; this.advance(); break
        case '!': type = TokenType.NOT; value = '!'; this.advance(); break
        case '+': type = TokenType.PLUS; value = '+'; this.advance(); break
        case '-': type = TokenType.MINUS; value = '-'; this.advance(); break
        case '*': type = TokenType.MULTIPLY; value = '*'; this.advance(); break
        case '/': type = TokenType.DIVIDE; value = '/'; this.advance(); break
        case '%': type = TokenType.MODULO; value = '%'; this.advance(); break
        case ';': type = TokenType.SEMICOLON; value = ';'; this.advance(); break
        case ':': type = TokenType.COLON; value = ':'; this.advance(); break
        case ',': type = TokenType.COMMA; value = ','; this.advance(); break
        case '.': type = TokenType.DOT; value = '.'; this.advance(); break
        case '(': type = TokenType.LPAREN; value = '('; this.advance(); break
        case ')': type = TokenType.RPAREN; value = ')'; this.advance(); break
        case '{': type = TokenType.LBRACE; value = '{'; this.advance(); break
        case '}': type = TokenType.RBRACE; value = '}'; this.advance(); break
        case '[': type = TokenType.LBRACKET; value = '['; this.advance(); break
        case ']': type = TokenType.RBRACKET; value = ']'; this.advance(); break
        case '$': type = TokenType.DOLLAR; value = '$'; this.advance(); break
        default: return false
      }
    }

    if (type) {
      this.tokens.push({
        type,
        value,
        start,
        end: this.pos,
        line: startLine,
        column: startColumn,
      })
      return true
    }

    return false
  }
}

// ============================================================================
// Parser
// ============================================================================

class Parser {
  private tokens: Token[]
  private pos = 0
  private options: ParseOptions
  private errors: ParseError[] = []
  private warnings: string[] = []
  private comments: (CommentNode | BlockCommentNode)[] = []

  constructor(tokens: Token[], options: ParseOptions = {}) {
    this.tokens = tokens
    this.options = {
      preserveComments: false,
      locations: true,
      ...options,
    }

    // Extract comments if needed
    if (this.options.preserveComments) {
      for (const token of tokens) {
        if (token.type === TokenType.COMMENT) {
          this.comments.push({
            type: 'Comment',
            value: token.value,
            start: token.start,
            end: token.end,
            line: token.line,
            column: token.column,
          })
        } else if (token.type === TokenType.BLOCK_COMMENT) {
          this.comments.push({
            type: 'BlockComment',
            value: token.value,
            start: token.start,
            end: token.end,
            line: token.line,
            column: token.column,
          })
        }
      }
    }

    // Filter out comments from token stream
    this.tokens = tokens.filter(t => t.type !== TokenType.COMMENT && t.type !== TokenType.BLOCK_COMMENT)
  }

  parse(): RulesFileNode {
    const start = this.current()
    let version = '1'
    const services: ServiceDeclarationNode[] = []

    // Parse rules_version if present
    if (this.match(TokenType.RULES_VERSION)) {
      this.consume(TokenType.EQUALS, "Expected '=' after 'rules_version'")
      const versionToken = this.consume(TokenType.STRING, 'Expected version string')
      version = versionToken.value
      this.consumeOptional(TokenType.SEMICOLON)
    }

    // Parse service declarations
    while (!this.isAtEnd()) {
      if (this.match(TokenType.SERVICE)) {
        services.push(this.parseServiceDeclaration())
      } else {
        throw this.error('Expected service declaration')
      }
    }

    return {
      type: 'RulesFile',
      version,
      services,
      comments: this.comments,
      start: start.start,
      end: this.previous().end,
      line: start.line,
      column: start.column,
    }
  }

  parseWithRecovery(): ParseResult {
    try {
      const ast = this.parse()
      return {
        ast,
        errors: this.errors,
        warnings: this.warnings,
      }
    } catch (error) {
      if (error instanceof ParseError) {
        this.errors.push(error)
      }

      // Return a minimal valid AST
      const token = this.current()
      return {
        ast: {
          type: 'RulesFile',
          version: '1',
          services: [],
          comments: this.comments,
          start: 0,
          end: token.start,
          line: 1,
          column: 0,
        },
        errors: this.errors,
        warnings: this.warnings,
      }
    }
  }

  private parseServiceDeclaration(): ServiceDeclarationNode {
    const start = this.previous()

    // Parse dotted service name (e.g., cloud.firestore or firebase.storage)
    const firstPart = this.consume(TokenType.IDENTIFIER, 'Expected service name')
    this.consume(TokenType.DOT, "Expected '.' in service name")
    const secondPart = this.consume(TokenType.IDENTIFIER, 'Expected service name part after .')

    const service = `${firstPart.value}.${secondPart.value}` as 'cloud.firestore' | 'firebase.storage'

    if (service !== 'cloud.firestore' && service !== 'firebase.storage') {
      throw this.error(`Invalid service name '${service}', expected 'cloud.firestore' or 'firebase.storage'`)
    }

    this.consume(TokenType.LBRACE, "Expected '{' after service name")

    const body: MatchBlockNode[] = []
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.match(TokenType.MATCH)) {
        body.push(this.parseMatchBlock())
      } else {
        throw this.error('Expected match block')
      }
    }

    this.consume(TokenType.RBRACE, "Expected '}' after service body")

    return {
      type: 'ServiceDeclaration',
      service,
      body,
      start: start.start,
      end: this.previous().end,
      line: start.line,
      column: start.column,
    }
  }

  private parseMatchBlock(): MatchBlockNode {
    const start = this.previous()

    const path = this.parsePath()

    this.consume(TokenType.LBRACE, "Expected '{' after match path")

    const body: (MatchBlockNode | AllowStatementNode | FunctionDeclarationNode)[] = []
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.match(TokenType.MATCH)) {
        body.push(this.parseMatchBlock())
      } else if (this.match(TokenType.ALLOW)) {
        body.push(this.parseAllowStatement())
      } else if (this.match(TokenType.FUNCTION)) {
        body.push(this.parseFunctionDeclaration())
      } else {
        throw this.error('Expected match, allow, or function declaration')
      }
    }

    this.consume(TokenType.RBRACE, "Expected '}' after match body")

    return {
      type: 'MatchBlock',
      path,
      body,
      start: start.start,
      end: this.previous().end,
      line: start.line,
      column: start.column,
    }
  }

  private parsePath(): PathPatternNode {
    const start = this.current()
    const pathToken = this.consume(TokenType.PATH, 'Expected path pattern')
    const raw = pathToken.value

    const segments: (PathSegmentNode | PathVariableNode | WildcardVariableNode)[] = []

    // Parse path segments
    const parts = raw.split('/')
    for (const part of parts) {
      if (!part) continue

      const segStart = start.start
      const segLine = start.line
      const segColumn = start.column

      // Check for wildcard {name=**}
      if (part.includes('=**')) {
        const match = part.match(/^\{([^}]+)=\*\*\}$/)
        if (match) {
          segments.push({
            type: 'WildcardVariable',
            name: match[1],
            recursive: true,
            start: segStart,
            end: segStart + part.length,
            line: segLine,
            column: segColumn,
          })
          continue
        }
      }

      // Check for path variable {name}
      if (part.startsWith('{') && part.endsWith('}')) {
        const name = part.slice(1, -1)
        segments.push({
          type: 'PathVariable',
          name,
          start: segStart,
          end: segStart + part.length,
          line: segLine,
          column: segColumn,
        })
        continue
      }

      // Literal segment
      segments.push({
        type: 'PathSegment',
        value: part,
        start: segStart,
        end: segStart + part.length,
        line: segLine,
        column: segColumn,
      })
    }

    return {
      type: 'PathPattern',
      segments,
      raw,
      start: start.start,
      end: pathToken.end,
      line: start.line,
      column: start.column,
    }
  }

  private parseAllowStatement(): AllowStatementNode {
    const start = this.previous()

    const operations: AllowOperation[] = []

    // Parse operations (comma-separated)
    do {
      const opToken = this.consume(TokenType.IDENTIFIER, 'Expected operation name')
      const op = opToken.value as AllowOperation

      const validOps: AllowOperation[] = ['read', 'write', 'get', 'list', 'create', 'update', 'delete']
      if (!validOps.includes(op)) {
        throw this.error(`Invalid operation '${op}'`)
      }

      operations.push(op)
    } while (this.match(TokenType.COMMA))

    let condition: ExpressionNode | null = null

    if (this.match(TokenType.COLON)) {
      this.consume(TokenType.IF, "Expected 'if' after ':'")
      condition = this.parseExpression()
    }

    this.consumeOptional(TokenType.SEMICOLON)

    return {
      type: 'AllowStatement',
      operations,
      condition,
      start: start.start,
      end: this.previous().end,
      line: start.line,
      column: start.column,
    }
  }

  private parseFunctionDeclaration(): FunctionDeclarationNode {
    const start = this.previous()

    const nameToken = this.consume(TokenType.IDENTIFIER, 'Expected function name')
    const name = nameToken.value

    this.consume(TokenType.LPAREN, "Expected '(' after function name")

    const parameters: FunctionParameterNode[] = []
    if (!this.check(TokenType.RPAREN)) {
      do {
        const paramStart = this.current()
        const paramToken = this.consume(TokenType.IDENTIFIER, 'Expected parameter name')
        parameters.push({
          type: 'FunctionParameter',
          name: paramToken.value,
          start: paramStart.start,
          end: paramToken.end,
          line: paramStart.line,
          column: paramStart.column,
        })
      } while (this.match(TokenType.COMMA))
    }

    this.consume(TokenType.RPAREN, "Expected ')' after parameters")
    this.consume(TokenType.LBRACE, "Expected '{' after function signature")
    this.consume(TokenType.RETURN, "Expected 'return' in function body")

    const body = this.parseExpression()

    this.consumeOptional(TokenType.SEMICOLON)
    this.consume(TokenType.RBRACE, "Expected '}' after function body")

    return {
      type: 'FunctionDeclaration',
      name,
      parameters,
      body,
      start: start.start,
      end: this.previous().end,
      line: start.line,
      column: start.column,
    }
  }

  private parseExpression(): ExpressionNode {
    return this.parseLogicalOr()
  }

  private parseLogicalOr(): ExpressionNode {
    let left = this.parseLogicalAnd()

    while (this.match(TokenType.OR)) {
      const operator = '||' as BinaryOperator
      const opToken = this.previous()
      const right = this.parseLogicalAnd()
      left = {
        type: 'BinaryExpression',
        operator,
        left,
        right,
        start: left.start,
        end: right.end,
        line: left.line,
        column: left.column,
      }
    }

    return left
  }

  private parseLogicalAnd(): ExpressionNode {
    let left = this.parseEquality()

    while (this.match(TokenType.AND)) {
      const operator = '&&' as BinaryOperator
      const opToken = this.previous()
      const right = this.parseEquality()
      left = {
        type: 'BinaryExpression',
        operator,
        left,
        right,
        start: left.start,
        end: right.end,
        line: left.line,
        column: left.column,
      }
    }

    return left
  }

  private parseEquality(): ExpressionNode {
    let left = this.parseRelational()

    while (this.match(TokenType.EQUAL_EQUAL, TokenType.NOT_EQUAL, TokenType.IN, TokenType.IS)) {
      const opToken = this.previous()
      let operator: BinaryOperator

      if (opToken.type === TokenType.EQUAL_EQUAL) operator = '=='
      else if (opToken.type === TokenType.NOT_EQUAL) operator = '!='
      else operator = opToken.value as BinaryOperator

      const right = this.parseRelational()
      left = {
        type: 'BinaryExpression',
        operator,
        left,
        right,
        start: left.start,
        end: right.end,
        line: left.line,
        column: left.column,
      }
    }

    return left
  }

  private parseRelational(): ExpressionNode {
    let left = this.parseAdditive()

    while (this.match(TokenType.LESS_THAN, TokenType.GREATER_THAN, TokenType.LESS_EQUAL, TokenType.GREATER_EQUAL)) {
      const opToken = this.previous()
      let operator: BinaryOperator

      if (opToken.type === TokenType.LESS_THAN) operator = '<'
      else if (opToken.type === TokenType.GREATER_THAN) operator = '>'
      else if (opToken.type === TokenType.LESS_EQUAL) operator = '<='
      else operator = '>='

      const right = this.parseAdditive()
      left = {
        type: 'BinaryExpression',
        operator,
        left,
        right,
        start: left.start,
        end: right.end,
        line: left.line,
        column: left.column,
      }
    }

    return left
  }

  private parseAdditive(): ExpressionNode {
    let left = this.parseMultiplicative()

    while (this.match(TokenType.PLUS, TokenType.MINUS)) {
      const opToken = this.previous()
      const operator = opToken.value as BinaryOperator
      const right = this.parseMultiplicative()
      left = {
        type: 'BinaryExpression',
        operator,
        left,
        right,
        start: left.start,
        end: right.end,
        line: left.line,
        column: left.column,
      }
    }

    return left
  }

  private parseMultiplicative(): ExpressionNode {
    let left = this.parseUnary()

    while (this.match(TokenType.MULTIPLY, TokenType.DIVIDE, TokenType.MODULO)) {
      const opToken = this.previous()
      const operator = opToken.value as BinaryOperator
      const right = this.parseUnary()
      left = {
        type: 'BinaryExpression',
        operator,
        left,
        right,
        start: left.start,
        end: right.end,
        line: left.line,
        column: left.column,
      }
    }

    return left
  }

  private parseUnary(): ExpressionNode {
    if (this.match(TokenType.NOT, TokenType.MINUS)) {
      const opToken = this.previous()
      const operator = opToken.value as UnaryOperator
      const argument = this.parseUnary()
      return {
        type: 'UnaryExpression',
        operator,
        argument,
        start: opToken.start,
        end: argument.end,
        line: opToken.line,
        column: opToken.column,
      }
    }

    return this.parsePostfix()
  }

  private parsePostfix(): ExpressionNode {
    let expr = this.parsePrimary()

    while (true) {
      if (this.match(TokenType.DOT)) {
        const property = this.consume(TokenType.IDENTIFIER, 'Expected property name after .')
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
          line: expr.line,
          column: expr.column,
        }
      } else if (this.match(TokenType.LBRACKET)) {
        const property = this.parseExpression()
        this.consume(TokenType.RBRACKET, "Expected ']' after computed property")
        const end = this.previous()
        expr = {
          type: 'MemberExpression',
          object: expr,
          property,
          computed: true,
          start: expr.start,
          end: end.end,
          line: expr.line,
          column: expr.column,
        }
      } else if (this.match(TokenType.LPAREN)) {
        const args: ExpressionNode[] = []
        if (!this.check(TokenType.RPAREN)) {
          do {
            args.push(this.parseExpression())
          } while (this.match(TokenType.COMMA))
        }
        this.consume(TokenType.RPAREN, "Expected ')' after arguments")
        const end = this.previous()
        expr = {
          type: 'CallExpression',
          callee: expr,
          arguments: args,
          start: expr.start,
          end: end.end,
          line: expr.line,
          column: expr.column,
        }
      } else {
        break
      }
    }

    return expr
  }

  private parsePrimary(): ExpressionNode {
    const token = this.current()

    // Literals
    if (this.match(TokenType.TRUE)) {
      return {
        type: 'BooleanLiteral',
        value: true,
        start: token.start,
        end: token.end,
        line: token.line,
        column: token.column,
      }
    }

    if (this.match(TokenType.FALSE)) {
      return {
        type: 'BooleanLiteral',
        value: false,
        start: token.start,
        end: token.end,
        line: token.line,
        column: token.column,
      }
    }

    if (this.match(TokenType.NULL)) {
      return {
        type: 'NullLiteral',
        value: null,
        start: token.start,
        end: token.end,
        line: token.line,
        column: token.column,
      }
    }

    if (this.match(TokenType.NUMBER)) {
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

    if (this.match(TokenType.STRING)) {
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

    // Array literal
    if (this.match(TokenType.LBRACKET)) {
      const elements: ExpressionNode[] = []
      if (!this.check(TokenType.RBRACKET)) {
        do {
          elements.push(this.parseExpression())
        } while (this.match(TokenType.COMMA))
      }
      this.consume(TokenType.RBRACKET, "Expected ']' after array elements")
      const end = this.previous()
      return {
        type: 'ArrayLiteral',
        elements,
        start: token.start,
        end: end.end,
        line: token.line,
        column: token.column,
      }
    }

    // Parenthesized expression
    if (this.match(TokenType.LPAREN)) {
      const expr = this.parseExpression()
      this.consume(TokenType.RPAREN, "Expected ')' after expression")
      return expr
    }

    // Path with $() interpolation
    if (this.match(TokenType.PATH)) {
      return this.parsePathExpression(token)
    }

    // Identifier
    if (this.match(TokenType.IDENTIFIER)) {
      return {
        type: 'Identifier',
        name: token.value,
        start: token.start,
        end: token.end,
        line: token.line,
        column: token.column,
      }
    }

    throw this.error('Expected expression')
  }

  private parsePathExpression(pathToken: Token): ExpressionNode {
    // Parse path with $() interpolations
    const path = pathToken.value

    // Check if path contains $() interpolations
    if (!path.includes('$(')) {
      // Simple path without interpolation
      return {
        type: 'StringLiteral',
        value: path,
        raw: path,
        start: pathToken.start,
        end: pathToken.end,
        line: pathToken.line,
        column: pathToken.column,
      }
    }

    // Path with interpolation - build a concatenation expression
    // For now, parse as a call to a path interpolation function
    // This is a simplified approach - a full implementation would parse the interpolation properly

    // Example: /databases/$(database)/documents becomes a string literal for now
    // A more complete implementation would parse the $() expressions
    return {
      type: 'StringLiteral',
      value: path,
      raw: path,
      start: pathToken.start,
      end: pathToken.end,
      line: pathToken.line,
      column: pathToken.column,
    }
  }

  // Helper methods
  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance()
        return true
      }
    }
    return false
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false
    return this.current().type === type
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.pos++
    return this.previous()
  }

  private isAtEnd(): boolean {
    return this.current().type === TokenType.EOF
  }

  private current(): Token {
    return this.tokens[this.pos]
  }

  private previous(): Token {
    return this.tokens[this.pos - 1]
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance()
    throw this.error(message)
  }

  private consumeOptional(type: TokenType): boolean {
    if (this.check(type)) {
      this.advance()
      return true
    }
    return false
  }

  private error(message: string): SyntaxError {
    const token = this.current()
    return new SyntaxError(
      message,
      token.line,
      token.column,
      token.start,
      token.value,
      this.options.sourceFile
    )
  }
}

// ============================================================================
// Main Parser Function
// ============================================================================

/**
 * Parses Firebase Security Rules DSL source code into an AST.
 *
 * @param source - The source code to parse
 * @param options - Parser options
 * @returns The parsed AST
 * @throws ParseError if the source code contains syntax errors
 *
 * @example
 * ```typescript
 * const ast = parseRules(`
 *   rules_version = '2';
 *   service cloud.firestore {
 *     match /databases/{database}/documents {
 *       match /users/{userId} {
 *         allow read, write: if request.auth.uid == userId;
 *       }
 *     }
 *   }
 * `);
 * ```
 */
export function parseRules(source: string, options?: ParseOptions): RulesAST {
  const lexer = new Lexer(source)
  const tokens = lexer.tokenize()
  const parser = new Parser(tokens, options)
  return parser.parse()
}

/**
 * Parses Firebase Security Rules with detailed error recovery.
 * Returns partial AST even if parsing errors occur.
 *
 * @param source - The source code to parse
 * @param options - Parser options
 * @returns Parse result with AST and any errors
 */
export function parseRulesWithRecovery(source: string, options?: ParseOptions): ParseResult {
  const lexer = new Lexer(source)
  const tokens = lexer.tokenize()
  const parser = new Parser(tokens, options)
  return parser.parseWithRecovery()
}

/**
 * Validates the syntax of Firebase Security Rules without building a full AST.
 * Faster than parseRules for validation-only use cases.
 *
 * @param source - The source code to validate
 * @returns Array of syntax errors (empty if valid)
 */
export function validateRulesSyntax(source: string): ParseError[] {
  try {
    const result = parseRulesWithRecovery(source)
    return result.errors
  } catch (error) {
    if (error instanceof ParseError) {
      return [error]
    }
    throw error
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Converts an AST back to source code.
 *
 * @param ast - The AST to convert
 * @returns The source code representation
 */
export function stringifyRules(ast: RulesAST): string {
  const lines: string[] = []

  // Version
  lines.push(`rules_version = '${ast.version}';`)

  // Services
  for (const service of ast.services) {
    lines.push(`service ${service.service} {`)
    for (const match of service.body) {
      stringifyMatchBlock(match, lines, 1)
    }
    lines.push('}')
  }

  return lines.join('\n')
}

function stringifyMatchBlock(match: MatchBlockNode, lines: string[], indent: number): void {
  const prefix = '  '.repeat(indent)
  lines.push(`${prefix}match ${match.path.raw} {`)

  for (const item of match.body) {
    if (item.type === 'MatchBlock') {
      stringifyMatchBlock(item, lines, indent + 1)
    } else if (item.type === 'AllowStatement') {
      stringifyAllowStatement(item, lines, indent + 1)
    } else if (item.type === 'FunctionDeclaration') {
      stringifyFunctionDeclaration(item, lines, indent + 1)
    }
  }

  lines.push(`${prefix}}`)
}

function stringifyAllowStatement(allow: AllowStatementNode, lines: string[], indent: number): void {
  const prefix = '  '.repeat(indent)
  const ops = allow.operations.join(', ')
  if (allow.condition) {
    lines.push(`${prefix}allow ${ops}: if ${stringifyExpression(allow.condition)};`)
  } else {
    lines.push(`${prefix}allow ${ops};`)
  }
}

function stringifyFunctionDeclaration(func: FunctionDeclarationNode, lines: string[], indent: number): void {
  const prefix = '  '.repeat(indent)
  const params = func.parameters.map(p => p.name).join(', ')
  lines.push(`${prefix}function ${func.name}(${params}) {`)
  lines.push(`${prefix}  return ${stringifyExpression(func.body)};`)
  lines.push(`${prefix}}`)
}

function stringifyExpression(expr: ExpressionNode): string {
  switch (expr.type) {
    case 'BinaryExpression':
      return `${stringifyExpression(expr.left)} ${expr.operator} ${stringifyExpression(expr.right)}`
    case 'UnaryExpression':
      return `${expr.operator}${stringifyExpression(expr.argument)}`
    case 'MemberExpression':
      if (expr.computed) {
        return `${stringifyExpression(expr.object)}[${stringifyExpression(expr.property)}]`
      }
      return `${stringifyExpression(expr.object)}.${stringifyExpression(expr.property)}`
    case 'CallExpression':
      const args = expr.arguments.map(stringifyExpression).join(', ')
      return `${stringifyExpression(expr.callee)}(${args})`
    case 'Identifier':
      return expr.name
    case 'StringLiteral':
      return `"${expr.value}"`
    case 'NumberLiteral':
      return expr.raw
    case 'BooleanLiteral':
      return expr.value ? 'true' : 'false'
    case 'NullLiteral':
      return 'null'
    case 'ArrayLiteral':
      return `[${expr.elements.map(stringifyExpression).join(', ')}]`
    default:
      return ''
  }
}

/**
 * Traverses an AST and calls the visitor function for each node.
 *
 * @param ast - The AST to traverse
 * @param visitor - Function called for each node
 */
export function traverseAST(
  ast: RulesAST,
  visitor: (node: ASTNode, parent: ASTNode | null) => void
): void {
  function visit(node: ASTNode, parent: ASTNode | null) {
    visitor(node, parent)

    if (node.type === 'RulesFile') {
      for (const service of node.services) {
        visit(service, node)
      }
      for (const comment of node.comments) {
        visit(comment, node)
      }
    } else if (node.type === 'ServiceDeclaration') {
      for (const match of node.body) {
        visit(match, node)
      }
    } else if (node.type === 'MatchBlock') {
      visit(node.path, node)
      for (const item of node.body) {
        visit(item, node)
      }
    } else if (node.type === 'PathPattern') {
      for (const segment of node.segments) {
        visit(segment, node)
      }
    } else if (node.type === 'AllowStatement') {
      if (node.condition) {
        visit(node.condition, node)
      }
    } else if (node.type === 'FunctionDeclaration') {
      for (const param of node.parameters) {
        visit(param, node)
      }
      visit(node.body, node)
    } else if (node.type === 'BinaryExpression') {
      visit(node.left, node)
      visit(node.right, node)
    } else if (node.type === 'UnaryExpression') {
      visit(node.argument, node)
    } else if (node.type === 'MemberExpression') {
      visit(node.object, node)
      visit(node.property, node)
    } else if (node.type === 'CallExpression') {
      visit(node.callee, node)
      for (const arg of node.arguments) {
        visit(arg, node)
      }
    } else if (node.type === 'ArrayLiteral') {
      for (const element of node.elements) {
        visit(element, node)
      }
    }
  }

  visit(ast, null)
}
