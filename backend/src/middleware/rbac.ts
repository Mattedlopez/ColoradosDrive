import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { UserRole } from '../types';

/**
 * Strategy Pattern: returns a middleware that restricts access to the given roles.
 * Replaces the separate requireAdmin / requireStudent / requireInstructor functions
 * with a single composable factory, making new roles trivial to add.
 *
 * @example
 * router.use(authMiddleware, requireRole('admin'));
 * router.get('/report', authMiddleware, requireRole('admin', 'instructor'), handler);
 */
export function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: `Access denied. Required role: ${roles.join(' or ')}` });
      return;
    }
    next();
  };
}

// ── Named aliases kept for backward compatibility ──────────────────────────

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  requireRole('admin')(req, res, next);
}

export function requireStudent(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  requireRole('student')(req, res, next);
}

export function requireInstructor(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }
  if (req.user.role !== 'instructor' || !req.user.instructorId) {
    res.status(403).json({ error: 'Acceso solo para instructores' });
    return;
  }
  next();
}
