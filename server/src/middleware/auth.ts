import { Request, Response, NextFunction } from 'express';

export interface AuthContext {
  userId: string;
  roles: string[];
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

/**
 * Dummy authentication middleware that can be swapped with campus SSO.
 * Attaches a static user context for downstream auditing without leaking credentials.
 */
export const attachAuth = (req: Request, _res: Response, next: NextFunction) => {
  req.auth = {
    userId: 'demo-user',
    roles: ['annotator'],
  };
  next();
};
