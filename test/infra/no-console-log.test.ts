/**
 * @fileoverview Test to verify no console.log statements in production code
 *
 * Issue: firebase-ruij - TEST: Verify no console.log in production code
 *
 * This test scans the src/ directory to ensure production code uses proper
 * logging abstractions instead of console.log/warn/error/debug/info.
 *
 * Allowed patterns:
 * - Console statements in comments (documentation examples)
 * - Console statements in string literals (error messages)
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

// Console methods that should not be used in production code
const CONSOLE_METHODS = ['log', 'warn', 'error', 'debug', 'info', 'trace']

// Pattern to match actual console calls (not in comments or strings)
const CONSOLE_PATTERN = new RegExp(
  `\\bconsole\\.(${CONSOLE_METHODS.join('|')})\\s*\\(`,
  'g'
)

// Files or directories that are allowed to have console statements
// (e.g., CLI tools, development utilities)
const ALLOWED_PATHS: string[] = [
  // Add paths here if there are legitimate uses of console
  'utils/logger.ts', // Logging abstraction that wraps console methods
]

interface ConsoleViolation {
  file: string
  line: number
  content: string
  method: string
}

/**
 * Recursively get all TypeScript files in a directory
 */
function getTypeScriptFiles(dir: string): string[] {
  const files: string[] = []

  function walk(currentDir: string) {
    const entries = readdirSync(currentDir)
    for (const entry of entries) {
      const fullPath = join(currentDir, entry)
      const stat = statSync(fullPath)
      if (stat.isDirectory()) {
        walk(fullPath)
      } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
        files.push(fullPath)
      }
    }
  }

  walk(dir)
  return files
}

/**
 * Check if a line is inside a comment or JSDoc
 */
function isInComment(lines: string[], lineIndex: number, charIndex: number): boolean {
  const line = lines[lineIndex]

  // Check for single-line comment before the console statement
  const beforeStatement = line.substring(0, charIndex)
  if (beforeStatement.includes('//')) {
    return true
  }

  // Check for block comment on the same line
  const blockCommentStart = beforeStatement.lastIndexOf('/*')
  const blockCommentEnd = beforeStatement.lastIndexOf('*/')
  if (blockCommentStart > blockCommentEnd) {
    return true
  }

  // Check for multi-line comment by looking at previous lines
  let inBlockComment = false
  for (let i = 0; i <= lineIndex; i++) {
    const currentLine = lines[i]
    const searchEnd = i === lineIndex ? charIndex : currentLine.length

    for (let j = 0; j < searchEnd; j++) {
      if (currentLine[j] === '/' && currentLine[j + 1] === '*') {
        inBlockComment = true
        j++ // Skip the *
      } else if (currentLine[j] === '*' && currentLine[j + 1] === '/') {
        inBlockComment = false
        j++ // Skip the /
      }
    }
  }

  return inBlockComment
}

/**
 * Check if a line is inside a string literal (documentation example in template string)
 */
function isInStringLiteral(line: string, charIndex: number): boolean {
  // Simple heuristic: check if we're inside quotes before the console statement
  const beforeStatement = line.substring(0, charIndex)

  // Count quotes to determine if we're inside a string
  let inSingleQuote = false
  let inDoubleQuote = false
  let inTemplateString = false

  for (let i = 0; i < beforeStatement.length; i++) {
    const char = beforeStatement[i]
    const prevChar = i > 0 ? beforeStatement[i - 1] : ''

    if (char === "'" && prevChar !== '\\' && !inDoubleQuote && !inTemplateString) {
      inSingleQuote = !inSingleQuote
    } else if (char === '"' && prevChar !== '\\' && !inSingleQuote && !inTemplateString) {
      inDoubleQuote = !inDoubleQuote
    } else if (char === '`' && prevChar !== '\\' && !inSingleQuote && !inDoubleQuote) {
      inTemplateString = !inTemplateString
    }
  }

  return inSingleQuote || inDoubleQuote || inTemplateString
}

/**
 * Scan a file for console statement violations
 */
function scanFile(filePath: string, srcDir: string): ConsoleViolation[] {
  const violations: ConsoleViolation[] = []
  const relativePath = relative(srcDir, filePath)

  // Check if this file is in allowed paths
  if (ALLOWED_PATHS.some((allowed) => relativePath.startsWith(allowed))) {
    return violations
  }

  const content = readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]
    let match: RegExpExecArray | null

    // Reset regex state
    CONSOLE_PATTERN.lastIndex = 0

    while ((match = CONSOLE_PATTERN.exec(line)) !== null) {
      const charIndex = match.index

      // Skip if in comment or string literal
      if (isInComment(lines, lineIndex, charIndex)) {
        continue
      }
      if (isInStringLiteral(line, charIndex)) {
        continue
      }

      // Extract the console method
      const methodMatch = match[0].match(/console\.(\w+)/)
      const method = methodMatch ? methodMatch[1] : 'unknown'

      violations.push({
        file: relativePath,
        line: lineIndex + 1, // 1-indexed for human readability
        content: line.trim(),
        method,
      })
    }
  }

  return violations
}

describe('No Console Statements in Production Code', () => {
  const srcDir = join(__dirname, '../../src')

  it('should not have console.log/warn/error/debug/info in production code', () => {
    const files = getTypeScriptFiles(srcDir)
    const allViolations: ConsoleViolation[] = []

    for (const file of files) {
      const violations = scanFile(file, srcDir)
      allViolations.push(...violations)
    }

    if (allViolations.length > 0) {
      const violationReport = allViolations
        .map(
          (v) =>
            `  - ${v.file}:${v.line} [console.${v.method}]\n    ${v.content}`
        )
        .join('\n\n')

      const errorMessage = `Found ${allViolations.length} console statement(s) in production code:\n\n${violationReport}\n\n` +
        `Production code should use proper logging abstractions instead of console methods.\n` +
        `If you need to keep a console statement, add the file path to ALLOWED_PATHS in this test.`

      expect.fail(errorMessage)
    }
  })

  it('should scan all TypeScript files in src/', () => {
    const files = getTypeScriptFiles(srcDir)
    expect(files.length).toBeGreaterThan(0)
  })

  describe('Detection edge cases', () => {
    it('should detect simple console.log calls', () => {
      const testContent = 'console.log("test")'
      expect(testContent).toMatch(CONSOLE_PATTERN)
    })

    it('should detect console.error calls', () => {
      const testContent = 'console.error(error)'
      expect(testContent).toMatch(CONSOLE_PATTERN)
    })

    it('should detect console.warn calls', () => {
      const testContent = 'console.warn("warning")'
      expect(testContent).toMatch(CONSOLE_PATTERN)
    })

    it('should not match console in variable names', () => {
      const testContent = 'const myConsole = {}'
      expect(testContent).not.toMatch(CONSOLE_PATTERN)
    })
  })
})
