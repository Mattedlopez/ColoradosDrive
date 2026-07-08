import { Router, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';

/**
 * authRouter — el login ya NO vive aquí: el frontend hace OIDC directo contra
 * Keycloak (PKCE) y este backend solo valida tokens. El 2FA (OTP TOTP) también
 * lo gestiona Keycloak (required action CONFIGURE_TOTP).
 */
const router = Router();

router.get('/me', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const payload: Record<string, unknown> = {
    id: req.user.id,
    email: req.user.email,
    fullName: req.user.fullName,
    role: req.user.role,
    courseId: req.user.courseId,
  };
  if (req.user.role === 'instructor' && req.user.instructorId) {
    payload.instructorId = req.user.instructorId;
  }
  res.json(payload);
});

export default router;
