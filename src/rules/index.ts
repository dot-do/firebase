/**
 * Firebase Security Rules Module
 *
 * Re-exports all public APIs from the rules module.
 */

// Parser - AST types, node interfaces, parsing functions
export {
  parseRules,
  parseRulesWithRecovery,
  validateRulesSyntax,
  stringifyRules,
  traverseAST,
  ParseError,
  LexerError,
  SyntaxError,
  type ASTNodeType,
  type ASTNode,
  type RulesFileNode,
  type ServiceDeclarationNode,
  type MatchBlockNode,
  type PathPatternNode,
  type PathSegmentNode,
  type PathVariableNode,
  type WildcardVariableNode,
  type FunctionDeclarationNode,
  type FunctionParameterNode,
  type AllowOperation,
  type AllowStatementNode,
  type IfConditionNode,
  type BinaryOperator,
  type BinaryExpressionNode,
  type UnaryOperator,
  type UnaryExpressionNode,
  type MemberExpressionNode,
  type CallExpressionNode,
  type IdentifierNode,
  type StringLiteralNode,
  type NumberLiteralNode,
  type BooleanLiteralNode,
  type NullLiteralNode,
  type ArrayLiteralNode,
  type CommentNode,
  type BlockCommentNode,
  type ExpressionNode,
  type RulesAST,
  type ParseOptions,
  type ParseResult,
} from './parser.js'

// Evaluator - expression evaluation
export {
  createEvaluator,
  RulesEvaluator,
  EvaluationError,
  type AuthContext,
  type RequestContext,
  type ResourceContext,
  type EvaluatorContext,
} from './evaluator.js'

// Built-in functions and types
export {
  createPath,
  createRulesContext,
  createRulesString,
  createRulesList,
  createRulesSet,
  createRulesMap,
  createRulesTimestamp,
  createRulesDuration,
  createRulesRequest,
  isString,
  isNumber,
  isInt,
  isFloat,
  isBool,
  isNull,
  isList,
  isMap,
  isTimestamp,
  isDuration,
  isPath,
  type RulesResource,
  type RulesTimestamp,
  type RulesDuration,
  type RulesPath,
  type RulesContext,
  type RulesString,
  type RulesList,
  type RulesSet,
  type RulesMap,
  type RulesRequest,
  type RulesAuth,
} from './builtins.js'

// Path matching
export {
  matchPath,
  matchCollectionGroup,
  extractWildcards,
  hasWildcards,
  getWildcardNames,
  isValidPattern,
  type PathMatchResult,
} from './path-matcher.js'
