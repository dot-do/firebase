import { generateFirebaseToken, verifyFirebaseToken } from './jwt.js'
import {
  createUser,
  getUserById,
  getUserByEmail,
  updateUser,
  deleteUser,
  updateLastLoginAt,
  isValidEmail,
  isValidPassword,
  verifyPassword,
  type UserRecord,
} from './users.js'

export interface IdentityToolkitError {
  error: {
    code: number
    message: string
    errors?: Array<{
      message: string
      domain: string
      reason: string
    }>
  }
}

export interface SignUpRequest {
  email?: string
  password?: string
  returnSecureToken?: boolean
  displayName?: string
  photoUrl?: string
}

export interface SignUpResponse {
  idToken: string
  email: string
  refreshToken: string
  expiresIn: string
  localId: string
}

export interface SignInWithPasswordRequest {
  email: string
  password: string
  returnSecureToken?: boolean
}

export interface SignInWithPasswordResponse {
  idToken: string
  email: string
  refreshToken: string
  expiresIn: string
  localId: string
  registered: boolean
}

export interface LookupRequest {
  idToken?: string
  localId?: string[]
}

export interface LookupResponse {
  kind: string
  users: Array<{
    localId: string
    email: string
    emailVerified: boolean
    displayName?: string
    photoUrl?: string
    providerUserInfo: Array<{
      providerId: string
      federatedId?: string
      email?: string
      displayName?: string
      photoUrl?: string
    }>
    passwordHash?: string
    passwordUpdatedAt?: number
    validSince?: string
    disabled?: boolean
    lastLoginAt?: string
    createdAt?: string
    lastRefreshAt?: string
  }>
}

export interface UpdateRequest {
  idToken: string
  email?: string
  password?: string
  displayName?: string
  photoUrl?: string
  deleteAttribute?: string[]
  returnSecureToken?: boolean
}

export interface UpdateResponse {
  localId: string
  email: string
  displayName?: string
  photoUrl?: string
  passwordHash?: string
  providerUserInfo: Array<{
    providerId: string
    federatedId?: string
  }>
  idToken?: string
  refreshToken?: string
  expiresIn?: string
  emailVerified?: boolean
}

export interface DeleteRequest {
  idToken: string
}

export interface DeleteResponse {
  kind: string
}

export interface SendOobCodeRequest {
  requestType: string
  email?: string
  idToken?: string
  newEmail?: string
}

export interface SendOobCodeResponse {
  kind: string
  email: string
}

const PROJECT_ID = 'test-project'

function createError(message: string, code: number = 400): IdentityToolkitError {
  return {
    error: {
      code,
      message,
      errors: [
        {
          message,
          domain: 'global',
          reason: 'invalid',
        },
      ],
    },
  }
}

function generateRefreshToken(): string {
  // In a real implementation, this would be a secure refresh token
  // For now, just generate a random string
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function handleSignUp(
  request: SignUpRequest
): Promise<SignUpResponse | IdentityToolkitError> {
  // Validate email format if provided
  if (request.email !== undefined) {
    if (!isValidEmail(request.email)) {
      return createError('INVALID_EMAIL')
    }
  }

  // Validate password if provided
  if (request.password !== undefined) {
    if (!isValidPassword(request.password)) {
      return createError('WEAK_PASSWORD : Password should be at least 6 characters')
    }
  }

  // Check for duplicate email
  if (request.email) {
    const existingUser = getUserByEmail(request.email)
    if (existingUser) {
      return createError('EMAIL_EXISTS')
    }
  }

  // Create user
  const user = createUser({
    email: request.email,
    password: request.password,
    displayName: request.displayName,
    photoUrl: request.photoUrl,
    emailVerified: false,
  })

  // Generate tokens
  const idToken = await generateFirebaseToken({
    uid: user.localId,
    projectId: PROJECT_ID,
    email: user.email,
    emailVerified: user.emailVerified,
    displayName: user.displayName,
    photoURL: user.photoUrl,
    signInProvider: user.email ? 'password' : 'anonymous',
    identities: user.email ? { email: [user.email] } : {},
  })

  const refreshToken = generateRefreshToken()

  return {
    idToken,
    email: user.email || '',
    refreshToken,
    expiresIn: '3600',
    localId: user.localId,
  }
}

export async function handleSignInWithPassword(
  request: SignInWithPasswordRequest
): Promise<SignInWithPasswordResponse | IdentityToolkitError> {
  // Validate required fields
  if (!request.email) {
    return createError('MISSING_EMAIL')
  }
  if (!request.password) {
    return createError('MISSING_PASSWORD')
  }

  // Find user by email
  const user = getUserByEmail(request.email)
  if (!user) {
    return createError('EMAIL_NOT_FOUND')
  }

  // Verify password
  if (!user.passwordHash || !user.passwordSalt) {
    return createError('INVALID_PASSWORD')
  }

  if (!verifyPassword(request.password, user.passwordHash, user.passwordSalt)) {
    return createError('INVALID_PASSWORD')
  }

  // Update last login
  updateLastLoginAt(user.localId)

  // Generate tokens
  const idToken = await generateFirebaseToken({
    uid: user.localId,
    projectId: PROJECT_ID,
    email: user.email,
    emailVerified: user.emailVerified,
    displayName: user.displayName,
    photoURL: user.photoUrl,
    signInProvider: 'password',
    identities: user.email ? { email: [user.email] } : {},
  })

  const refreshToken = generateRefreshToken()

  return {
    idToken,
    email: user.email || '',
    refreshToken,
    expiresIn: '3600',
    localId: user.localId,
    registered: true,
  }
}

export async function handleLookup(
  request: LookupRequest
): Promise<LookupResponse | IdentityToolkitError> {
  if (!request.idToken) {
    return createError('MISSING_ID_TOKEN')
  }

  try {
    const payload = await verifyFirebaseToken(request.idToken, PROJECT_ID)
    const user = getUserById(payload.user_id)

    if (!user) {
      return createError('INVALID_ID_TOKEN')
    }

    return {
      kind: 'identitytoolkit#GetAccountInfoResponse',
      users: [
        {
          localId: user.localId,
          email: user.email || '',
          emailVerified: user.emailVerified,
          displayName: user.displayName,
          photoUrl: user.photoUrl,
          providerUserInfo: user.providerUserInfo,
          passwordHash: user.passwordHash,
          passwordUpdatedAt: user.passwordUpdatedAt,
          validSince: user.validSince,
          disabled: user.disabled,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt,
          lastRefreshAt: user.lastRefreshAt,
        },
      ],
    }
  } catch (error) {
    if (error instanceof Error) {
      return createError(error.message)
    }
    return createError('INVALID_ID_TOKEN')
  }
}

export async function handleUpdate(
  request: UpdateRequest
): Promise<UpdateResponse | IdentityToolkitError> {
  if (!request.idToken) {
    return createError('MISSING_ID_TOKEN')
  }

  let payload
  try {
    payload = await verifyFirebaseToken(request.idToken, PROJECT_ID)
  } catch (error) {
    if (error instanceof Error) {
      return createError(error.message)
    }
    return createError('INVALID_ID_TOKEN')
  }

  const user = getUserById(payload.user_id)
  if (!user) {
    return createError('INVALID_ID_TOKEN')
  }

  // Check if email is already in use
  if (request.email && request.email !== user.email) {
    const existingUser = getUserByEmail(request.email)
    if (existingUser) {
      return createError('EMAIL_EXISTS')
    }
  }

  // Prepare updates
  const updates: {
    email?: string
    password?: string
    displayName?: string | null
    photoUrl?: string | null
  } = {}

  if (request.email !== undefined) {
    updates.email = request.email
  }
  if (request.password !== undefined) {
    updates.password = request.password
  }
  if (request.displayName !== undefined) {
    updates.displayName = request.displayName
  }
  if (request.photoUrl !== undefined) {
    updates.photoUrl = request.photoUrl
  }

  // Handle deleteAttribute
  if (request.deleteAttribute) {
    for (const attr of request.deleteAttribute) {
      if (attr === 'DISPLAY_NAME') {
        updates.displayName = null
      } else if (attr === 'PHOTO_URL') {
        updates.photoUrl = null
      }
    }
  }

  // Update user
  const updatedUser = updateUser(user.localId, updates)
  if (!updatedUser) {
    return createError('INVALID_ID_TOKEN')
  }

  const response: UpdateResponse = {
    localId: updatedUser.localId,
    email: updatedUser.email || '',
    displayName: updatedUser.displayName,
    photoUrl: updatedUser.photoUrl,
    passwordHash: updatedUser.passwordHash,
    providerUserInfo: updatedUser.providerUserInfo,
    emailVerified: updatedUser.emailVerified,
  }

  // Generate new tokens if requested or if password was changed
  if (request.returnSecureToken || request.password) {
    const idToken = await generateFirebaseToken({
      uid: updatedUser.localId,
      projectId: PROJECT_ID,
      email: updatedUser.email,
      emailVerified: updatedUser.emailVerified,
      displayName: updatedUser.displayName,
      photoURL: updatedUser.photoUrl,
      signInProvider: 'password',
      identities: updatedUser.email ? { email: [updatedUser.email] } : {},
    })

    response.idToken = idToken
    response.refreshToken = generateRefreshToken()
    response.expiresIn = '3600'
  }

  return response
}

export async function handleDelete(
  request: DeleteRequest
): Promise<DeleteResponse | IdentityToolkitError> {
  if (!request.idToken) {
    return createError('MISSING_ID_TOKEN')
  }

  let payload
  try {
    payload = await verifyFirebaseToken(request.idToken, PROJECT_ID)
  } catch (error) {
    if (error instanceof Error) {
      return createError(error.message)
    }
    return createError('INVALID_ID_TOKEN')
  }

  const deleted = deleteUser(payload.user_id)
  if (!deleted) {
    return createError('INVALID_ID_TOKEN')
  }

  return {
    kind: 'identitytoolkit#DeleteAccountResponse',
  }
}

export async function handleSendOobCode(
  request: SendOobCodeRequest
): Promise<SendOobCodeResponse | IdentityToolkitError> {
  const validRequestTypes = ['VERIFY_EMAIL', 'PASSWORD_RESET', 'VERIFY_AND_CHANGE_EMAIL']

  if (!request.requestType || !validRequestTypes.includes(request.requestType)) {
    return createError('INVALID_REQ_TYPE')
  }

  if (request.requestType === 'VERIFY_EMAIL' || request.requestType === 'VERIFY_AND_CHANGE_EMAIL') {
    if (!request.idToken) {
      return createError('MISSING_ID_TOKEN')
    }

    let payload
    try {
      payload = await verifyFirebaseToken(request.idToken, PROJECT_ID)
    } catch (error) {
      if (error instanceof Error) {
        return createError(error.message)
      }
      return createError('INVALID_ID_TOKEN')
    }

    const user = getUserById(payload.user_id)
    if (!user) {
      return createError('INVALID_ID_TOKEN')
    }

    return {
      kind: 'identitytoolkit#GetOobConfirmationCodeResponse',
      email: request.newEmail || user.email || '',
    }
  }

  if (request.requestType === 'PASSWORD_RESET') {
    if (!request.email) {
      return createError('MISSING_EMAIL')
    }

    const user = getUserByEmail(request.email)
    if (!user) {
      return createError('EMAIL_NOT_FOUND')
    }

    return {
      kind: 'identitytoolkit#GetOobConfirmationCodeResponse',
      email: request.email,
    }
  }

  return createError('INVALID_REQ_TYPE')
}
