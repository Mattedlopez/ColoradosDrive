import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { authMiddleware } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { uploadSingle } from '../middleware/upload';
import { createUser, deleteUser, updateUserProfile } from '../services/userService';
import { handleValidation } from '../middleware/validate';
import * as adminService from '../services/adminService';
import * as examService from '../services/examService';
import * as instructorService from '../services/instructorService';
import * as scheduleService from '../services/scheduleService';
import * as notificationService from '../services/notificationService';
import * as paymentService from '../services/paymentService';
import * as attendanceService from '../services/attendanceService';
import * as downloadsService from '../services/downloadsService';
import * as cashService from '../services/cashService';
import { uploadFile } from '../services/uploadService';
import { AuthenticatedRequest } from '../types';
import archiver from 'archiver';

const router = Router();
router.use(authMiddleware, requireAdmin);

const optionalFalsy = { values: 'falsy' as const };
router.post(
  '/users',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
    body('fullName').trim().notEmpty().withMessage('El nombre completo es requerido'),
    body('cedula').trim().notEmpty().withMessage('El número de cédula es requerido'),
    body('role').isIn(['admin', 'student']),
    body('cohortId').optional(optionalFalsy).isUUID(),
    body('gender').optional(optionalFalsy).isIn(['masculino', 'femenino']),
    body('scheduleId').optional(optionalFalsy).isUUID(),
    body('instructorId').optional(optionalFalsy).isUUID(),
    body('dayOfWeek').optional(optionalFalsy).isInt({ min: 1, max: 7 }),
    body('startTime').optional(optionalFalsy).matches(/^(0[6-9]|1[0-9]|2[0-3]):00$/),
    body('scheduleType').optional(optionalFalsy).isIn(['weekdays', 'weekends']),
    body('practiceWeeks').optional(optionalFalsy).toInt().isInt({ min: 1, max: 3 }),
    body('practiceHoursPerDay').optional(optionalFalsy).toInt().isInt({ min: 1, max: 4 }),
    body('citizenship').optional(optionalFalsy).trim().isString().isLength({ max: 100 }),
    body('bloodType').optional(optionalFalsy).trim().isString().isLength({ max: 10 }),
    body('birthDate').optional(optionalFalsy).trim().isString().isLength({ max: 20 }),
    body('address').optional(optionalFalsy).trim().isString().isLength({ max: 500 }),
    body('phone').optional(optionalFalsy).trim().isString().isLength({ max: 50 }),
    body('startDate').optional(optionalFalsy).trim().isString().isLength({ max: 20 }),
    body('endDate').optional(optionalFalsy).trim().isString().isLength({ max: 20 }),
    body('practiceStartDate').optional(optionalFalsy).trim().isString().isLength({ max: 20 }),
    body('practiceEndDate').optional(optionalFalsy).trim().isString().isLength({ max: 20 }),
    body('modality').optional(optionalFalsy).trim().isString().isIn(['intensivo', 'regular', 'fin de semana']),
    body('initialPaymentAmount').optional(optionalFalsy).isFloat({ min: 0 }),
    body('discountApplied').optional(optionalFalsy).isFloat({ min: 0 }),
    body('discountNote').optional(optionalFalsy).trim().isString().isLength({ max: 500 }),
  ],
  handleValidation,
  async (req: AuthenticatedRequest, res: Response) => {
    const { email, password, fullName, role, cohortId, cedula, gender, scheduleId, instructorId, dayOfWeek, startTime, scheduleType, practiceWeeks: practiceWeeksRaw, practiceHoursPerDay: practiceHoursPerDayRaw, citizenship, bloodType, birthDate, address, phone, startDate, endDate, practiceStartDate, practiceEndDate, modality, initialPaymentAmount, discountApplied, discountNote } = req.body;
    const practiceWeeksNum = practiceWeeksRaw != null ? Number(practiceWeeksRaw) : null;
    const practiceWeeks = practiceWeeksNum === 1 || practiceWeeksNum === 2 || practiceWeeksNum === 3 ? practiceWeeksNum : null;
    const practiceHoursPerDay = practiceHoursPerDayRaw != null ? Math.min(4, Math.max(1, Number(practiceHoursPerDayRaw))) : 1;

    const result = await createUser({
      email,
      password,
      fullName,
      role,
      courseId: null,
      cohortId: role === 'student' ? (cohortId || null) : null,
      cedula: cedula?.trim() || null,
      gender: gender === 'masculino' || gender === 'femenino' ? gender : null,
      scheduleId: role === 'student' ? (scheduleId || null) : null,
      instructorId: role === 'student' ? (instructorId || null) : null,
      dayOfWeek: role === 'student' ? (dayOfWeek != null ? Number(dayOfWeek) : null) : null,
      startTime: role === 'student' ? (startTime != null && String(startTime).trim() ? String(startTime).trim().slice(0, 5) : null) : null,
      scheduleType: role === 'student' ? (scheduleType === 'weekdays' || scheduleType === 'weekends' ? scheduleType : null) : null,
      practiceWeeks: role === 'student' ? practiceWeeks : null,
      practiceHoursPerDay: role === 'student' ? practiceHoursPerDay : undefined,
      citizenship: citizenship?.trim() || null,
      bloodType: bloodType?.trim() || null,
      birthDate: role === 'student' ? (birthDate?.trim() || null) : null,
      address: role === 'student' ? (address?.trim() || null) : null,
      phone: role === 'student' ? (phone?.trim() || null) : null,
      startDate: role === 'student' ? (startDate?.trim() || null) : null,
      endDate: role === 'student' ? (endDate?.trim() || null) : null,
      practiceStartDate: role === 'student' ? (practiceStartDate?.trim() || null) : null,
      practiceEndDate: role === 'student' ? (practiceEndDate?.trim() || null) : null,
      modality: role === 'student' ? (modality?.trim() || null) : null,
      initialPaymentAmount: role === 'student' ? (initialPaymentAmount != null ? Number(initialPaymentAmount) : null) : null,
      discountApplied: role === 'student' ? (discountApplied != null ? Number(discountApplied) : null) : null,
      discountNote: role === 'student' ? (discountNote?.trim() || null) : null,
      createdBy: req.user?.id ?? null,
      mustChangePassword: true,
    });

    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json({ userId: result.userId, message: 'User created successfully' });
  }
);

router.get('/users', async (req: AuthenticatedRequest, res: Response) => {
  const courseId = req.query.courseId as string | undefined;
  const cohortId = req.query.cohortId as string | undefined;
  const role = req.query.role as string | undefined;
  const search = req.query.search as string | undefined; // busca por cédula, nombre o email

  try {
    const users = await adminService.listUsers({ courseId, cohortId, role, search });
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/users/:id/activity', [param('id').isUUID()], handleValidation, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { getActivity } = await import('../services/activityService');
    const activity = await getActivity(req.params.id);
    res.json(activity || { last_active_at: null, total_time_seconds: 0, contents_viewed: [] });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.delete('/users/:id', [param('id').isUUID()], handleValidation, async (req: AuthenticatedRequest, res: Response) => {
  const result = await deleteUser(req.params.id);
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ message: 'User deleted' });
});

router.patch(
  '/users/:id',
  [
    param('id').isUUID(),
    body('fullName').optional().trim().notEmpty(),
    body('role').optional().isIn(['admin', 'student']),
    body('cohortId').optional(optionalFalsy).isUUID(),
    body('cedula').optional().trim().isString(),
    body('gender').optional().isIn(['masculino', 'femenino']),
    body('scheduleId').optional().isUUID(),
    body('instructorId').optional().isUUID(),
    body('dayOfWeek').optional().isInt({ min: 1, max: 7 }),
    body('startTime').optional(optionalFalsy).matches(/^(0[6-9]|1[0-9]|2[0-3]):00$/),
    body('scheduleType').optional().isIn(['weekdays', 'weekends']),
    body('practiceWeeks').optional().toInt().isInt({ min: 1, max: 3 }),
    body('practiceHoursPerDay').optional().toInt().isInt({ min: 1, max: 4 }),
    body('citizenship').optional().trim().isString().isLength({ max: 100 }),
    body('bloodType').optional().trim().isString().isLength({ max: 10 }),
    body('birthDate').optional().trim().isString().isLength({ max: 20 }),
    body('address').optional().trim().isString().isLength({ max: 500 }),
    body('phone').optional().trim().isString().isLength({ max: 50 }),
    body('startDate').optional().trim().isString().isLength({ max: 20 }),
    body('endDate').optional().trim().isString().isLength({ max: 20 }),
    body('practiceStartDate').optional().trim().isString().isLength({ max: 20 }),
    body('practiceEndDate').optional().trim().isString().isLength({ max: 20 }),
    body('modality').optional().trim().isString().isIn(['intensivo', 'regular', 'fin de semana']),
    body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  handleValidation,
  async (req: AuthenticatedRequest, res: Response) => {
    const { fullName, role, cohortId, cedula, gender, scheduleId, instructorId, dayOfWeek, startTime, scheduleType, practiceWeeks: practiceWeeksRaw, practiceHoursPerDay: practiceHoursPerDayRaw, citizenship, bloodType, birthDate, address, phone, startDate, endDate, practiceStartDate, practiceEndDate, modality, password } = req.body;
    const practiceWeeksNum = practiceWeeksRaw != null ? Number(practiceWeeksRaw) : null;
    const practiceWeeks = practiceWeeksNum === 1 || practiceWeeksNum === 2 || practiceWeeksNum === 3 ? practiceWeeksNum : undefined;
    const practiceHoursPerDay = practiceHoursPerDayRaw != null ? Math.min(4, Math.max(1, Number(practiceHoursPerDayRaw))) : undefined;
    if (role === 'student' && !cohortId) {
      res.status(400).json({ error: 'Para estudiante selecciona un curso (Curso Tipo A/B Nro X)' });
      return;
    }
    const result = await updateUserProfile(req.params.id, {
      fullName,
      role,
      courseId: null,
      cohortId: cohortId ?? null,
      cedula: cedula !== undefined ? (cedula?.trim() || null) : undefined,
      gender: gender !== undefined ? (gender === 'masculino' || gender === 'femenino' ? gender : null) : undefined,
      scheduleId: scheduleId !== undefined ? scheduleId : undefined,
      instructorId: instructorId ?? undefined,
      dayOfWeek: dayOfWeek ?? undefined,
      startTime: startTime ?? undefined,
      scheduleType: scheduleType ?? undefined,
      practiceWeeks: practiceWeeks !== undefined ? practiceWeeks : undefined,
      practiceHoursPerDay: practiceHoursPerDay !== undefined ? practiceHoursPerDay : undefined,
      citizenship: citizenship !== undefined ? (citizenship?.trim() || null) : undefined,
      bloodType: bloodType !== undefined ? (bloodType?.trim() || null) : undefined,
      birthDate: birthDate !== undefined ? (birthDate?.trim() || null) : undefined,
      address: address !== undefined ? (address?.trim() || null) : undefined,
      phone: phone !== undefined ? (phone?.trim() || null) : undefined,
      startDate: startDate !== undefined ? (startDate?.trim() || null) : undefined,
      endDate: endDate !== undefined ? (endDate?.trim() || null) : undefined,
      practiceStartDate: practiceStartDate !== undefined ? (practiceStartDate?.trim() || null) : undefined,
      practiceEndDate: practiceEndDate !== undefined ? (practiceEndDate?.trim() || null) : undefined,
      modality: modality !== undefined ? (modality?.trim() || null) : undefined,
      password,
    });
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ message: 'User updated' });
  }
);

router.get('/schedule-groups', async (req: AuthenticatedRequest, res: Response) => {
  const cohortId = req.query.cohortId as string | undefined;
  if (!cohortId) {
    res.status(400).json({ error: 'cohortId es requerido' });
    return;
  }
  try {
    const groups = await scheduleService.listScheduleGroupsByCohort(cohortId);
    res.json(groups);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/users/:id/schedule-display', [param('id').isUUID()], handleValidation, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const display = await scheduleService.getStudentScheduleDisplay(req.params.id);
    res.json(display || { type: 'single', label: 'Sin horario', practiceWeeks: null, slots: [], overrides: [] });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post(
  '/users/:id/schedule-rest',
  [param('id').isUUID(), body('cohortId').optional().isUUID(), body('instructorId').optional().isUUID(), body('type').optional().isIn(['weekdays', 'weekends']), body('startTime').optional().matches(/^(0[6-9]|1[0-9]|2[0-3]):00$/), body('scheduleId').optional().isUUID()],
  handleValidation,
  async (req: AuthenticatedRequest, res: Response) => {
    const { cohortId, instructorId, type, startTime, scheduleId } = req.body;
    if (scheduleId) {
      const result = await scheduleService.setStudentScheduleRestOfCourse(req.params.id, { scheduleId });
      if (result.error) {
        res.status(400).json({ error: result.error });
        return;
      }
      return res.json({ message: 'Horario actualizado para el resto del curso' });
    }
    if (!cohortId || !instructorId || !type || !startTime) {
      res.status(400).json({ error: 'Indica cohortId, instructorId, type (weekdays|weekends) y startTime, o scheduleId' });
      return;
    }
    const result = await scheduleService.setStudentScheduleRestOfCourse(req.params.id, { cohortId, instructorId, type, startTime });
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ message: 'Horario actualizado para el resto del curso' });
  }
);

router.post(
  '/users/:id/schedule-one-day',
  [param('id').isUUID(), body('dayOfWeek').isInt({ min: 1, max: 7 }), body('courseScheduleId').isUUID()],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { dayOfWeek, courseScheduleId } = req.body;
    const result = await scheduleService.setStudentScheduleOneDay(req.params.id, dayOfWeek, courseScheduleId);
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ message: 'Horario del día actualizado' });
  }
);

router.delete('/users/:id/schedule-one-day/:dayOfWeek', [param('id').isUUID(), param('dayOfWeek').isInt({ min: 1, max: 7 })], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  const result = await scheduleService.clearStudentScheduleOneDay(req.params.id, Number(req.params.dayOfWeek));
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ message: 'Override del día eliminado' });
});

router.get('/courses', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const courses = await adminService.listCourses();
    res.json(courses);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post(
  '/courses',
  [
    body('name').trim().notEmpty(),
    body('code').trim().notEmpty().isLength({ max: 20 }),
    body('price').optional().isFloat({ min: 0 }),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    try {
      const price = req.body.price != null ? Number(req.body.price) : 0;
      const course = await adminService.createCourse(req.body.name, req.body.code, price);
      res.status(201).json(course);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  }
);

router.patch(
  '/courses/:id',
  [
    param('id').isUUID(),
    body('name').optional().trim().notEmpty(),
    body('code').optional().trim().isString().isLength({ max: 20 }),
    body('price').optional().isFloat({ min: 0 }),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    try {
      const update: { name?: string; code?: string; price?: number } = {};
      if (req.body.name !== undefined) update.name = req.body.name;
      if (req.body.code !== undefined) update.code = req.body.code;
      if (req.body.price !== undefined) update.price = Number(req.body.price);
      const course = await adminService.updateCourse(req.params.id, update);
      res.json(course ?? { message: 'No changes' });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  }
);

router.delete('/courses/:id', [param('id').isUUID()], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  try {
    await adminService.deleteCourse(req.params.id);
    res.json({ message: 'Course deleted' });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/cohorts', async (req: AuthenticatedRequest, res: Response) => {
  const courseId = req.query.courseId as string | undefined;
  try {
    const cohorts = await adminService.listCohorts(courseId);
    res.json(cohorts);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post(
  '/cohorts',
  [
    body('courseId').isUUID(),
    body('name').trim().notEmpty(),
    body('code').trim().notEmpty(),
    body('startDate').optional().trim().isString().isLength({ max: 20 }),
    body('endDate').optional().trim().isString().isLength({ max: 20 }),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    try {
      const { courseId, name, code, startDate, endDate } = req.body;
      const cohort = await adminService.createCohort(courseId, name, code, startDate || null, endDate || null);
      res.status(201).json(cohort);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  }
);

router.patch(
  '/cohorts/:id',
  [
    param('id').isUUID(),
    body('courseId').isUUID(),
    body('name').trim().notEmpty(),
    body('code').trim().notEmpty(),
    body('startDate').optional().trim().isString().isLength({ max: 20 }),
    body('endDate').optional().trim().isString().isLength({ max: 20 }),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    try {
      const { courseId, name, code, startDate, endDate } = req.body;
      const cohort = await adminService.updateCohort(req.params.id, {
        courseId,
        name,
        code,
        startDate: startDate || null,
        endDate: endDate || null,
      });
      res.json(cohort);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  }
);

router.delete('/cohorts/:id', [param('id').isUUID()], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  const deleteUsers = req.query.deleteUsers === 'true';
  try {
    if (deleteUsers) {
      const result = await adminService.deleteCohortWithUsers(req.params.id);
      res.json({ message: 'Cohort and all its users deleted', deletedUsers: result.deletedUsers });
    } else {
      await adminService.deleteCohort(req.params.id);
      res.json({ message: 'Cohort deleted (users unassigned)' });
    }
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/cohorts/:id/report', [param('id').isUUID()], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  try {
    const { getCohortReport } = await import('../services/reportService');
    const report = await getCohortReport(req.params.id);
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/upload', (req: AuthenticatedRequest, res: Response) => {
  uploadSingle(req, res, async (err: unknown) => {
    if (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Upload failed' });
      return;
    }
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    const folder = (req.query.folder as string) || 'contents';
    if (folder !== 'contents' && folder !== 'questions') {
      res.status(400).json({ error: 'Invalid folder. Use contents or questions.' });
      return;
    }
    try {
      const url = await uploadFile(file, folder);
      res.json({ url });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
});

router.post(
  '/subjects',
  [body('courseId').isUUID(), body('name').trim().notEmpty(), body('orderIndex').optional().isInt()],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    try {
      const subject = await adminService.createSubject(
        req.body.courseId,
        req.body.name,
        req.body.orderIndex ?? 0
      );
      res.status(201).json(subject);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  }
);

router.get('/subjects', async (req: AuthenticatedRequest, res: Response) => {
  const courseId = req.query.courseId as string | undefined;
  try {
    const subjects = await adminService.listSubjects(courseId);
    res.json(subjects);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.delete('/subjects/:id', [param('id').isUUID()], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  try {
    await adminService.deleteSubject(req.params.id);
    res.json({ message: 'Subject deleted' });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.delete('/contents/:id', [param('id').isUUID()], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  try {
    await adminService.deleteContent(req.params.id);
    res.json({ message: 'Content deleted' });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/subjects/:subjectId/contents', [param('subjectId').isUUID()], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  try {
    const contents = await adminService.listContentsBySubject(req.params.subjectId);
    res.json(contents);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post(
  '/contents',
  [
    body('subjectId').isUUID(),
    body('title').trim().notEmpty(),
    body('body').optional().isString(),
    body('externalLink').optional().isURL(),
    body('fileUrl').optional().isURL(),
    body('orderIndex').optional().isInt(),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    try {
      const content = await adminService.createContent(req.body.subjectId, {
        title: req.body.title,
        body: req.body.body,
        externalLink: req.body.externalLink,
        fileUrl: req.body.fileUrl,
        orderIndex: req.body.orderIndex,
      });
      res.status(201).json(content);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  }
);

// --- Exams ---
router.post(
  '/exams',
  [
    body('title').trim().notEmpty(),
    body('subjectId').optional().isUUID(),
    body('courseId').optional().isUUID(),
    body('description').optional().isString(),
    body('questionCount').isInt({ min: 1 }),
    body('passingScore').optional().isFloat({ min: 0, max: 100 }),
    body('durationMinutes').optional().isInt({ min: 1 }).toInt(),
    body('maxAttempts').optional().isInt({ min: 1 }).toInt(),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { subjectId, courseId } = req.body;
    if ((!subjectId && !courseId) || (subjectId && courseId)) {
      res.status(400).json({ error: 'Provide either subjectId or courseId' });
      return;
    }
    try {
      const exam = await examService.createExam({
        subjectId,
        courseId,
        title: req.body.title,
        description: req.body.description,
        questionCount: req.body.questionCount,
        passingScore: req.body.passingScore,
        durationMinutes: req.body.durationMinutes ?? null,
        maxAttempts: req.body.maxAttempts ?? 1,
      });
      res.status(201).json(exam);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  }
);

router.get('/exams/:id/questions', [param('id').isUUID()], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  try {
    const exam = await examService.getExamWithQuestions(req.params.id);
    res.json(exam);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.delete('/questions/:id', [param('id').isUUID()], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  try {
    await examService.deleteQuestion(req.params.id);
    res.json({ message: 'Question deleted' });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post(
  '/exams/:id/questions',
  [
    param('id').isUUID(),
    body('questionText').trim().notEmpty(),
    body('imageUrl').optional().isURL(),
    body('type').optional().isIn(['multiple_choice', 'open_text']),
    body('correctAnswerText').optional().isString(),
    body('correctAnswerParts').optional().isArray(),
    body('options').optional().isArray(),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const type = req.body.type || 'multiple_choice';
    const opts = (req.body.options || []) as { text: string; isCorrect: boolean }[];
    if (type === 'multiple_choice') {
      if (opts.length < 2 || opts.length > 6) {
        res.status(400).json({ error: 'Opción múltiple requiere entre 2 y 6 opciones' });
        return;
      }
      const correctCount = opts.filter((o) => o.isCorrect).length;
      if (correctCount !== 1) {
        res.status(400).json({ error: 'Marca exactamente una opción correcta' });
        return;
      }
    }
    try {
      const correctAnswerParts = type === 'open_text' && Array.isArray(req.body.correctAnswerParts)
        ? req.body.correctAnswerParts.map((p: unknown) => String(p ?? '').trim()).filter(Boolean)
        : undefined;
      const question = await examService.addQuestion(req.params.id, {
        questionText: req.body.questionText,
        imageUrl: req.body.imageUrl,
        type,
        correctAnswerText: req.body.correctAnswerText,
        correctAnswerParts: correctAnswerParts?.length ? correctAnswerParts : undefined,
        options: type === 'open_text' ? [] : opts,
      });
      res.status(201).json(question);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  }
);

router.get('/exams', async (req: AuthenticatedRequest, res: Response) => {
  const courseId = req.query.courseId as string | undefined;
  try {
    const { supabaseAdmin } = await import('../config/supabase');
    const { data, error } = await supabaseAdmin
      .from('exams')
      .select('id, title, subject_id, course_id, question_count, passing_score, duration_minutes, max_attempts, exam_kind, created_at')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    let exams = data || [];
    if (courseId) {
      const byCourse = exams.filter((e) => e.course_id === courseId);
      const bySubject = exams.filter((e) => e.subject_id && !e.course_id);
      if (bySubject.length) {
        const { data: subjects } = await supabaseAdmin
          .from('subjects')
          .select('id')
          .eq('course_id', courseId)
          .in('id', bySubject.map((e) => e.subject_id).filter(Boolean) as string[]);
        const subjectIds = new Set((subjects || []).map((s) => s.id));
        exams = [...byCourse, ...bySubject.filter((e) => e.subject_id && subjectIds.has(e.subject_id))];
      } else {
        exams = byCourse;
      }
    }
    res.json(exams);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/exams/:id', [param('id').isUUID()], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  try {
    const exam = await examService.getExam(req.params.id);
    res.json(exam);
  } catch (e) {
    res.status(404).json({ error: (e as Error).message });
  }
});

router.patch(
  '/exams/:id',
  [
    param('id').isUUID(),
    body('title').optional().trim().notEmpty(),
    body('description').optional(),
    body('questionCount').optional().isInt({ min: 1 }),
    body('passingScore').optional().isFloat({ min: 0, max: 100 }),
    body('durationMinutes').optional(),
    body('maxAttempts').optional().isInt({ min: 1 }),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    try {
      const exam = await examService.updateExam(req.params.id, {
        title: req.body.title,
        description: req.body.description,
        questionCount: req.body.questionCount,
        passingScore: req.body.passingScore,
        durationMinutes: req.body.durationMinutes,
        maxAttempts: req.body.maxAttempts,
      });
      res.json(exam);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  }
);

router.get('/exams/:id/availability', [param('id').isUUID()], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  try {
    const list = await examService.listExamAvailability(req.params.id);
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post(
  '/exams/:id/availability',
  [param('id').isUUID(), body('cohortIds').isArray(), body('cohortIds.*').isUUID()],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    try {
      await examService.setExamAvailability(req.params.id, req.body.cohortIds || []);
      res.json({ message: 'Availability updated' });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  }
);

router.post(
  '/exams/:id/grant-attempt',
  [param('id').isUUID(), body('userId').isUUID()],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    try {
      await examService.grantExtraAttempt(req.params.id, req.body.userId, req.user?.id ?? null);
      res.status(201).json({ message: 'Extra attempt granted' });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  }
);

router.delete('/exams/:id', [param('id').isUUID()], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  try {
    await examService.deleteExam(req.params.id);
    res.json({ message: 'Exam deleted' });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/exams/:id/results', [param('id').isUUID()], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  try {
    const results = await examService.getAdminExamResults(req.params.id);
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/attempts/:attemptId/detail', [param('attemptId').isUUID()], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  try {
    const detail = await examService.getAttemptDetailForAdmin(req.params.attemptId);
    res.json(detail);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/users/:id/exam-results', [param('id').isUUID()], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  try {
    const results = await examService.getUserExamResults(req.params.id);
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/users/:id/payments', [param('id').isUUID()], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  try {
    const payments = await paymentService.listPaymentsByUser(req.params.id);
    res.json(payments);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post(
  '/users/:id/payments',
  [
    param('id').isUUID(),
    body('amount').isFloat({ min: 0.01 }),
    body('note').optional().trim().isString(),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    try {
      const payment = await paymentService.addPayment({
        userId: req.params.id,
        amount: Number(req.body.amount),
        note: req.body.note,
        createdBy: req.user?.id ?? null,
      });
      res.status(201).json(payment);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  }
);

// --- Notifications (avisos por curso) ---
router.post(
  '/notifications',
  [
    body('cohortId').isUUID(),
    body('title').trim().notEmpty().isLength({ max: 300 }),
    body('body').trim().notEmpty(),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    if (!req.user?.id) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    try {
      const notification = await notificationService.createNotification({
        cohortId: req.body.cohortId,
        title: req.body.title,
        body: req.body.body,
        createdBy: req.user.id,
      });
      res.status(201).json(notification);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  }
);

router.get('/notifications', async (req: AuthenticatedRequest, res: Response) => {
  const cohortId = req.query.cohortId as string | undefined;
  try {
    const list = await notificationService.listNotificationsForAdmin(cohortId);
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.delete('/notifications/:id', [param('id').isUUID()], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  try {
    await notificationService.deleteNotification(req.params.id);
    res.json({ message: 'Aviso eliminado' });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// --- Asistencia ---
router.get('/attendance', async (req: AuthenticatedRequest, res: Response) => {
  const cohortId = req.query.cohortId as string | undefined;
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  if (!cohortId || !startDate || !endDate) {
    res.status(400).json({ error: 'cohortId, startDate y endDate son requeridos (YYYY-MM-DD)' });
    return;
  }
  try {
    const list = await attendanceService.listAttendanceByCohort(cohortId, startDate, endDate);
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/attendance/student/:userId', [param('userId').isUUID()], async (req: AuthenticatedRequest, res: Response) => {
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  if (!startDate || !endDate) {
    res.status(400).json({ error: 'startDate y endDate son requeridos (YYYY-MM-DD)' });
    return;
  }
  try {
    const records = await attendanceService.getAttendanceRecords(req.params.userId, startDate, endDate);
    res.json(records);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post(
  '/attendance/set',
  [
    body('userId').isUUID(),
    body('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('date must be YYYY-MM-DD'),
    body('status').isIn(['present', 'absent', 'excused']),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    if (!req.user?.id) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    try {
      await attendanceService.setAttendance(req.body.userId, req.body.date, req.body.status, req.user.id);
      res.json({ message: 'Asistencia actualizada' });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  }
);

// --- Instructors ---
router.get('/instructors', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const activeOnly = _req.query.active === 'true';
    const list = await instructorService.listInstructors(activeOnly);
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post(
  '/instructors',
  [
    body('fullName').trim().notEmpty(),
    body('email').optional().trim().isString(),
    body('phone').optional().trim().isString(),
    body('isActive').optional().isBoolean(),
    body('password').optional().isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    try {
      const instructor = await instructorService.createInstructor({
        fullName: req.body.fullName,
        email: req.body.email,
        phone: req.body.phone,
        isActive: req.body.isActive,
        password: req.body.password,
      });
      res.status(201).json(instructor);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  }
);

router.patch(
  '/instructors/:id',
  [
    param('id').isUUID(),
    body('fullName').optional().trim().notEmpty(),
    body('email').optional().trim().isString(),
    body('phone').optional().trim().isString(),
    body('isActive').optional().isBoolean(),
    body('password').optional().isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    try {
      const instructor = await instructorService.updateInstructor(req.params.id, {
        fullName: req.body.fullName,
        email: req.body.email,
        phone: req.body.phone,
        isActive: req.body.isActive,
        password: req.body.password,
      });
      res.json(instructor);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  }
);

router.delete('/instructors/:id', [param('id').isUUID()], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  try {
    await instructorService.deleteInstructor(req.params.id);
    res.json({ message: 'Instructor deleted' });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/instructors/:id/availability', [param('id').isUUID()], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  try {
    const weekStart = req.query.weekStart as string | undefined;
    const weekEnd = req.query.weekEnd as string | undefined;
    if (weekStart && weekEnd) {
      const availability = await scheduleService.getInstructorAvailabilityForWeek(req.params.id, weekStart, weekEnd);
      res.json(availability);
    } else {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(now);
      monday.setDate(now.getDate() + mondayOffset);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const start = monday.toISOString().slice(0, 10);
      const end = sunday.toISOString().slice(0, 10);
      const availability = await scheduleService.getInstructorAvailabilityForWeek(req.params.id, start, end);
      res.json(availability);
    }
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// --- Slots disponibles (por curso + instructor): horarios no ocupados. currentScheduleId = opcional para reasignar (incluye ese slot como disponible)
// Si se envían scheduleType y hoursPerDay, devuelve { slots: { start_time, end_time }[] } con bloques realmente disponibles.
router.get('/available-slots', async (req: AuthenticatedRequest, res: Response) => {
  const cohortId = req.query.cohortId as string | undefined;
  const instructorId = req.query.instructorId as string | undefined;
  const currentScheduleId = req.query.currentScheduleId as string | undefined;
  const practiceStartDate = req.query.practiceStartDate as string | undefined;
  const practiceEndDate = req.query.practiceEndDate as string | undefined;
  const currentUserId = req.query.currentUserId as string | undefined;
  const scheduleType = req.query.scheduleType as 'weekdays' | 'weekends' | undefined;
  const hoursPerDay = req.query.hoursPerDay != null ? Math.min(4, Math.max(1, Number(req.query.hoursPerDay))) : undefined;
  if (!instructorId) {
    res.status(400).json({ error: 'instructorId es requerido' });
    return;
  }
  try {
    if (scheduleType === 'weekdays' || scheduleType === 'weekends') {
      const duration = hoursPerDay ?? 1;
      const slots = await scheduleService.getAvailableStartTimes(
        cohortId,
        instructorId,
        scheduleType,
        duration,
        currentScheduleId || null,
        practiceStartDate || null,
        practiceEndDate || null,
        currentUserId || null
      );
      return res.json({ slots });
    }
    if (!cohortId) {
      res.status(400).json({ error: 'cohortId es requerido cuando no se envía scheduleType' });
      return;
    }
    const slots = await scheduleService.getAvailableSlots(
      cohortId,
      instructorId,
      currentScheduleId || null,
      practiceStartDate || null,
      practiceEndDate || null,
      currentUserId || null
    );
    res.json({ slots });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// --- Disponibilidad del instructor: slots libres y ocupados con nombre del estudiante (para mostrar en horario)
router.get('/instructor-schedule', async (req: AuthenticatedRequest, res: Response) => {
  const cohortId = req.query.cohortId as string | undefined;
  const instructorId = req.query.instructorId as string | undefined;
  const currentScheduleId = req.query.currentScheduleId as string | undefined;
  if (!cohortId || !instructorId) {
    res.status(400).json({ error: 'cohortId e instructorId son requeridos' });
    return;
  }
  try {
    const data = await scheduleService.getInstructorScheduleWithOccupancy(cohortId, instructorId, currentScheduleId || null);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// --- Course schedules (listado y detalle; la creación es al inscribir usuario) ---
router.get('/course-schedules', async (req: AuthenticatedRequest, res: Response) => {
  const cohortId = req.query.cohortId as string | undefined;
  const instructorId = req.query.instructorId as string | undefined;
  try {
    const list = await scheduleService.listCourseSchedules(cohortId, instructorId);
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Bloques de horario con cupos para la pestaña Horarios por curso (inscripción). */
router.get('/schedule-blocks', async (req: AuthenticatedRequest, res: Response) => {
  const cohortId = req.query.cohortId as string | undefined;
  const instructorId = req.query.instructorId as string | undefined;
  try {
    const blocks = await scheduleService.listScheduleBlocksForEnrollment(cohortId, instructorId);
    res.json(blocks);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Horarios agrupados por curso y hora. Si weekStart y weekEnd (YYYY-MM-DD) se envían, cupos = instructores libres en esa semana. */
router.get('/schedule-slots-grouped', async (req: AuthenticatedRequest, res: Response) => {
  const cohortId = req.query.cohortId as string | undefined;
  const instructorId = req.query.instructorId as string | undefined;
  const weekStart = req.query.weekStart as string | undefined;
  const weekEnd = req.query.weekEnd as string | undefined;
  try {
    const slots = await scheduleService.listScheduleSlotsGroupedByTime(cohortId, instructorId, weekStart, weekEnd);
    res.json(slots);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Vista general semanal: todas las horas 06–23 con X/Y cupos, disponibles y ocupados (para Horarios por curso). */
router.get('/schedule-overview', async (req: AuthenticatedRequest, res: Response) => {
  const weekStart = req.query.weekStart as string | undefined;
  const weekEnd = req.query.weekEnd as string | undefined;
  const cohortId = req.query.cohortId as string | undefined;
  const instructorId = req.query.instructorId as string | undefined;
  if (!weekStart || !weekEnd) {
    res.status(400).json({ error: 'weekStart y weekEnd son requeridos (YYYY-MM-DD)' });
    return;
  }
  try {
    const overview = await scheduleService.getScheduleOverviewForWeek(weekStart, weekEnd, cohortId, instructorId);
    res.json(overview);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Calendario semanal agregado: por cada día y hora, instructores con cupo libre u ocupados (inscripciones). */
router.get('/schedule-calendar', async (req: AuthenticatedRequest, res: Response) => {
  const weekStart = req.query.weekStart as string | undefined;
  const weekEnd = req.query.weekEnd as string | undefined;
  const cohortId = req.query.cohortId as string | undefined;
  const instructorId = req.query.instructorId as string | undefined;
  if (!weekStart || !weekEnd) {
    res.status(400).json({ error: 'weekStart y weekEnd son requeridos (YYYY-MM-DD)' });
    return;
  }
  try {
    const calendar = await scheduleService.getAdminScheduleCalendarForWeek(weekStart, weekEnd, cohortId, instructorId);
    res.json(calendar);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post(
  '/practice-bookings',
  [
    body('instructorId').isUUID(),
    body('scheduleType').isIn(['weekdays', 'weekends']),
    body('startTime').matches(/^(0[6-9]|1[0-9]|2[0-3]):00$/),
    body('hoursPerDay').toInt().isInt({ min: 1, max: 4 }),
    body('practiceStartDate').trim().isString().isLength({ min: 10, max: 20 }),
    body('practiceEndDate').trim().isString().isLength({ min: 10, max: 20 }),
    body('participantName').trim().notEmpty().isLength({ max: 150 }),
    body('participantUserId').optional(optionalFalsy).isUUID(),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    try {
      const result = await scheduleService.createPracticeBooking({
        instructorId: String(req.body.instructorId),
        scheduleType: req.body.scheduleType as 'weekdays' | 'weekends',
        startTime: String(req.body.startTime).slice(0, 5),
        hoursPerDay: Number(req.body.hoursPerDay),
        practiceStartDate: String(req.body.practiceStartDate).slice(0, 10),
        practiceEndDate: String(req.body.practiceEndDate).slice(0, 10),
        participantName: String(req.body.participantName || '').trim(),
        participantUserId: req.body.participantUserId ? String(req.body.participantUserId) : null,
      });
      res.status(201).json(result);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  }
);

router.get('/practice-bookings', async (req: AuthenticatedRequest, res: Response) => {
  const weekStart = req.query.weekStart as string | undefined;
  const weekEnd = req.query.weekEnd as string | undefined;
  const instructorId = req.query.instructorId as string | undefined;
  if (!weekStart || !weekEnd) {
    res.status(400).json({ error: 'weekStart y weekEnd son requeridos (YYYY-MM-DD)' });
    return;
  }
  try {
    const list = await scheduleService.listPracticeBookings(weekStart, weekEnd, instructorId);
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.delete('/course-schedules/:id', [param('id').isUUID()], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  try {
    await scheduleService.deleteCourseSchedule(req.params.id);
    res.json({ message: 'Schedule deleted' });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/course-schedules/:id/students', [param('id').isUUID()], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  try {
    const detail = await scheduleService.getScheduleWithStudents(req.params.id);
    res.json(detail);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// --- Caja ---
router.get('/cash/summary', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const book = cashService.parseCashBookQuery(req.query.cashBook) ?? 'escuela';
    if (book === 'all') {
      res.status(400).json({ error: 'cashBook debe ser escuela o dra' });
      return;
    }
    const summary = await cashService.getTodaySummary(book);
    res.json(summary);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/cash/dashboard', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const view = cashService.parseCashBookQuery(req.query.view) ?? 'escuela';
    const dashboard = await cashService.getFinancialDashboard(view);
    res.json(dashboard);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/cash/open-session', async (req: AuthenticatedRequest, res: Response) => {
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const book = cashService.parseCashBookQuery(req.query.cashBook) ?? 'escuela';
  try {
    if (book === 'all') {
      res.status(400).json({ error: 'cashBook debe ser escuela o dra' });
      return;
    }
    const session = await cashService.getOpenSessionForDate(date, book);
    res.json(session);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post(
  '/cash/open',
  [
    body('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('date must be YYYY-MM-DD'),
    body('openingAmount').isFloat({ min: 0 }).withMessage('openingAmount must be >= 0'),
    body('cashBook').optional().isIn(['escuela', 'dra']),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    if (!req.user?.id) {
      res.status(401).json({ error: 'No autenticado' });
      return;
    }
    try {
      const session = await cashService.openSession({
        date: req.body.date,
        openingAmount: Number(req.body.openingAmount),
        openedBy: req.user.id,
        cashBook: req.body.cashBook as 'escuela' | 'dra' | undefined,
      });
      res.status(201).json(session);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  }
);

router.post(
  '/cash/close',
  [body('sessionId').isUUID()],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    if (!req.user?.id) {
      res.status(401).json({ error: 'No autenticado' });
      return;
    }
    try {
      const session = await cashService.closeSession({
        sessionId: req.body.sessionId,
        closedBy: req.user.id,
      });
      res.json(session);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  }
);

router.get('/cash/sessions', async (req: AuthenticatedRequest, res: Response) => {
  const fromDate = req.query.fromDate as string | undefined;
  const toDate = req.query.toDate as string | undefined;
  const status = req.query.status as 'open' | 'closed' | undefined;
  const cashBook = cashService.parseCashBookQuery(req.query.cashBook) ?? 'all';
  const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
  const offset = req.query.offset != null ? Number(req.query.offset) : undefined;
  try {
    const result = await cashService.listSessions({ fromDate, toDate, status, cashBook, limit, offset });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/cash/sessions/:id/close-preview', [param('id').isUUID()], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  try {
    const data = await cashService.getSessionForClose(req.params.id);
    if (!data) {
      res.status(404).json({ error: 'Sesión no encontrada o ya cerrada' });
      return;
    }
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/cash/transactions', async (req: AuthenticatedRequest, res: Response) => {
  const fromDate = req.query.fromDate as string | undefined;
  const toDate = req.query.toDate as string | undefined;
  const type = req.query.type as 'income' | 'expense' | 'internal_transfer' | undefined;
  const sessionId = req.query.sessionId as string | undefined;
  const cashBook = cashService.parseCashBookQuery(req.query.cashBook) ?? 'all';
  const search = req.query.search as string | undefined;
  const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
  const offset = req.query.offset != null ? Number(req.query.offset) : undefined;
  try {
    const result = await cashService.listTransactions({
      fromDate,
      toDate,
      type,
      sessionId,
      cashBook,
      search,
      limit,
      offset,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/cash/sessions/:id/transactions', [param('id').isUUID()], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  try {
    const transactions = await cashService.listTransactionsBySession(req.params.id);
    res.json(transactions);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post(
  '/cash/income',
  [
    body('sessionId').isUUID(),
    body('concept').trim().notEmpty(),
    body('incomeType').isIn(cashService.INCOME_TYPES),
    body('amount').isFloat({ min: 0.01 }),
    body('paymentMethod').isIn(['efectivo', 'transferencia', 'tarjeta']),
    body('fundsDestination').optional().isIn([...cashService.FUNDS_DESTINATIONS]),
    body('transferBank').optional().isIn([...cashService.TRANSFER_BANK_IDS]),
    body('notes').optional().trim().isString(),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    try {
      const tx = await cashService.addIncome({
        sessionId: req.body.sessionId,
        concept: req.body.concept,
        incomeType: req.body.incomeType,
        amount: Number(req.body.amount),
        paymentMethod: req.body.paymentMethod,
        fundsDestination: req.body.fundsDestination,
        transferBank: cashService.parseTransferBankId(req.body.transferBank),
        notes: req.body.notes,
        createdBy: req.user?.id ?? null,
      });
      res.status(201).json(tx);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  }
);

router.post(
  '/cash/expense',
  [
    body('sessionId').isUUID(),
    body('concept').trim().notEmpty(),
    body('category').isIn(cashService.EXPENSE_CATEGORIES),
    body('amount').isFloat({ min: 0.01 }),
    body('paymentMethod').isIn(['efectivo', 'transferencia', 'tarjeta']),
    body('fundsDestination').optional().isIn([...cashService.FUNDS_DESTINATIONS]),
    body('transferBank').optional().isIn([...cashService.TRANSFER_BANK_IDS]),
    body('notes').optional().trim().isString(),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    try {
      const tx = await cashService.addExpense({
        sessionId: req.body.sessionId,
        concept: req.body.concept,
        category: req.body.category,
        amount: Number(req.body.amount),
        paymentMethod: req.body.paymentMethod,
        fundsDestination: req.body.fundsDestination,
        transferBank: cashService.parseTransferBankId(req.body.transferBank),
        notes: req.body.notes,
        createdBy: req.user?.id ?? null,
      });
      res.status(201).json(tx);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  }
);

router.post(
  '/cash/internal-transfer',
  [
    body('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('date YYYY-MM-DD'),
    body('fromBook').isIn(['escuela', 'dra']),
    body('toBook').isIn(['escuela', 'dra']),
    body('channel').isIn([...cashService.INTERNAL_TRANSFER_CHANNELS]),
    body('amount').isFloat({ min: 0.01 }),
    body('concept').trim().notEmpty(),
    body('transferBank').optional().isIn([...cashService.TRANSFER_BANK_IDS]),
    body('notes').optional().trim().isString(),
    body().custom((_value, { req }) => {
      const body = req.body as { channel?: string; transferBank?: string };
      if (body.channel === 'deposito') {
        const bank = cashService.parseTransferBankId(body.transferBank);
        if (!bank) {
          throw new Error('Para depósito debe indicar el banco de acreditación (libro destino)');
        }
      }
      return true;
    }),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    try {
      const tx = await cashService.addInternalTransfer({
        date: req.body.date,
        fromBook: req.body.fromBook,
        toBook: req.body.toBook,
        channel: req.body.channel,
        amount: Number(req.body.amount),
        concept: req.body.concept,
        transferBank: cashService.parseTransferBankId(req.body.transferBank),
        notes: req.body.notes,
        createdBy: req.user?.id ?? null,
      });
      res.status(201).json(tx);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  }
);

router.delete(
  '/cash/transactions/:id',
  [param('id').isUUID()],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId es requerido (query)' });
      return;
    }
    try {
      await cashService.deleteTransaction(req.params.id, sessionId);
      res.json({ message: 'Movimiento eliminado' });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  }
);

router.patch(
  '/cash/transactions/:id',
  [
    param('id').isUUID(),
    body('concept').optional().trim().isString(),
    body('category').optional().isIn(cashService.EXPENSE_CATEGORIES),
    body('income_type').optional().isIn(cashService.INCOME_TYPES),
    body('amount').optional().isFloat({ min: 0.01 }),
    body('payment_method').optional().isIn(['efectivo', 'transferencia', 'tarjeta']),
    body('funds_destination').optional().isIn([...cashService.FUNDS_DESTINATIONS]),
    body('notes').optional().trim().isString(),
    body('adminCode').optional().trim().isString(),
    body('reason').optional().trim().isString(),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }
    try {
      const payload: Parameters<typeof cashService.updateTransaction>[1] = {};
      if (req.body.concept !== undefined) payload.concept = req.body.concept;
      if (req.body.category !== undefined) payload.category = req.body.category;
      if (req.body.income_type !== undefined) payload.income_type = req.body.income_type;
      if (req.body.amount !== undefined) payload.amount = Number(req.body.amount);
      if (req.body.payment_method !== undefined) payload.payment_method = req.body.payment_method;
      if (req.body.funds_destination !== undefined) payload.funds_destination = req.body.funds_destination;
      if (req.body.notes !== undefined) payload.notes = req.body.notes;
      const options =
        req.body.adminCode != null || req.body.reason != null
          ? { adminCode: req.body.adminCode as string | undefined, reason: req.body.reason as string | undefined }
          : undefined;
      const updated = await cashService.updateTransaction(req.params.id, payload, userId, options);
      res.json(updated);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  }
);

router.post(
  '/cash/transactions/:id/anulate',
  [
    param('id').isUUID(),
    body('adminCode').optional().trim().isString(),
    body('reason').optional().trim().isString(),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }
    try {
      const options =
        req.body.adminCode != null || req.body.reason != null
          ? { adminCode: req.body.adminCode as string | undefined, reason: req.body.reason as string | undefined }
          : undefined;
      const updated = await cashService.anulateTransaction(req.params.id, userId, options);
      res.json(updated);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  }
);

router.get('/cash/report', async (req: AuthenticatedRequest, res: Response) => {
  const from = req.query.from as string;
  const to = req.query.to as string;
  const combined = req.query.combined === '1' || req.query.combined === 'true';
  const book = cashService.parseCashBookQuery(req.query.cashBook) ?? 'escuela';
  if (!from || !to) {
    res.status(400).json({ error: 'Parámetros from y to (YYYY-MM-DD) son requeridos' });
    return;
  }
  try {
    if (combined) {
      const report = await cashService.getReportCombinedSummary(from, to);
      res.json(report);
      return;
    }
    if (book === 'all') {
      res.status(400).json({ error: 'cashBook debe ser escuela o dra' });
      return;
    }
    const report = await cashService.getReportByPeriod(from, to, book);
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/cash/report/export', async (req: AuthenticatedRequest, res: Response) => {
  const from = req.query.from as string;
  const to = req.query.to as string;
  const format = ((req.query.format as string) || 'xlsx').toLowerCase();
  const reportType = (req.query.reportType as string) || 'Personalizado';
  const combined = req.query.combined === '1' || req.query.combined === 'true';
  const book = cashService.parseCashBookQuery(req.query.cashBook) ?? 'escuela';
  if (!from || !to) {
    res.status(400).json({ error: 'Parámetros from y to (YYYY-MM-DD) son requeridos' });
    return;
  }
  try {
    const generatedAt = new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'short', timeStyle: 'medium' });
    const generatedBy = (req as AuthenticatedRequest).user?.fullName ?? (req as AuthenticatedRequest).user?.email ?? 'Sistema';

    if (combined) {
      const data = await cashService.getReportDataForExportCombined(from, to);
      const hasAny =
        data.escuela.transactions.length +
          data.dra.transactions.length +
          data.escuela.internalTransfers.length +
          data.dra.internalTransfers.length +
          data.allInternalTransfers.length >
        0;
      if (!hasAny) {
        res.status(400).json({ error: 'No hay datos para exportar en el rango seleccionado' });
        return;
      }
      const slug = 'completo';
      if (format === 'pdf') {
        const buffer = await cashService.buildCashReportPdfCombined(data, reportType, generatedAt, generatedBy);
        res.setHeader('Content-Type', 'application/pdf');
        const pdfFilename =
          from === to ? `reporte_caja_${slug}_${from}.pdf` : `reporte_caja_${slug}_${from}_a_${to}.pdf`;
        res.setHeader('Content-Disposition', `attachment; filename="${pdfFilename}"`);
        res.send(buffer);
        return;
      }
      if (format === 'xlsx') {
        const buffer = await cashService.buildCashReportExcelCombined(data, reportType, generatedAt, generatedBy);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        const filename =
          from === to ? `reporte_caja_${slug}_${from}.xlsx` : `reporte_caja_${slug}_${from}_a_${to}.xlsx`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
        return;
      }
      res.status(400).json({ error: 'Formato no soportado. Use format=xlsx o format=pdf' });
      return;
    }

    if (book === 'all') {
      res.status(400).json({ error: 'cashBook debe ser escuela o dra' });
      return;
    }
    const data = await cashService.getReportDataForExport(from, to, book);
    if (data.transactions.length === 0 && data.internalTransfers.length === 0) {
      res.status(400).json({ error: 'No hay datos para exportar en el rango seleccionado' });
      return;
    }
    const bookSlug = book === 'dra' ? 'dra' : 'escuela';

    if (format === 'pdf') {
      const buffer = await cashService.buildCashReportPdf(data, reportType, generatedAt, generatedBy);
      res.setHeader('Content-Type', 'application/pdf');
      const pdfFilename =
        from === to ? `reporte_caja_${bookSlug}_${from}.pdf` : `reporte_caja_${bookSlug}_${from}_a_${to}.pdf`;
      res.setHeader('Content-Disposition', `attachment; filename="${pdfFilename}"`);
      res.send(buffer);
      return;
    }

    if (format === 'xlsx') {
      const buffer = await cashService.buildCashReportExcelFull(data, reportType, generatedAt, generatedBy);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      const filename =
        from === to ? `reporte_caja_${bookSlug}_${from}.xlsx` : `reporte_caja_${bookSlug}_${from}_a_${to}.xlsx`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
      return;
    }

    res.status(400).json({ error: 'Formato no soportado. Use format=xlsx o format=pdf' });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/cash/constants', async (_req: AuthenticatedRequest, res: Response) => {
  res.json({
    incomeTypes: cashService.INCOME_TYPES,
    expenseCategories: cashService.EXPENSE_CATEGORIES,
    paymentMethods: ['efectivo', 'transferencia', 'tarjeta'] as const,
    cashBooks: ['escuela', 'dra'] as const,
    fundsDestinations: cashService.FUNDS_DESTINATIONS,
    fundsDestinationLabels: cashService.FUNDS_DESTINATION_LABELS,
    transferBanks: cashService.TRANSFER_BANK_IDS.map((id) => ({
      id,
      label: cashService.TRANSFER_BANK_LABELS[id],
    })),
    internalTransferChannels: cashService.INTERNAL_TRANSFER_CHANNELS,
  });
});

// --- Descargas: reporte curso (ZIP con 2 CSVs + 1 Excel formato CURSO INTENSIVO con 3 hojas) ---
router.get('/downloads/curso', async (req: AuthenticatedRequest, res: Response) => {
  const cohortId = req.query.cohortId as string | undefined;
  if (!cohortId) {
    res.status(400).json({ error: 'cohortId es requerido' });
    return;
  }
  try {
    const data = await downloadsService.getCourseExportData(cohortId);
    const csvCompraPermisos = downloadsService.buildCsvCompraPermisos(data);
    const csvLegalizacion = downloadsService.buildCsvLegalizacionPermisos(data);
    const xlsxCursoIntensivo = await downloadsService.buildXlsxCursoIntensivo(data);

    const suffix = downloadsService.getCourseFileSuffix(data.cohort.code);
    const zipName = `Reporte_curso_${suffix}_${new Date().toISOString().slice(0, 10)}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err: Error) => {
      res.status(500).end(String(err?.message ?? err));
    });
    archive.pipe(res);

    archive.append(Buffer.from(csvCompraPermisos, 'utf8'), { name: `Compra_Permisos_${suffix}.csv` });
    archive.append(Buffer.from(csvLegalizacion, 'utf8'), { name: `Legalizacion_Permisos_${suffix}.csv` });
    archive.append(xlsxCursoIntensivo, { name: `CURSO_INTENSIVO_${suffix}.xlsx` });

    await archive.finalize();
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
