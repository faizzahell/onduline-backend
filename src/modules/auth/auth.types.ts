/** The contents of a JWT access token. */
export interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
}

/** The user profile sent to the client, without sensitive data. */
export interface AuthProfile {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
  user: AuthProfile;
}
