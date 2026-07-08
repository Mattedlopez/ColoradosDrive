# Migraciones de base de datos

Estas migraciones deben ejecutarse **en el SQL Editor de Supabase** (Dashboard → SQL Editor) en orden, si tu proyecto no partió del `schema.sql` completo.

## Orden recomendado

1. `009_instructors_and_schedules.sql` — instructores y horarios por curso  
2. `010_course_price_and_payments.sql` — precio por tipo de curso, total/abonado por alumno y tabla de pagos  
3. `011_student_extra_fields.sql` — fecha nacimiento, dirección, teléfono, fechas inicio/fin, modalidad (inscripción y reportes)  
4. `012_attendance.sql` — tabla de asistencia (días presente/ausente/justificado por estudiante)  
5. `013_instructor_delete_set_null.sql` — al eliminar un instructor, los horarios (course_schedules) quedan sin asignar en lugar de bloquear el delete  
6. `014_schedule_groups_and_practice_weeks.sql` — horarios semanales (Lunes a Viernes / Fines de semana), duración de práctica (1–3 semanas) y cambios por día o resto del curso. Crea: schedule_groups, course_schedules.schedule_group_id, user_profiles.practice_weeks, user_schedule_day_override.
7. `015_practice_start_end_dates.sql` — fechas de práctica por estudiante.
8. `016_user_gender.sql` — género en user_profiles.
9. `017_instructor_login.sql` — login para instructores.
10. `018_cohort_start_end_dates.sql` — fechas de inicio y término del curso a nivel de número de curso (cohort); al inscribir un estudiante se copian a su perfil.
11. `019_exam_training_definitive_extra_attempts.sql` — exam_kind (training/definitive), exam_availability (habilitar definitivo por cohort), exam_extra_attempts (otorgar intento extra a un estudiante).
12. `020_exam_attempt_is_definitive.sql` — is_definitive en exam_attempts: mismo examen para práctica y definitivo; cada intento se marca como práctica o definitivo.
13. `021_cash_sessions_and_transactions.sql` — módulo Caja: sesiones diarias (apertura/cierre) y movimientos (ingresos/egresos).
14. `022_cash_anulado_and_audit.sql` — anulación de movimientos (soft delete) y tabla de auditoría para ediciones/anulaciones con código de administrador. Opcional: variable de entorno `CASH_ADMIN_CODE` (por defecto 3651).
15. `025_enrollment_discount.sql` — descuentos en inscripción: precio original, descuento aplicado y total final en `user_profiles`; opcional `discount_applied` en `payments` para el pago inicial.
16. `026_cash_dual_book_internal_transfer.sql` — caja dual **Escuela / DRA**: sesiones por `(fecha, libro)`, destino de fondos en movimientos, tipo `internal_transfer` (no cuenta como ingreso/egreso operativo; detalle y ajuste de balance por libro).
17. `028_keycloak_identity.sql` — **migración a Keycloak (control de identidades)**: agrega `user_profiles.keycloak_sub` (UUID único) + índice, índice único por `lower(email)`, suelta la FK `user_profiles.id → auth.users(id)` y re-apunta todas las demás FKs que referencian `auth.users(id)` hacia `public.user_profiles(id)` preservando el `ON DELETE`. **Antes de ejecutarla, correr `028_precheck.sql`** (solo lectura: lista huérfanos por FK y emails duplicados por `lower(email)`; ambos deben resolverse o la 028 hará rollback).

## Cómo aplicar la migración 010 (precio y pagos)

Si ves errores como **"Could not find the 'price' column of 'courses' in the schema cache"** o **"column courses_1.price does not exist"**:

1. Entra en tu proyecto en [Supabase](https://supabase.com/dashboard) → **SQL Editor**.
2. Crea una nueva query y pega el contenido de `010_course_price_and_payments.sql`.
3. Ejecuta la query (Run).
4. Opcional: en **Settings → API** puedes forzar la actualización del schema cache si los cambios no se reflejan de inmediato.

Tras ejecutar la 010, la API usará la columna `price` en cursos y las de pagos en `user_profiles` y `payments` con normalidad.
