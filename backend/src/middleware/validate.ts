import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';

/**
 * Drop-in middleware that short-circuits with 400 when express-validator finds errors.
 * Use after validator arrays so route handlers can skip the repetitive validationResult check.
 *
 * @example
 * router.post('/users', [body('email').isEmail()], handleValidation, async (req, res) => { ... });
 */
export function handleValidation(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const firstMsg = errors.array()[0]?.msg || 'Datos inválidos';
    res.status(400).json({ error: firstMsg, errors: errors.array() });
    return;
  }
  next();
}
