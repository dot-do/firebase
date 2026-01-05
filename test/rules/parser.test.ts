import { describe, it, expect } from 'vitest'
import {
  parseRules,
  parseRulesWithRecovery,
  validateRulesSyntax,
  stringifyRules,
  traverseAST,
  ParseError,
  LexerError,
  SyntaxError,
  type RulesAST,
  type RulesFileNode,
  type ServiceDeclarationNode,
  type MatchBlockNode,
  type AllowStatementNode,
  type FunctionDeclarationNode,
  type ExpressionNode,
  type BinaryExpressionNode,
  type MemberExpressionNode,
  type CallExpressionNode,
  type IdentifierNode,
  type StringLiteralNode,
  type NumberLiteralNode,
  type BooleanLiteralNode,
  type ParseOptions,
  type ParseResult,
} from '../../src/rules/parser'

describe('rules/parser', () => {
  describe('parseRules', () => {
    describe('basic parsing', () => {
      it('should parse minimal valid rules file', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
            }
          }
        `
        const ast = parseRules(source)
        expect(ast).toBeDefined()
        expect(ast.type).toBe('RulesFile')
        expect(ast.version).toBe('2')
      })

      it('should parse rules_version = "2" (double quotes)', () => {
        const source = `
          rules_version = "2";
          service cloud.firestore {
            match /databases/{database}/documents {
            }
          }
        `
        const ast = parseRules(source)
        expect(ast.version).toBe('2')
      })

      it('should default to version 1 when no version specified', () => {
        const source = `
          service cloud.firestore {
            match /databases/{database}/documents {
            }
          }
        `
        const ast = parseRules(source)
        expect(ast.version).toBe('1')
      })

      it('should parse cloud.firestore service', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
            }
          }
        `
        const ast = parseRules(source)
        expect(ast.services).toHaveLength(1)
        expect(ast.services[0].service).toBe('cloud.firestore')
      })

      it('should parse firebase.storage service', () => {
        const source = `
          rules_version = '2';
          service firebase.storage {
            match /b/{bucket}/o {
            }
          }
        `
        const ast = parseRules(source)
        expect(ast.services).toHaveLength(1)
        expect(ast.services[0].service).toBe('firebase.storage')
      })
    })

    describe('match blocks', () => {
      it('should parse single match block', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        expect(dbMatch.body).toHaveLength(1)
        expect((dbMatch.body[0] as MatchBlockNode).type).toBe('MatchBlock')
      })

      it('should parse multiple sibling match blocks', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
              }
              match /posts/{postId} {
              }
              match /comments/{commentId} {
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        expect(dbMatch.body.length).toBe(3)
      })

      it('should parse nested match blocks', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                match /posts/{postId} {
                }
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        expect(userMatch.body).toHaveLength(1)
        expect((userMatch.body[0] as MatchBlockNode).path.raw).toContain('posts')
      })

      it('should parse path with literal segments', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        expect(userMatch.path.raw).toBe('/users/{userId}')
      })

      it('should parse path variable', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const pathVar = userMatch.path.segments.find(s => s.type === 'PathVariable')
        expect(pathVar).toBeDefined()
        expect((pathVar as any).name).toBe('userId')
      })

      it('should parse recursive wildcard {name=**}', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /{document=**} {
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const wildcardMatch = dbMatch.body[0] as MatchBlockNode
        const wildcard = wildcardMatch.path.segments.find(s => s.type === 'WildcardVariable')
        expect(wildcard).toBeDefined()
        expect((wildcard as any).recursive).toBe(true)
        expect((wildcard as any).name).toBe('document')
      })

      it('should parse single-level wildcard {name}', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /collection/{docId} {
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const match = dbMatch.body[0] as MatchBlockNode
        const pathVar = match.path.segments.find(s => s.type === 'PathVariable')
        expect(pathVar).toBeDefined()
      })

      it('should parse complex path with multiple segments', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId}/posts/{postId}/comments/{commentId} {
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const match = dbMatch.body[0] as MatchBlockNode
        expect(match.path.segments.length).toBeGreaterThanOrEqual(6)
      })
    })

    describe('allow statements', () => {
      it('should parse allow read: if true', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow read: if true;
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        expect(allow.type).toBe('AllowStatement')
        expect(allow.operations).toContain('read')
      })

      it('should parse allow write: if false', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow write: if false;
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        expect(allow.operations).toContain('write')
      })

      it('should parse allow get (granular read)', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow get: if true;
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        expect(allow.operations).toContain('get')
      })

      it('should parse allow list (granular read)', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow list: if true;
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        expect(allow.operations).toContain('list')
      })

      it('should parse allow create (granular write)', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow create: if request.auth != null;
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        expect(allow.operations).toContain('create')
      })

      it('should parse allow update (granular write)', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow update: if request.auth.uid == userId;
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        expect(allow.operations).toContain('update')
      })

      it('should parse allow delete (granular write)', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow delete: if request.auth.uid == userId;
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        expect(allow.operations).toContain('delete')
      })

      it('should parse allow with multiple operations (comma-separated)', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow read, write: if true;
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        expect(allow.operations).toContain('read')
        expect(allow.operations).toContain('write')
      })

      it('should parse allow with all granular operations', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow get, list, create, update, delete: if true;
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        expect(allow.operations).toContain('get')
        expect(allow.operations).toContain('list')
        expect(allow.operations).toContain('create')
        expect(allow.operations).toContain('update')
        expect(allow.operations).toContain('delete')
      })

      it('should parse multiple allow statements', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow read: if true;
                allow write: if request.auth.uid == userId;
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allows = userMatch.body.filter(n => n.type === 'AllowStatement')
        expect(allows).toHaveLength(2)
      })
    })

    describe('expressions', () => {
      it('should parse boolean literal true', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow read: if true;
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        expect(allow.condition).toBeDefined()
        expect(allow.condition!.type).toBe('BooleanLiteral')
        expect((allow.condition as BooleanLiteralNode).value).toBe(true)
      })

      it('should parse boolean literal false', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow read: if false;
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        expect((allow.condition as BooleanLiteralNode).value).toBe(false)
      })

      it('should parse identifier', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow read: if userId;
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        expect(allow.condition!.type).toBe('Identifier')
        expect((allow.condition as IdentifierNode).name).toBe('userId')
      })

      it('should parse member expression (dot notation)', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow read: if request.auth;
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        expect(allow.condition!.type).toBe('MemberExpression')
      })

      it('should parse nested member expression', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow read: if request.auth.uid;
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        const member = allow.condition as MemberExpressionNode
        expect(member.type).toBe('MemberExpression')
      })

      it('should parse equality expression (==)', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow read: if request.auth.uid == userId;
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        const binary = allow.condition as BinaryExpressionNode
        expect(binary.type).toBe('BinaryExpression')
        expect(binary.operator).toBe('==')
      })

      it('should parse inequality expression (!=)', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow read: if request.auth != null;
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        const binary = allow.condition as BinaryExpressionNode
        expect(binary.operator).toBe('!=')
      })

      it('should parse logical AND (&&)', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow read: if request.auth != null && request.auth.uid == userId;
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        const binary = allow.condition as BinaryExpressionNode
        expect(binary.operator).toBe('&&')
      })

      it('should parse logical OR (||)', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow read: if resource.data.isPublic == true || request.auth.uid == userId;
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        const binary = allow.condition as BinaryExpressionNode
        expect(binary.operator).toBe('||')
      })

      it('should parse unary NOT (!)', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow read: if !resource.data.deleted;
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        expect(allow.condition!.type).toBe('UnaryExpression')
      })

      it('should parse comparison operators (<, >, <=, >=)', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow read: if resource.data.count < 100;
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        const binary = allow.condition as BinaryExpressionNode
        expect(binary.operator).toBe('<')
      })

      it('should parse string literal', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow read: if resource.data.role == "admin";
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        const binary = allow.condition as BinaryExpressionNode
        expect(binary.right.type).toBe('StringLiteral')
        expect((binary.right as StringLiteralNode).value).toBe('admin')
      })

      it('should parse number literal', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow read: if resource.data.count > 0;
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        const binary = allow.condition as BinaryExpressionNode
        expect(binary.right.type).toBe('NumberLiteral')
        expect((binary.right as NumberLiteralNode).value).toBe(0)
      })

      it('should parse null literal', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow read: if request.auth != null;
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        const binary = allow.condition as BinaryExpressionNode
        expect(binary.right.type).toBe('NullLiteral')
      })

      it('should parse array literal', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow read: if request.auth.token.roles.hasAny(["admin", "moderator"]);
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        const call = allow.condition as CallExpressionNode
        expect(call.arguments[0].type).toBe('ArrayLiteral')
      })

      it('should parse function call', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow read: if isAuthenticated();
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        expect(allow.condition!.type).toBe('CallExpression')
      })

      it('should parse method call', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow read: if request.resource.data.keys().hasAll(["name", "email"]);
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        expect(allow.condition!.type).toBe('CallExpression')
      })

      it('should parse exists() function', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow read: if exists(/databases/$(database)/documents/admins/$(request.auth.uid));
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        const call = allow.condition as CallExpressionNode
        expect(call.type).toBe('CallExpression')
      })

      it('should parse get() function', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow read: if get(/databases/$(database)/documents/users/$(userId)).data.active == true;
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        expect(allow.condition).toBeDefined()
      })

      it('should parse in operator', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow read: if userId in resource.data.members;
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        const binary = allow.condition as BinaryExpressionNode
        expect(binary.operator).toBe('in')
      })

      it('should parse parenthesized expression', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow read: if (request.auth != null) && (request.auth.uid == userId);
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        expect(allow.condition).toBeDefined()
      })

      it('should respect operator precedence (|| lower than &&)', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow read: if a || b && c;
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        const allow = userMatch.body[0] as AllowStatementNode
        const binary = allow.condition as BinaryExpressionNode
        // Should be: a || (b && c), so top-level is ||
        expect(binary.operator).toBe('||')
      })
    })

    describe('function declarations', () => {
      it('should parse simple function declaration', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              function isAuthenticated() {
                return request.auth != null;
              }
              match /users/{userId} {
                allow read: if isAuthenticated();
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const func = dbMatch.body.find(n => n.type === 'FunctionDeclaration') as FunctionDeclarationNode
        expect(func).toBeDefined()
        expect(func.name).toBe('isAuthenticated')
      })

      it('should parse function with parameters', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              function isOwner(userId) {
                return request.auth.uid == userId;
              }
              match /users/{userId} {
                allow read: if isOwner(userId);
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const func = dbMatch.body.find(n => n.type === 'FunctionDeclaration') as FunctionDeclarationNode
        expect(func.parameters).toHaveLength(1)
        expect(func.parameters[0].name).toBe('userId')
      })

      it('should parse function with multiple parameters', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              function hasRole(userId, role) {
                return get(/databases/$(database)/documents/users/$(userId)).data.role == role;
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const func = dbMatch.body.find(n => n.type === 'FunctionDeclaration') as FunctionDeclarationNode
        expect(func.parameters).toHaveLength(2)
      })

      it('should parse multiple functions', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              function isAuthenticated() {
                return request.auth != null;
              }
              function isOwner(userId) {
                return request.auth.uid == userId;
              }
              function isAdmin() {
                return request.auth.token.admin == true;
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const funcs = dbMatch.body.filter(n => n.type === 'FunctionDeclaration')
        expect(funcs).toHaveLength(3)
      })

      it('should parse function body expression', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              function isAuthenticated() {
                return request.auth != null;
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const func = dbMatch.body.find(n => n.type === 'FunctionDeclaration') as FunctionDeclarationNode
        expect(func.body).toBeDefined()
        expect(func.body.type).toBe('BinaryExpression')
      })
    })

    describe('comments', () => {
      it('should handle single-line comments', () => {
        const source = `
          rules_version = '2';
          // This is a comment
          service cloud.firestore {
            match /databases/{database}/documents {
              // Another comment
              match /users/{userId} {
                allow read: if true; // inline comment
              }
            }
          }
        `
        const ast = parseRules(source)
        expect(ast).toBeDefined()
        expect(ast.type).toBe('RulesFile')
      })

      it('should handle multi-line comments', () => {
        const source = `
          rules_version = '2';
          /* This is a
             multi-line comment */
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow read: if true;
              }
            }
          }
        `
        const ast = parseRules(source)
        expect(ast).toBeDefined()
      })

      it('should preserve comments with preserveComments option', () => {
        const source = `
          rules_version = '2';
          // Header comment
          service cloud.firestore {
            match /databases/{database}/documents {
            }
          }
        `
        const ast = parseRules(source, { preserveComments: true })
        expect(ast.comments.length).toBeGreaterThan(0)
      })
    })

    describe('source locations', () => {
      it('should include location info by default', () => {
        const source = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
  }
}`
        const ast = parseRules(source)
        expect(ast.start).toBeDefined()
        expect(ast.end).toBeDefined()
        expect(ast.line).toBeDefined()
        expect(ast.column).toBeDefined()
      })

      it('should include location info for nested nodes', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow read: if true;
              }
            }
          }
        `
        const ast = parseRules(source)
        const dbMatch = ast.services[0].body[0] as MatchBlockNode
        const userMatch = dbMatch.body[0] as MatchBlockNode
        expect(userMatch.line).toBeGreaterThan(0)
        expect(userMatch.column).toBeGreaterThanOrEqual(0)
      })
    })

    describe('error handling', () => {
      it('should throw ParseError for invalid syntax', () => {
        const source = `rules_version = '2'; invalid`
        expect(() => parseRules(source)).toThrow(ParseError)
      })

      it('should throw error with line and column info', () => {
        const source = `rules_version = '2';
service cloud.firestore {
  invalid syntax here
}`
        try {
          parseRules(source)
          expect.fail('Should have thrown')
        } catch (e) {
          expect(e).toBeInstanceOf(ParseError)
          expect((e as ParseError).line).toBeGreaterThan(0)
        }
      })

      it('should throw for unclosed braces', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
        `
        expect(() => parseRules(source)).toThrow(ParseError)
      })

      it('should throw for invalid service name', () => {
        const source = `
          rules_version = '2';
          service invalid.service {
          }
        `
        expect(() => parseRules(source)).toThrow(ParseError)
      })

      it('should throw for invalid allow operation', () => {
        const source = `
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{userId} {
                allow invalid: if true;
              }
            }
          }
        `
        expect(() => parseRules(source)).toThrow(ParseError)
      })
    })
  })

  describe('parseRulesWithRecovery', () => {
    it('should return partial AST on error', () => {
      const source = `
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /users/{userId} {
              allow read: if true;
            }
            invalid syntax here
          }
        }
      `
      const result = parseRulesWithRecovery(source)
      expect(result.ast).toBeDefined()
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should return empty errors array for valid rules', () => {
      const source = `
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /users/{userId} {
              allow read: if true;
            }
          }
        }
      `
      const result = parseRulesWithRecovery(source)
      expect(result.errors).toEqual([])
    })

    it('should recover from missing semicolon', () => {
      const source = `
        rules_version = '2'
        service cloud.firestore {
          match /databases/{database}/documents {
          }
        }
      `
      const result = parseRulesWithRecovery(source)
      expect(result.ast).toBeDefined()
    })

    it('should include warnings', () => {
      const source = `
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /{document=**} {
              allow read, write: if true;
            }
          }
        }
      `
      const result = parseRulesWithRecovery(source)
      // May warn about overly permissive rules
      expect(result.warnings).toBeDefined()
    })
  })

  describe('validateRulesSyntax', () => {
    it('should return empty array for valid rules', () => {
      const source = `
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /users/{userId} {
              allow read: if true;
            }
          }
        }
      `
      const errors = validateRulesSyntax(source)
      expect(errors).toEqual([])
    })

    it('should return errors for invalid rules', () => {
      const source = `
        rules_version = '2';
        service cloud.firestore {
          invalid syntax
        }
      `
      const errors = validateRulesSyntax(source)
      expect(errors.length).toBeGreaterThan(0)
    })

    it('should return multiple errors', () => {
      const source = `
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            allow invalid: if true;
            allow another: if false;
          }
        }
      `
      const errors = validateRulesSyntax(source)
      expect(errors.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('stringifyRules', () => {
    it('should convert AST back to source', () => {
      const source = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if true;
    }
  }
}`
      const ast = parseRules(source)
      const output = stringifyRules(ast)
      expect(output).toContain("rules_version = '2'")
      expect(output).toContain('cloud.firestore')
      expect(output).toContain('/users/{userId}')
      expect(output).toContain('allow read')
    })

    it('should preserve semantic meaning', () => {
      const source = `
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /users/{userId} {
              allow read, write: if request.auth.uid == userId;
            }
          }
        }
      `
      const ast = parseRules(source)
      const output = stringifyRules(ast)
      // Re-parse to verify
      const reParsed = parseRules(output)
      expect(reParsed.version).toBe(ast.version)
      expect(reParsed.services[0].service).toBe(ast.services[0].service)
    })

    it('should format functions', () => {
      const source = `
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            function isAuthenticated() {
              return request.auth != null;
            }
          }
        }
      `
      const ast = parseRules(source)
      const output = stringifyRules(ast)
      expect(output).toContain('function isAuthenticated')
      expect(output).toContain('return')
    })
  })

  describe('traverseAST', () => {
    it('should visit all nodes', () => {
      const source = `
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /users/{userId} {
              allow read: if true;
            }
          }
        }
      `
      const ast = parseRules(source)
      const visited: string[] = []
      traverseAST(ast, (node) => {
        visited.push(node.type)
      })
      expect(visited).toContain('RulesFile')
      expect(visited).toContain('ServiceDeclaration')
      expect(visited).toContain('MatchBlock')
      expect(visited).toContain('AllowStatement')
    })

    it('should provide parent node', () => {
      const source = `
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /users/{userId} {
              allow read: if true;
            }
          }
        }
      `
      const ast = parseRules(source)
      const parentTypes: (string | null)[] = []
      traverseAST(ast, (node, parent) => {
        if (node.type === 'AllowStatement') {
          parentTypes.push(parent?.type ?? null)
        }
      })
      expect(parentTypes).toContain('MatchBlock')
    })

    it('should traverse in depth-first order', () => {
      const source = `
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /users/{userId} {
              allow read: if request.auth != null;
            }
          }
        }
      `
      const ast = parseRules(source)
      const types: string[] = []
      traverseAST(ast, (node) => {
        types.push(node.type)
      })
      // RulesFile should come first
      expect(types[0]).toBe('RulesFile')
    })
  })

  describe('edge cases and complex rules', () => {
    it('should parse complete real-world Firestore rules', () => {
      const source = `
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            function isAuthenticated() {
              return request.auth != null;
            }

            function isOwner(userId) {
              return request.auth.uid == userId;
            }

            function isAdmin() {
              return request.auth.token.admin == true;
            }

            match /users/{userId} {
              allow read: if isAuthenticated();
              allow create: if isAuthenticated() && isOwner(userId);
              allow update: if isOwner(userId) || isAdmin();
              allow delete: if isAdmin();

              match /private/{docId} {
                allow read, write: if isOwner(userId);
              }
            }

            match /posts/{postId} {
              allow read: if resource.data.isPublic == true || isOwner(resource.data.authorId);
              allow create: if isAuthenticated() && request.resource.data.authorId == request.auth.uid;
              allow update: if isOwner(resource.data.authorId);
              allow delete: if isOwner(resource.data.authorId) || isAdmin();
            }
          }
        }
      `
      const ast = parseRules(source)
      expect(ast.version).toBe('2')
      expect(ast.services[0].service).toBe('cloud.firestore')
    })

    it('should parse complete real-world Storage rules', () => {
      const source = `
        rules_version = '2';
        service firebase.storage {
          match /b/{bucket}/o {
            function isAuthenticated() {
              return request.auth != null;
            }

            match /users/{userId}/{allPaths=**} {
              allow read: if isAuthenticated();
              allow write: if request.auth.uid == userId
                && request.resource.size < 5 * 1024 * 1024
                && request.resource.contentType.matches('image/.*');
            }

            match /public/{allPaths=**} {
              allow read: if true;
              allow write: if isAuthenticated();
            }
          }
        }
      `
      const ast = parseRules(source)
      expect(ast.services[0].service).toBe('firebase.storage')
    })

    it('should handle deeply nested match blocks', () => {
      const source = `
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /a/{aId} {
              match /b/{bId} {
                match /c/{cId} {
                  match /d/{dId} {
                    allow read: if true;
                  }
                }
              }
            }
          }
        }
      `
      const ast = parseRules(source)
      expect(ast).toBeDefined()
    })

    it('should handle complex expressions with method chains', () => {
      const source = `
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /users/{userId} {
              allow create: if request.resource.data.keys().hasOnly(['name', 'email', 'age'])
                && request.resource.data.name is string
                && request.resource.data.name.size() <= 100
                && request.resource.data.email.matches('.*@.*\\\\..*');
            }
          }
        }
      `
      const ast = parseRules(source)
      expect(ast).toBeDefined()
    })

    it('should handle unicode in string literals', () => {
      const source = `
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /users/{userId} {
              allow read: if resource.data.name == "日本語";
            }
          }
        }
      `
      const ast = parseRules(source)
      expect(ast).toBeDefined()
    })

    it('should handle escaped characters in strings', () => {
      const source = `
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /users/{userId} {
              allow read: if resource.data.pattern.matches("^[a-z]+\\\\.[a-z]+$");
            }
          }
        }
      `
      const ast = parseRules(source)
      expect(ast).toBeDefined()
    })

    it('should handle arithmetic expressions', () => {
      const source = `
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /users/{userId} {
              allow create: if request.resource.size < 1024 * 1024;
            }
          }
        }
      `
      const ast = parseRules(source)
      expect(ast).toBeDefined()
    })

    it('should handle duration function', () => {
      const source = `
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /sessions/{sessionId} {
              allow read: if request.time < resource.data.createdAt + duration.value(1, 'h');
            }
          }
        }
      `
      const ast = parseRules(source)
      expect(ast).toBeDefined()
    })
  })

  describe('Error types', () => {
    it('should create ParseError with location', () => {
      const error = new ParseError('Test error', 10, 5, 100, 'test source')
      expect(error.message).toContain('line 10')
      expect(error.message).toContain('column 5')
      expect(error.line).toBe(10)
      expect(error.column).toBe(5)
      expect(error.offset).toBe(100)
    })

    it('should create LexerError', () => {
      const error = new LexerError('Invalid character', 1, 1, 0)
      expect(error.name).toBe('LexerError')
      expect(error).toBeInstanceOf(ParseError)
    })

    it('should create SyntaxError with token', () => {
      const error = new SyntaxError('Unexpected token', 1, 1, 0, 'invalid')
      expect(error.name).toBe('SyntaxError')
      expect(error.token).toBe('invalid')
    })
  })
})
