# CLAUDE.md — Erick Mateo Granda Delgado

> Este archivo es leído automáticamente por Claude Code al inicio de
> cada sesión. Define quién soy, cómo trabajo y qué espero de ti.

---

## Quién soy

- **Nombre:** Erick Mateo Granda Delgado
- **Rol:** Estudiante de Ingeniería de Software (FICA — Ecuador),
  a punto de graduarme
- **Nivel:** Junior-Mid developer con experiencia real en proyectos
  de cliente y académicos
- **Ubicación:** Ecuador (zona horaria ECT, UTC-5)
- **Objetivo actual:** Graduarme, entregar el capstone con calidad
  profesional, y conseguir mi primer trabajo como dev

---

## Mis proyectos activos

### 🚗 Colorados Drive (PRIORIDAD ALTA — Cliente real)
- Plataforma web centralizada para escuela de conducción
- Santo Domingo, Ecuador
- **Repo:** https://github.com/ErickG11/ProyectoCapstoneCD.git
- **Stack:** Next.js + TypeScript (frontend), Node.js + Express +
  TypeScript (backend), Supabase (PostgreSQL + Auth)
- **Control de acceso:** RBAC via middleware
- **Socio:** Johao David Gavilánes Farías
- **Reglas especiales:**
  - Cualquier cambio en BD o auth → PEDIR CONFIRMACIÓN primero
  - No tocar archivos de configuración de Supabase sin avisarme
  - No hacer push a ninguna rama sin mi orden explícita

### 🎓 Proyectos universitarios (FICA)
- **Cursos activos:** Validación & Verificación de Software,
  Desarrollo Seguro, IA/ML, Inglés B2, Gestión de Proyectos
- **Regla:** Si no sabes el formato exacto que pide el curso,
  pregúntame antes de generar cualquier documento o entrega

---

## Cómo quiero que trabajes conmigo

### Antes de hacer cualquier cosa
1. **Lee la estructura del proyecto completa** antes de tocar archivos
2. **Identifica los problemas** y dime qué encontraste
3. **Propón el plan** y espera mi aprobación si el cambio es grande
4. **Trabaja módulo por módulo** — nunca cambies todo a la vez

### Cuando tengas dudas
- **Para inmediatamente**
- Explícame qué parte no está clara
- Muéstrame las opciones posibles con pros y contras
- Pregúntame cuál es el comportamiento esperado
- **Nunca inventes lógica de negocio** — eso lo defino yo

### Al terminar cada tarea
- Dame un resumen de qué hiciste y por qué
- Dime si encontraste algo que debería mejorar
- Pregúntame si continuar con lo siguiente

---

## Estándares de código que siempre aplicas

### TypeScript
```typescript
// ✅ Correcto
const getUserById = async (id: string): Promise<User | null> => { }

// ❌ Nunca
const getUser = async (id: any) => { }
```

- **Nunca uses `any`** — tipea absolutamente todo
- Tipos en inglés, comentarios en español si son necesarios
- Nombres descriptivos: `getUserByEmail` no `getUser2`

### Arquitectura (Clean Architecture)
```
src/
├── domain/          # entities, interfaces, tipos de dominio
├── application/     # use cases, servicios de aplicación
├── infrastructure/  # Supabase, APIs externas, repositorios
├── interfaces/      # controllers, routes, middlewares, DTOs
└── shared/          # utils, constants, errores, helpers
```

### API responses (siempre este formato)
```typescript
// Éxito
{ success: true, data: {...}, message: "string" }

// Error
{ success: false, error: "string", message: "string" }
```

### Manejo de errores
- Clase centralizada `AppError` para todos los errores
- Nunca uses `console.log` en producción — usa un logger
- Siempre maneja los casos de error en async/await con try/catch

### Seguridad (siempre aplicar)
- **Nunca hardcodear** secrets, URLs, tokens — siempre `process.env`
- Validar todos los inputs con Zod antes de procesarlos
- Passwords siempre con bcrypt (costo mínimo 12)
- Headers de seguridad con Helmet.js
- Rate limiting en todos los endpoints públicos

---

## Skills disponibles — cuándo usarlas

Tengo las siguientes skills instaladas. Úsalas automáticamente
cuando la tarea corresponda:

| Skill | Cuándo usarla |
|---|---|
| `project-kickoff` | Inicio de proyecto nuevo, charter, alcance |
| `requirements-engineering` | Levantar o documentar requisitos, SRS |
| `user-stories` | Crear historias de usuario, backlog, criterios |
| `use-cases` | Modelar casos de uso, diagramas de actores |
| `system-diagrams` | Cualquier diagrama: C4, clases, secuencia, ERD |
| `database-design` | Diseño de BD, esquemas, migraciones, SQL |
| `clean-architecture` | Estructurar código, capas, patrones |
| `api-design` | Diseñar o documentar endpoints REST |
| `security-implementation` | Seguridad, OWASP, auth, validaciones |
| `testing-strategy` | Crear tests, estrategia de testing, coverage |
| `git-workflow` | Git Flow, commits, PRs, hooks |
| `ci-cd-pipeline` | GitHub Actions, Docker, despliegue |
| `documentation` | README, Swagger, JSDoc, wikis |
| `code-review` | Revisar código, checklist de calidad |
| `project-management` | Scrum, sprints, gestión de tareas |
| `skill-creator` | Crear o mejorar skills nuevas |
| `docx` | Generar documentos Word (.docx) |
| `pdf` | Leer o crear archivos PDF |
| `pptx` | Presentaciones PowerPoint |
| `xlsx` | Hojas de cálculo Excel |
| `frontend-design` | UI/UX, componentes, diseño visual |
| `debugging-strategy` | Encontrar y resolver bugs |
| `resume-builder` | CV técnico, portafolio |
| `technical-interview` | Prep de entrevistas técnicas |

---

## Lo que NUNCA haces sin mi confirmación explícita

```
❌ Eliminar archivos o carpetas
❌ Modificar esquema de base de datos (tablas, columnas, políticas RLS)
❌ Cambiar lógica de autenticación o autorización
❌ Hacer git push, merge o rebase a cualquier rama
❌ Instalar dependencias nuevas (npm install <paquete>)
❌ Cambiar o crear variables de entorno (.env)
❌ Modificar configuración de Supabase
❌ Cambiar archivos de configuración del proyecto
   (next.config.js, tsconfig.json, package.json scripts)
❌ Deployar a cualquier ambiente
❌ Ejecutar scripts destructivos o migraciones de BD
```

---

## Mis preferencias de output

- **Código listo para usar** — no solo sugerencias o pseudocódigo
- **Directo y conciso** — sin relleno ni explicaciones obvias
- **Si hay varias opciones** → muéstrame pros/contras antes de implementar
- **Calidad sobre velocidad** — prefiero que me preguntes a que rompas algo
- **Un módulo a la vez** — no generes 10 archivos de golpe sin mi ok
- **Idioma del código:** inglés / **Idioma de comunicación:** español

---

## Patrones y principios que siempre aplicas

### SOLID
- **S** — Una clase, una responsabilidad
- **O** — Extender sin modificar
- **L** — Subclases sustituibles por su padre
- **I** — Interfaces específicas y pequeñas
- **D** — Depender de abstracciones, no implementaciones

### Otros principios
- **DRY** — No repitas lógica, extráela
- **KISS** — La solución más simple que funcione
- **YAGNI** — No agregues lo que no se necesita ahora

### Patrones de diseño prioritarios en mi stack
- **Repository Pattern** — para todo acceso a Supabase
- **Strategy** — para lógica de roles y RBAC
- **Factory** — para creación de objetos complejos
- **Observer** — para eventos y notificaciones

---

## Git workflow que sigo

```
main        → producción (protegida)
develop     → integración
feature/*   → nuevas funcionalidades
hotfix/*    → correcciones urgentes
```

### Formato de commits (Conventional Commits)
```
feat: agregar autenticación con JWT
fix: corregir validación de email en registro
chore: actualizar dependencias
docs: agregar documentación de endpoints
refactor: extraer lógica de auth a servicio separado
test: agregar unit tests al servicio de usuarios
```

---

## Contexto académico

Cuando trabajamos en entregas universitarias:
- Pregúntame el curso y la rúbrica antes de generar documentos
- El formato suele ser en español y con normas APA o IEEE
- Los reportes técnicos deben sonar como escritos por un estudiante,
  no como generados por IA — lenguaje natural y directo
- Si generas código para tareas académicas, incluye comentarios
  explicativos en español

---

## Cómo iniciar cada sesión de trabajo

Cuando abro Claude Code en un proyecto, haz esto:

1. Lee este CLAUDE.md
2. Lista la estructura actual del proyecto
3. Pregúntame: **"¿En qué trabajamos hoy?"**
4. Espera mi respuesta antes de hacer cualquier cosa

---

*Última actualización: Junio 2026*
*Versión: 1.0*