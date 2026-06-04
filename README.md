# Colorados Drive — Plataforma de Escuela de Conducción

Plataforma web completa para la gestión de la escuela de conducción **Colorados Drive** en Santo Domingo, Ecuador.

Incluye panel de administración, portal de estudiantes, portal de instructores, módulo de exámenes, control de asistencia, caja y reportes.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 |
| Backend | Node.js 20 · Express 4 · TypeScript |
| Base de datos | Supabase (PostgreSQL + Auth + RLS) |
| Autenticación | Supabase Auth (JWT) |
| Animaciones | Framer Motion |
| Gráficas | Recharts |
| Exportes | PDFKit · ExcelJS · Archiver |

---

## Requisitos

- **Node.js** 20 o superior
- **npm** 9+
- Cuenta en [Supabase](https://supabase.com) (plan Free es suficiente)

---

## Instalación y desarrollo local

Necesitas **dos terminales** abiertas en paralelo.

### 1 — Clonar el repositorio

```bash
git clone https://github.com/tu-usuario/colorados-drive-platform.git
cd colorados-drive-platform
```

### 2 — Configurar la base de datos (Supabase)

1. Crea un proyecto nuevo en [supabase.com/dashboard](https://supabase.com/dashboard).
2. Ve a **SQL Editor** y ejecuta `backend/src/db/schema.sql` para crear todas las tablas.
3. En **Settings › API** copia:
   - Project URL
   - `anon` public key
   - `service_role` key
4. En **Settings › API › JWT Settings** copia el **JWT Secret**.

### 3 — Backend

```bash
cd backend
npm install
cp .env.example .env      # edita con tus valores de Supabase
npm run dev               # → http://localhost:3001
```

Deberías ver: `Colorados Drive API running on port 3001`

Carga el seed inicial de cursos (solo la primera vez):

```bash
npm run db:seed
```

### 4 — Frontend

```bash
cd frontend
npm install
cp env.example .env.local  # edita NEXT_PUBLIC_API_URL=http://localhost:3001
npm run dev                # → http://localhost:3000
```

---

## Variables de entorno

### Backend — `backend/.env`

```env
PORT=3001
NODE_ENV=development

SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu-anon-key
SUPABASE_SERVICE_KEY=tu-service-role-key
SUPABASE_JWT_SECRET=tu-jwt-secret

JWT_SECRET=tu-jwt-secret          # mismo valor que SUPABASE_JWT_SECRET
CORS_ORIGIN=http://localhost:3000  # en producción: URL pública del frontend
```

### Frontend — `frontend/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

En producción (Vercel) reemplaza con la URL pública del backend.

---

## Estructura del proyecto

```
colorados-drive-platform/
├── .github/
│   └── workflows/
│       └── ci.yml              ← GitHub Actions: type-check + tests en cada PR
├── backend/
│   └── src/
│       ├── config/             ← config.ts (env), supabase.ts (clientes)
│       ├── db/                 ← schema.sql, seed.ts, migrations/
│       ├── middleware/
│       │   ├── auth.ts         ← verifica JWT con Supabase Admin API
│       │   ├── rbac.ts         ← requireRole() — Strategy Pattern
│       │   └── validate.ts     ← handleValidation — middleware DRY
│       ├── repositories/
│       │   ├── interfaces/
│       │   │   └── IUserRepository.ts   ← contrato (DIP)
│       │   └── SupabaseUserRepository.ts
│       ├── routers/
│       │   ├── authRouter.ts
│       │   ├── adminRouter.ts
│       │   ├── studentRouter.ts
│       │   └── instructorRouter.ts
│       ├── services/
│       │   ├── authService.ts   ← login, tokens (SRP: solo auth)
│       │   ├── userService.ts   ← createUser, updateUserProfile, deleteUser
│       │   ├── adminService.ts
│       │   ├── examService.ts
│       │   ├── scheduleService.ts
│       │   ├── paymentService.ts
│       │   ├── attendanceService.ts
│       │   ├── cashService.ts
│       │   ├── notificationService.ts
│       │   ├── reportService.ts
│       │   ├── downloadsService.ts
│       │   ├── activityService.ts
│       │   └── uploadService.ts
│       ├── types/
│       │   └── index.ts         ← AuthUser, AuthenticatedRequest, UserRole
│       └── __tests__/
│           └── userService.test.ts
├── frontend/
│   └── src/
│       ├── app/                 ← Next.js App Router (admin/, student/, instructor/)
│       ├── components/
│       ├── contexts/            ← AuthContext.tsx
│       └── lib/                 ← api.ts, env.ts, theme.ts
└── docs/
    ├── ARCHITECTURE.md
    └── DEPLOYMENT.md
```

---

## Crear el primer usuario admin

En Supabase **SQL Editor**:

```sql
-- Primero crea el usuario en Authentication > Users (o usa Admin API)
-- Luego inserta su perfil:
INSERT INTO user_profiles (id, email, full_name, role)
VALUES (
  'UUID-copiado-de-auth-users',
  'admin@coloradosdrive.com',
  'Administrador',
  'admin'
);
```

---

## Roles

| Rol | Acceso |
|-----|--------|
| `admin` | Panel completo: usuarios, cursos, exámenes, caja, reportes |
| `student` | Portal propio: materias, exámenes, progreso, notificaciones |
| `instructor` | Solo su cuadro semanal y lista de alumnos por slot |

---

## API — Endpoints principales

### Auth

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/login` | Login (email + password) |
| GET | `/api/auth/me` | Usuario actual (Bearer token) |

### Admin `[requiere rol admin]`

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/admin/users` | Crear usuario (admin o estudiante) |
| GET | `/api/admin/users` | Listar usuarios (filtros: courseId, cohortId, role, search) |
| PATCH | `/api/admin/users/:id` | Actualizar perfil / contraseña |
| DELETE | `/api/admin/users/:id` | Eliminar usuario |
| GET | `/api/admin/courses` | Listar cursos |
| GET/POST | `/api/admin/subjects` | Materias |
| GET/POST | `/api/admin/contents` | Contenido por materia |
| GET/POST | `/api/admin/exams` | Exámenes |
| GET/POST | `/api/admin/exams/:id/questions` | Preguntas de examen |
| GET | `/api/admin/attendance` | Asistencia por cohorte |
| POST | `/api/admin/notifications` | Enviar notificación |
| GET/POST | `/api/admin/caja/*` | Caja: sesiones y movimientos |
| GET | `/api/admin/downloads/*` | Exportar PDF/Excel |

### Student `[requiere rol student]`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/student/course` | Mi curso asignado |
| GET | `/api/student/subjects` | Materias del curso |
| GET | `/api/student/subjects/:id/contents` | Contenido de una materia |
| GET | `/api/student/exams` | Exámenes disponibles |
| POST | `/api/student/exams/:id/attempt` | Iniciar/enviar examen |
| GET | `/api/student/progress` | Progreso general |
| POST | `/api/student/activity` | Registrar actividad |
| GET | `/api/student/notifications` | Notificaciones |

### Instructor `[requiere rol instructor]`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/instructor/schedule` | Cuadro semanal |
| GET | `/api/instructor/schedule/:id/students` | Alumnos por slot |

### Health

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Health check (keep-alive cron) |

---

## Tests

```bash
cd backend

# Correr todos los tests
npm test

# Modo watch (desarrollo)
npm run test:watch

# Con cobertura
npm run test:coverage
```

Los tests unitarios mockean `IUserRepository` y `supabaseAdmin` — no requieren conexión a Supabase.

Para agregar tests de integración, declara `SUPABASE_URL` y `SUPABASE_SERVICE_KEY` como variables de entorno (o GitHub Secrets) y usa la DB de staging.

**Módulos prioritarios para cubrir:**

| Módulo | Tipo de test | Razón |
|--------|-------------|-------|
| `userService` | Unit | Lógica crítica: creación, eliminación, cambio de horario |
| `examService` | Unit | Algoritmo de corrección open-text (Levenshtein) |
| `authService` | Unit | Login y manejo de sesiones |
| `cashService` | Unit | Lógica de caja dual-book |
| `adminRouter` | Integration | Validación de inputs + respuestas HTTP |

---

## Despliegue

Recomendado: **Vercel (frontend) + Railway (backend) + Supabase (DB)**

Ver guía completa en [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

**Resumen rápido:**

1. Sube el código a GitHub.
2. Conecta **Vercel** al directorio `frontend/`. Agrega `NEXT_PUBLIC_API_URL`.
3. Conecta **Railway** al directorio `backend/`. Agrega todas las variables `SUPABASE_*`, `JWT_SECRET` y `CORS_ORIGIN` (URL de Vercel).
4. Configura un cron externo ([cron-job.org](https://cron-job.org)) que llame a `GET /health` cada 10 min para prevenir hibernación.

---

## Git & Ramas

### Estrategia (Git Flow simplificado)

```
main        ← producción, siempre estable
develop     ← integración continua
feature/*   ← nuevas funcionalidades (desde develop)
fix/*       ← correcciones (desde develop o main si es hotfix)
```

### Convención de commits (Conventional Commits)

```
feat(auth):     nueva funcionalidad de autenticación
fix(exams):     corrección en calificación de examen
refactor(users): extrae userService de authService
test(userService): agrega tests de deleteUser
docs(readme):   actualiza variables de entorno
chore(deps):    actualiza express-validator
```

---

## Licencia

MIT
