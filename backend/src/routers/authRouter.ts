import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { login } from '../services/authService';
import { authMiddleware } from '../middleware/auth';
import { handleValidation } from '../middleware/validate';
import { AuthenticatedRequest } from '../types';

const router = Router();

router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Correo electrónico no válido'),
    body('password').notEmpty().withMessage('La contraseña es requerida'),
  ],
  handleValidation,
  async (req: Request, res: Response) => {
    const { email, password } = req.body;
    try {
      const result = await login(email, password);
      if (!result) {
        return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
      }
      return res.json(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Error al iniciar sesión';
      return res.status(500).json({ error: message });
    }
  },
);

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
