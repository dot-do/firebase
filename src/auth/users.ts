import { webcrypto, pbkdf2Sync, timingSafeEqual } from 'crypto'

export interface UserRecord {
  localId: string
  email?: string
  emailVerified: boolean
  displayName?: string
  photoUrl?: string
  passwordHash?: string
  passwordSalt?: string
  passwordUpdatedAt?: number
  providerUserInfo: Array<{
    providerId: string
    federatedId?: string
    email?: string
    displayName?: string
    photoUrl?: string
  }>
  validSince?: string
  disabled: boolean
  lastLoginAt?: string
  createdAt: string
  lastRefreshAt?: string
}

// In-memory user storage (in production, this would be a database)
const users = new Map<string, UserRecord>()
const emailToUidMap = new Map<string, string>()

export function generateUserId(): string {
  const bytes = new Uint8Array(28)
  webcrypto.getRandomValues(bytes)
  // Convert to base62-like string (alphanumeric)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (const byte of bytes) {
    result += chars[byte % chars.length]
  }
  return result // Firebase UIDs are typically 28 characters
}

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const passwordSalt = salt || webcrypto.randomUUID()
  const hash = pbkdf2Sync(password, passwordSalt, 100000, 64, 'sha512').toString('base64')
  return { hash, salt: passwordSalt }
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const { hash: computedHash } = hashPassword(password, salt)
  return timingSafeEqual(Buffer.from(computedHash), Buffer.from(hash))
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function isValidPassword(password: string): boolean {
  // Firebase requires passwords to be at least 6 characters
  return password.length >= 6
}

export function createUser(data: {
  email?: string
  password?: string
  displayName?: string
  photoUrl?: string
  emailVerified?: boolean
}): UserRecord {
  const localId = generateUserId()
  const now = Date.now().toString()

  // Hash password if provided
  let passwordHash: string | undefined
  let passwordSalt: string | undefined
  if (data.password) {
    const hashed = hashPassword(data.password)
    passwordHash = hashed.hash
    passwordSalt = hashed.salt
  }

  const providerUserInfo: UserRecord['providerUserInfo'] = []
  if (data.email) {
    providerUserInfo.push({
      providerId: 'password',
      email: data.email,
      federatedId: data.email,
      displayName: data.displayName,
      photoUrl: data.photoUrl,
    })
  }

  const user: UserRecord = {
    localId,
    email: data.email,
    emailVerified: data.emailVerified || false,
    displayName: data.displayName,
    photoUrl: data.photoUrl,
    passwordHash,
    passwordSalt,
    passwordUpdatedAt: data.password ? Date.now() : undefined,
    providerUserInfo,
    disabled: false,
    createdAt: now,
    lastLoginAt: now,
  }

  users.set(localId, user)
  if (data.email) {
    emailToUidMap.set(data.email.toLowerCase(), localId)
  }

  return user
}

export function getUserById(localId: string): UserRecord | undefined {
  return users.get(localId)
}

export function getUserByEmail(email: string): UserRecord | undefined {
  const localId = emailToUidMap.get(email.toLowerCase())
  return localId ? users.get(localId) : undefined
}

export function updateUser(
  localId: string,
  updates: {
    email?: string
    password?: string
    displayName?: string | null
    photoUrl?: string | null
    emailVerified?: boolean
  }
): UserRecord | undefined {
  const user = users.get(localId)
  if (!user) {
    return undefined
  }

  // Update email
  if (updates.email !== undefined && updates.email !== user.email) {
    // Remove old email mapping
    if (user.email) {
      emailToUidMap.delete(user.email.toLowerCase())
    }
    // Add new email mapping
    emailToUidMap.set(updates.email.toLowerCase(), localId)
    user.email = updates.email

    // Update provider info
    const emailProvider = user.providerUserInfo.find((p) => p.providerId === 'password')
    if (emailProvider) {
      emailProvider.email = updates.email
      emailProvider.federatedId = updates.email
    } else if (user.passwordHash) {
      user.providerUserInfo.push({
        providerId: 'password',
        email: updates.email,
        federatedId: updates.email,
      })
    }
  }

  // Update password
  if (updates.password !== undefined) {
    const hashed = hashPassword(updates.password)
    user.passwordHash = hashed.hash
    user.passwordSalt = hashed.salt
    user.passwordUpdatedAt = Date.now()
  }

  // Update displayName
  if (updates.displayName !== undefined) {
    if (updates.displayName === null) {
      delete user.displayName
    } else {
      user.displayName = updates.displayName
    }
    // Update in provider info
    const emailProvider = user.providerUserInfo.find((p) => p.providerId === 'password')
    if (emailProvider) {
      if (updates.displayName === null) {
        delete emailProvider.displayName
      } else {
        emailProvider.displayName = updates.displayName
      }
    }
  }

  // Update photoUrl
  if (updates.photoUrl !== undefined) {
    if (updates.photoUrl === null) {
      delete user.photoUrl
    } else {
      user.photoUrl = updates.photoUrl
    }
    // Update in provider info
    const emailProvider = user.providerUserInfo.find((p) => p.providerId === 'password')
    if (emailProvider) {
      if (updates.photoUrl === null) {
        delete emailProvider.photoUrl
      } else {
        emailProvider.photoUrl = updates.photoUrl
      }
    }
  }

  // Update emailVerified
  if (updates.emailVerified !== undefined) {
    user.emailVerified = updates.emailVerified
  }

  return user
}

export function deleteUser(localId: string): boolean {
  const user = users.get(localId)
  if (!user) {
    return false
  }

  if (user.email) {
    emailToUidMap.delete(user.email.toLowerCase())
  }
  users.delete(localId)
  return true
}

export function updateLastLoginAt(localId: string): void {
  const user = users.get(localId)
  if (user) {
    user.lastLoginAt = Date.now().toString()
  }
}

export function updateLastRefreshAt(localId: string): void {
  const user = users.get(localId)
  if (user) {
    user.lastRefreshAt = new Date().toISOString()
  }
}

// For testing purposes
export function clearAllUsers(): void {
  users.clear()
  emailToUidMap.clear()
}
