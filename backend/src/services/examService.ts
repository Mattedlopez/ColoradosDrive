import { supabaseAdmin } from '../config/supabase';
import { notifyExamPassed } from './certificationService';

export interface CreateExamParams {
  subjectId?: string;
  courseId?: string;
  title: string;
  description?: string;
  questionCount: number;
  passingScore?: number;
  /** Tiempo límite en minutos; null = sin límite */
  durationMinutes?: number | null;
  /** Número máximo de intentos por usuario (default 1) */
  maxAttempts?: number;
  /** training = práctica siempre visible; definitive = habilitado por cohort */
  examKind?: 'training' | 'definitive';
}

export type QuestionType = 'multiple_choice' | 'open_text';

export interface CreateQuestionParams {
  questionText: string;
  imageUrl?: string;
  type?: QuestionType;
  correctAnswerText?: string;
  /** Para respuesta abierta con varias partes (a, b, c, d): respuestas modelo por parte, cada string puede tener varias líneas (alternativas). */
  correctAnswerParts?: string[];
  options: { text: string; isCorrect: boolean }[];
}

/** Quita tildes y diacríticos para comparar sin importar acentos (incl. ñ → n) */
function stripAccents(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ñ/g, 'n')
    .replace(/Ñ/g, 'N');
}

/** Distancia de Levenshtein (respuestas cortas) */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] =
        a[i - 1] === b[j - 1]
          ? prev
          : 1 + Math.min(prev, row[j - 1], row[j]);
      prev = cur;
    }
  }
  return row[b.length];
}

/**
 * Palabras equivalentes en contexto de exámenes (p. ej. ciclos de motor).
 * Claves y valores sin tildes, minúsculas.
 */
const OPEN_TEXT_SYNONYM_GROUPS: string[][] = [
  ['explosion', 'combustion'],
  ['compresion', 'comprension'],
];

function synonymEquivalent(a: string, b: string): boolean {
  if (a === b) return true;
  for (const g of OPEN_TEXT_SYNONYM_GROUPS) {
    if (g.includes(a) && g.includes(b)) return true;
  }
  return false;
}

/** Una palabra del modelo coincide con una del estudiante */
function openTextTokensMatch(modelKw: string, studentTok: string): boolean {
  if (!modelKw || !studentTok) return false;
  if (modelKw === studentTok) return true;
  if (synonymEquivalent(modelKw, studentTok)) return true;
  const n = Math.max(modelKw.length, studentTok.length);
  if (n >= 4 && levenshtein(modelKw, studentTok) <= 1) return true;
  return false;
}

/** Normaliza una palabra suelta: minúsculas, sin tildes, solo letras/números */
function normalizeOpenTextToken(raw: string): string {
  const t = stripAccents(raw.trim().toLowerCase());
  return t.replace(/[^a-z0-9]+/g, '');
}

/**
 * Parte una respuesta en “ítems” (orden no importa): barras, punto y coma, comas, saltos, espacios.
 * Quita prefijos tipo a) b. 1.
 */
function splitOpenTextIntoItems(text: string): string[] {
  const parts = text
    .split(/[|;\n\r/,]+|\s+/u)
    .map((p) =>
      p
        .trim()
        .replace(/^\s*\(?[a-z]\)?[).:]\s*/i, '')
        .replace(/^\s*\d+[).:]\s*/, '')
        .trim()
    )
    .filter(Boolean);
  return parts;
}

function extractOpenTextKeywordsFromLine(line: string): string[] {
  const items = splitOpenTextIntoItems(line);
  return items.map(normalizeOpenTextToken).filter((t) => t.length > 0);
}

/** Comparación de frase completa: ignora mayúsculas, tildes y signos de puntuación */
function normalizeOpenTextLoosePhrase(s: string): string {
  return stripAccents(s.trim().toLowerCase()).replace(/[^a-z0-9]+/g, '');
}

function openTextLoosePhraseMatch(studentRaw: string, modelLine: string): boolean {
  const a = normalizeOpenTextLoosePhrase(studentRaw);
  const b = normalizeOpenTextLoosePhrase(modelLine);
  if (!a || !b) return false;
  return a === b;
}

/**
 * ¿La respuesta del estudiante cumple una línea modelo? (orden libre de palabras clave, o frase equivalente)
 */
function openTextLineMatchesStudent(studentRaw: string, modelLine: string): boolean {
  const trimmed = modelLine.trim();
  if (!trimmed) return false;
  if (openTextLoosePhraseMatch(studentRaw, trimmed)) return true;

  const modelKws = extractOpenTextKeywordsFromLine(trimmed);
  if (modelKws.length === 0) return false;

  const studentToks = splitOpenTextIntoItems(studentRaw).map(normalizeOpenTextToken).filter((t) => t.length > 0);
  if (studentToks.length === 0) return false;

  if (modelKws.length >= 2) {
    const pool = [...studentToks];
    for (const mk of modelKws) {
      const idx = pool.findIndex((st) => openTextTokensMatch(mk, st));
      if (idx === -1) return false;
      pool.splice(idx, 1);
    }
    return true;
  }

  // Una sola palabra clave: aceptar si coincide con algún token o con la frase suelta
  const mk = modelKws[0];
  return studentToks.some((st) => openTextTokensMatch(mk, st)) || openTextLoosePhraseMatch(studentRaw, trimmed);
}

/** Cualquier línea alternativa del modelo satisface la respuesta */
function openTextMatchesModelAlternatives(studentRaw: string, modelAlternativeLines: string[]): boolean {
  const lines = modelAlternativeLines.map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return false;
  return lines.some((line) => openTextLineMatchesStudent(studentRaw, line));
}

export async function createExam(params: CreateExamParams) {
  if ((!params.subjectId && !params.courseId) || (params.subjectId && params.courseId)) {
    throw new Error('Exam must have either subjectId or courseId, not both');
  }

  const { data, error } = await supabaseAdmin
    .from('exams')
    .insert({
      subject_id: params.subjectId || null,
      course_id: params.courseId || null,
      title: params.title,
      description: params.description || null,
      question_count: params.questionCount,
      passing_score: params.passingScore ?? 70,
      duration_minutes: params.durationMinutes ?? null,
      max_attempts: params.maxAttempts ?? 1,
      exam_kind: params.examKind ?? 'training',
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function deleteExam(id: string) {
  const { error } = await supabaseAdmin.from('exams').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function getExam(id: string) {
  const { data, error } = await supabaseAdmin
    .from('exams')
    .select('id, title, description, subject_id, course_id, question_count, passing_score, duration_minutes, max_attempts, exam_kind, created_at, updated_at')
    .eq('id', id)
    .single();
  if (error || !data) throw new Error('Exam not found');
  return data;
}

export interface UpdateExamParams {
  title?: string;
  description?: string | null;
  questionCount?: number;
  passingScore?: number;
  durationMinutes?: number | null;
  maxAttempts?: number;
  examKind?: 'training' | 'definitive';
}

export async function updateExam(id: string, params: UpdateExamParams) {
  const update: Record<string, unknown> = {};
  if (params.title !== undefined) update.title = params.title.trim();
  if (params.description !== undefined) update.description = params.description?.trim() || null;
  if (params.questionCount !== undefined) update.question_count = params.questionCount;
  if (params.passingScore !== undefined) update.passing_score = params.passingScore;
  if (params.durationMinutes !== undefined) update.duration_minutes = params.durationMinutes ?? null;
  if (params.maxAttempts !== undefined) update.max_attempts = params.maxAttempts;
  if (params.examKind !== undefined) update.exam_kind = params.examKind;
  if (Object.keys(update).length === 0) return getExam(id);
  const { data, error } = await supabaseAdmin
    .from('exams')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Número de intentos extra concedidos a este usuario en este examen */
export async function getExtraAttemptsCount(examId: string, userId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('exam_extra_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('exam_id', examId)
    .eq('user_id', userId);
  if (error) return 0;
  return count ?? 0;
}

/** Concede un intento extra a un estudiante (ej. supletorio) */
export async function grantExtraAttempt(examId: string, userId: string, grantedBy: string | null) {
  const { error } = await supabaseAdmin
    .from('exam_extra_attempts')
    .insert({ exam_id: examId, user_id: userId, granted_by: grantedBy });
  if (error) throw new Error(error.message);
}

/** Cohorts para los que el examen definitivo está habilitado */
export async function listExamAvailability(examId: string): Promise<{ cohortId: string; cohortName: string; cohortCode: string; enabledAt: string }[]> {
  const { data: rows, error } = await supabaseAdmin
    .from('exam_availability')
    .select('cohort_id, enabled_at')
    .eq('exam_id', examId);
  if (error) return [];
  if (!rows?.length) return [];
  const cohortIds = [...new Set(rows.map((r) => r.cohort_id))];
  const { data: cohorts } = await supabaseAdmin
    .from('cohorts')
    .select('id, name, code')
    .in('id', cohortIds);
  const byId = new Map((cohorts || []).map((c) => [c.id, c]));
  return rows.map((r) => {
    const c = byId.get(r.cohort_id);
    return {
      cohortId: r.cohort_id,
      cohortName: c?.name ?? '',
      cohortCode: c?.code ?? '',
      enabledAt: r.enabled_at ?? '',
    };
  });
}

/** Establece los cohorts para los que el examen definitivo está habilitado (reemplaza la lista) */
export async function setExamAvailability(examId: string, cohortIds: string[]) {
  const { error: delErr } = await supabaseAdmin
    .from('exam_availability')
    .delete()
    .eq('exam_id', examId);
  if (delErr) throw new Error(delErr.message);
  const unique = [...new Set(cohortIds)].filter(Boolean);
  if (unique.length === 0) return;
  const { error: insErr } = await supabaseAdmin
    .from('exam_availability')
    .insert(unique.map((cohort_id) => ({ exam_id: examId, cohort_id })));
  if (insErr) throw new Error(insErr.message);
}

/** Exámenes para los que el cohort está habilitado (solo definitivos; training no usa esta tabla) */
export async function getEnabledDefinitiveExamIdsForCohort(cohortId: string): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from('exam_availability')
    .select('exam_id')
    .eq('cohort_id', cohortId);
  if (error || !data?.length) return new Set();
  return new Set(data.map((r) => r.exam_id));
}

export async function deleteQuestion(questionId: string) {
  const { error } = await supabaseAdmin.from('questions').delete().eq('id', questionId);
  if (error) throw new Error(error.message);
}

async function getQuestionInsertContext(examId: string): Promise<{ subjectId: string | null; examId: string | null }> {
  const { data: exam, error } = await supabaseAdmin
    .from('exams')
    .select('subject_id, course_id')
    .eq('id', examId)
    .single();
  if (error || !exam) throw new Error('Exam not found');
  if (exam.subject_id) return { subjectId: exam.subject_id, examId: null };
  return { subjectId: null, examId };
}

async function getNextOrderIndex(subjectId: string | null, examId: string | null): Promise<number> {
  const col = subjectId ? 'subject_id' : 'exam_id';
  const val = subjectId || examId;
  const { data: questions } = await supabaseAdmin
    .from('questions')
    .select('order_index')
    .eq(col, val)
    .order('order_index', { ascending: false })
    .limit(1);
  return questions?.length ? (questions[0].order_index ?? 0) + 1 : 0;
}

export async function addQuestion(examId: string, params: CreateQuestionParams) {
  const { subjectId, examId: targetExamId } = await getQuestionInsertContext(examId);
  const nextOrder = await getNextOrderIndex(subjectId, targetExamId ?? null);

  const type = params.type || 'multiple_choice';
  const insertRow: Record<string, unknown> = {
    subject_id: subjectId || null,
    exam_id: targetExamId || null,
    question_text: params.questionText,
    image_url: params.imageUrl || null,
    order_index: nextOrder,
  };

  if (type === 'open_text') {
    const parts = params.correctAnswerParts && params.correctAnswerParts.length > 0
      ? params.correctAnswerParts.map((p) => (p || '').trim()).filter(Boolean)
      : (params.correctAnswerText ? [params.correctAnswerText.trim()] : []);
    const openTextParts = Math.max(1, parts.length);
    const correctAnswerText = parts.join('|||');
    const { data: question, error: qErr } = await supabaseAdmin
      .from('questions')
      .insert({ ...insertRow, type: 'open_text', correct_answer_text: correctAnswerText || null, open_text_parts: openTextParts })
      .select()
      .single();
    if (qErr || !question) throw new Error(qErr?.message || 'Failed to create question');
    return { ...question, options: [] };
  }

  const { data: question, error: qErr } = await supabaseAdmin
    .from('questions')
    .insert({ ...insertRow, type: 'multiple_choice' })
    .select()
    .single();

  if (qErr || !question) throw new Error(qErr?.message || 'Failed to create question');

  const optionsToInsert = params.options.map((opt, i) => ({
    question_id: question.id,
    option_text: opt.text,
    is_correct: opt.isCorrect,
    order_index: i,
  }));

  const { error: oErr } = await supabaseAdmin.from('options').insert(optionsToInsert);
  if (oErr) throw new Error(oErr.message);

  return { ...question, options: optionsToInsert };
}

async function loadQuestionsForExam(exam: { id: string; subject_id: string | null; course_id: string | null }) {
  let query = supabaseAdmin
    .from('questions')
    .select('id, question_text, image_url, order_index, type, correct_answer_text, open_text_parts');
  if (exam.subject_id) {
    query = query.eq('subject_id', exam.subject_id);
  } else {
    query = query.eq('exam_id', exam.id);
  }
  const { data: questions, error: qErr } = await query.order('order_index');
  if (qErr) throw new Error(qErr.message);
  return questions || [];
}

export async function getExamWithQuestions(examId: string) {
  const { data: exam, error: examErr } = await supabaseAdmin
    .from('exams')
    .select('*')
    .eq('id', examId)
    .single();

  if (examErr || !exam) throw new Error(examErr?.message || 'Exam not found');

  const questions = await loadQuestionsForExam(exam);

  const questionsWithOptions = await Promise.all(
    questions.map(async (q: { id: string; type?: string }) => {
      const qType = (q as { type?: string }).type || 'multiple_choice';
      if (qType === 'open_text') return { ...q, options: [] };
      const { data: opts } = await supabaseAdmin
        .from('options')
        .select('id, option_text, order_index')
        .eq('question_id', q.id)
        .order('order_index');
      return { ...q, options: opts || [] };
    })
  );

  return { ...exam, questions: questionsWithOptions };
}

export async function getExamForStudent(examId: string) {
  const { data: exam, error: examErr } = await supabaseAdmin
    .from('exams')
    .select('id, title, question_count, subject_id, course_id, duration_minutes')
    .eq('id', examId)
    .single();
  if (examErr || !exam) throw new Error('Exam not found');

  const rawQuestions = await loadQuestionsForExam(exam);
  const count = Math.min(exam.question_count, rawQuestions.length);
  if (count === 0) {
    throw new Error('No hay preguntas en el banco para este examen. Contacta al administrador.');
  }

  const shuffled = [...rawQuestions].sort(() => Math.random() - 0.5).slice(0, count);

  const questionsWithOptions = await Promise.all(
    shuffled.map(async (q: { id: string; question_text: string; image_url?: string; type?: string; open_text_parts?: number }) => {
      const qType = q.type || 'multiple_choice';
      if (qType === 'open_text') return { ...q, options: [] };
      const { data: opts } = await supabaseAdmin
        .from('options')
        .select('id, option_text, order_index')
        .eq('question_id', q.id)
        .order('order_index');
      return { ...q, options: opts || [] };
    })
  );

  type Q = { id: string; question_text: string; image_url?: string; type?: string; options: { id: string; option_text: string }[] };
  type QWithParts = Q & { open_text_parts?: number };
  const questions = (questionsWithOptions as QWithParts[]).map((q) => {
    const type = q.type || 'multiple_choice';
    return {
      id: q.id,
      questionText: q.question_text,
      imageUrl: q.image_url,
      type,
      openTextParts: type === 'open_text' ? Math.max(1, q.open_text_parts ?? 1) : undefined,
      options: type === 'multiple_choice'
        ? (q.options || []).sort(() => Math.random() - 0.5).map((o) => ({ id: o.id, text: o.option_text }))
        : [],
    };
  });

  return {
    id: exam.id,
    title: exam.title,
    questions,
    durationMinutes: exam.duration_minutes ?? undefined,
  };
}

/** Cuenta intentos finalizados por tipo (práctica o definitivo) */
export async function countFinishedAttemptsByType(examId: string, userId: string, isDefinitive: boolean): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('exam_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('exam_id', examId)
    .eq('user_id', userId)
    .eq('is_definitive', isDefinitive)
    .not('finished_at', 'is', null);
  if (error) return 0;
  return count ?? 0;
}

/** Cuenta cuántos intentos finalizados tiene el usuario en este examen (todos) */
export async function countFinishedAttempts(examId: string, userId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('exam_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('exam_id', examId)
    .eq('user_id', userId)
    .not('finished_at', 'is', null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Devuelve el intento sin finalizar (en curso) si existe */
export async function getUnfinishedAttempt(examId: string, userId: string): Promise<{ id: string; finished_at: string | null } | null> {
  const { data, error } = await supabaseAdmin
    .from('exam_attempts')
    .select('id, finished_at')
    .eq('exam_id', examId)
    .eq('user_id', userId)
    .is('finished_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

/** Obtiene el intento existente: si hay uno sin finalizar lo devuelve; si no, null (el router decidirá si puede crear otro) */
export async function getExistingAttempt(examId: string, userId: string): Promise<{ id: string; finished_at: string | null } | null> {
  return getUnfinishedAttempt(examId, userId);
}

export async function createAttempt(examId: string, userId: string, isDefinitive: boolean = false) {
  const { data, error } = await supabaseAdmin
    .from('exam_attempts')
    .insert({ exam_id: examId, user_id: userId, is_definitive: isDefinitive })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function submitAttempt(
  attemptId: string,
  userId: string,
  answers: { questionId: string; optionId?: string; textAnswer?: string; textAnswers?: string[] }[]
) {
  const { data: attempt, error: attErr } = await supabaseAdmin
    .from('exam_attempts')
    .select('id, exam_id, is_definitive')
    .eq('id', attemptId)
    .eq('user_id', userId)
    .single();

  if (attErr || !attempt) throw new Error('Attempt not found');

  const mcAnswers = answers.filter((a) => a.optionId);
  const questionIds = answers.map((a) => a.questionId);
  const { data: questions } = await supabaseAdmin
    .from('questions')
    .select('id, type, correct_answer_text, open_text_parts')
    .in('id', questionIds);
  const questionTypes = new Map((questions || []).map((q) => [q.id, (q as { type?: string }).type || 'multiple_choice']));
  const questionModelAnswers = new Map(
    (questions || []).filter((q) => (q as { type?: string }).type === 'open_text').map((q) => [q.id, (q as { correct_answer_text?: string }).correct_answer_text || ''])
  );
  const questionPartsCount = new Map(
    (questions || []).filter((q) => (q as { type?: string }).type === 'open_text').map((q) => [q.id, Math.max(1, (q as { open_text_parts?: number }).open_text_parts ?? 1)])
  );

  const { data: correctMap } = mcAnswers.length
    ? await supabaseAdmin.from('options').select('id, question_id, is_correct').in('question_id', mcAnswers.map((a) => a.questionId))
    : { data: [] as { id: string; question_id: string; is_correct: boolean }[] };

  const correctById = new Map((correctMap || []).map((o) => [o.id, o]));
  const correctByQuestion = new Map((correctMap || []).filter((o) => o.is_correct).map((o) => [o.question_id, o.id]));

  const attemptAnswers: { attempt_id: string; question_id: string; option_id: string | null; text_answer: string | null; is_correct: boolean | null }[] = answers.map((a) => {
    const qType = questionTypes.get(a.questionId) || 'multiple_choice';
    if (qType === 'open_text') {
      const partsCount = questionPartsCount.get(a.questionId) ?? 1;
      const modelText = questionModelAnswers.get(a.questionId) || '';
      const modelParts = modelText.split('|||').map((p) =>
        p
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
      );

      let studentTexts: string[];
      if (partsCount > 1 && Array.isArray((a as { textAnswers?: string[] }).textAnswers)) {
        studentTexts = (a as { textAnswers: string[] }).textAnswers.map((t) => (t ?? '').trim());
        while (studentTexts.length < partsCount) studentTexts.push('');
      } else {
        const single = (a as { textAnswer?: string }).textAnswer?.trim() || '';
        studentTexts = [single];
      }

      // Respuesta abierta: orden libre, mayúsculas/tildes/puntuación irrelevantes; sinónimos y 1 error tipográfico
      let allCorrect = true;
      if (partsCount > 1) {
        if (studentTexts.length !== partsCount) {
          allCorrect = false;
        } else {
          const used = new Set<number>();
          for (let i = 0; i < partsCount; i++) {
            const modelAltLines = modelParts[i] || [];
            if (modelAltLines.length === 0) continue;
            let found = false;
            for (let j = 0; j < studentTexts.length; j++) {
              if (used.has(j)) continue;
              if (openTextMatchesModelAlternatives(studentTexts[j], modelAltLines)) {
                used.add(j);
                found = true;
                break;
              }
            }
            if (!found) {
              allCorrect = false;
              break;
            }
          }
        }
      } else {
        const modelAltLines = modelParts[0] || [];
        const studentRaw = studentTexts[0] || '';
        if (modelAltLines.length > 0 && !openTextMatchesModelAlternatives(studentRaw, modelAltLines)) allCorrect = false;
      }
      const textToStore = partsCount > 1 ? JSON.stringify(studentTexts) : (studentTexts[0] || null);
      return {
        attempt_id: attemptId,
        question_id: a.questionId,
        option_id: null,
        text_answer: textToStore,
        is_correct: allCorrect,
      };
    }
    const correctOpt = correctByQuestion.get(a.questionId);
    const isCorrect = a.optionId && correctOpt ? a.optionId === correctOpt : false;
    return {
      attempt_id: attemptId,
      question_id: a.questionId,
      option_id: a.optionId || null,
      text_answer: null,
      is_correct: isCorrect,
    };
  });

  await supabaseAdmin.from('attempt_answers').insert(attemptAnswers);

  const correctCount = attemptAnswers.filter((a) => a.is_correct === true).length;
  const total = attemptAnswers.length;
  const score = total > 0 ? (correctCount / total) * 100 : 0;

  const { data: exam } = await supabaseAdmin.from('exams').select('passing_score').eq('id', attempt.exam_id).single();
  const passingScore = exam?.passing_score ?? 70;
  const passed = score >= passingScore;

  await supabaseAdmin
    .from('exam_attempts')
    .update({ score, passed, finished_at: new Date().toISOString() })
    .eq('id', attemptId);

  // A→B: si aprobó el examen DEFINITIVO, notificar a CampusRide (trama cifrada
  // con Vault Transit). Fire-and-forget: un fallo en B no bloquea la entrega
  // de la calificación al alumno; solo se registra el error.
  const isDefinitive = (attempt as { is_definitive?: boolean }).is_definitive === true;
  if (passed && isDefinitive) {
    void notifyExamPassed(userId, attempt.exam_id, score).catch((e) =>
      console.error('[certification] Error notificando la certificación a CampusRide:', e),
    );
  }

  return {
    score,
    passed,
    correctCount,
    total,
  };
}

export async function getAttemptResult(attemptId: string, userId: string) {
  const { data: attempt, error: attErr } = await supabaseAdmin
    .from('exam_attempts')
    .select('*')
    .eq('id', attemptId)
    .eq('user_id', userId)
    .single();

  if (attErr || !attempt) throw new Error('Attempt not found');
  if (!attempt.finished_at) throw new Error('Attempt not yet finished');

  const { data: answers } = await supabaseAdmin
    .from('attempt_answers')
    .select('question_id, option_id, is_correct')
    .eq('attempt_id', attemptId);

  const correctCount = (answers || []).filter((a) => a.is_correct).length;
  const total = (answers || []).length;

  return {
    score: attempt.score,
    passed: attempt.passed,
    correctCount,
    total,
    startedAt: attempt.started_at,
    finishedAt: attempt.finished_at,
    answers: answers || [],
  };
}

/** Lista exámenes del curso (mismo banco para práctica y definitivo). No filtra por cohort. */
export async function listExamsForCourse(courseId: string) {
  const { data: bySubject } = await supabaseAdmin
    .from('exams')
    .select('id, title, subject_id, course_id, question_count, passing_score, duration_minutes, max_attempts')
    .is('course_id', null);

  const subjectIds = [...new Set((bySubject || []).map((e) => e.subject_id).filter(Boolean))];
  const { data: subjects } = await supabaseAdmin
    .from('subjects')
    .select('id, course_id')
    .in('id', subjectIds)
    .eq('course_id', courseId);

  const validSubjectIds = new Set((subjects || []).map((s) => s.id));
  const examsBySubject = (bySubject || []).filter((e) => e.subject_id && validSubjectIds.has(e.subject_id));

  const { data: examsByCourse } = await supabaseAdmin
    .from('exams')
    .select('id, title, subject_id, course_id, question_count, passing_score, duration_minutes, max_attempts')
    .eq('course_id', courseId);

  return [...(examsByCourse || []), ...examsBySubject];
}

/** Resultados del examen: un registro por usuario con su mejor intento (mayor calificación) */
export async function getAdminExamResults(examId: string) {
  const { data: attempts, error } = await supabaseAdmin
    .from('exam_attempts')
    .select('id, user_id, score, passed, started_at, finished_at')
    .eq('exam_id', examId)
    .not('finished_at', 'is', null);

  if (error) throw new Error(error.message);
  if (!attempts?.length) return [];

  const byUser = new Map<string, { id: string; user_id: string; score: number; passed: boolean; started_at: string; finished_at: string }>();
  for (const a of attempts) {
    const score = a.score ?? 0;
    const existing = byUser.get(a.user_id);
    if (!existing || (existing.score ?? 0) < score) {
      byUser.set(a.user_id, { id: a.id, user_id: a.user_id, score, passed: a.passed ?? false, started_at: a.started_at, finished_at: a.finished_at ?? '' });
    }
  }

  const userIds = [...byUser.keys()];
  const { data: profiles } = await supabaseAdmin
    .from('user_profiles')
    .select('id, email, full_name')
    .in('id', userIds);

  const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
  return [...byUser.values()].map((a) => ({
    ...a,
    email: profileMap.get(a.user_id)?.email,
    fullName: profileMap.get(a.user_id)?.full_name,
  }));
}

/** Resultados del usuario: un registro por examen con su mejor intento */
export async function getUserExamResults(userId: string) {
  const { data: attempts, error } = await supabaseAdmin
    .from('exam_attempts')
    .select('id, exam_id, score, passed, started_at, finished_at')
    .eq('user_id', userId)
    .not('finished_at', 'is', null);

  if (error) throw new Error(error.message);
  if (!attempts?.length) return [];

  const byExam = new Map<string, { id: string; exam_id: string; score: number; passed: boolean; started_at: string; finished_at: string }>();
  for (const a of attempts) {
    const score = a.score ?? 0;
    const existing = byExam.get(a.exam_id);
    if (!existing || (existing.score ?? 0) < score) {
      byExam.set(a.exam_id, { id: a.id, exam_id: a.exam_id, score, passed: a.passed ?? false, started_at: a.started_at, finished_at: a.finished_at ?? '' });
    }
  }

  const examIds = [...byExam.keys()];
  const { data: exams } = await supabaseAdmin.from('exams').select('id, title').in('id', examIds);
  const examMap = new Map((exams || []).map((e) => [e.id, e]));
  return [...byExam.values()].map((a) => ({ ...a, examTitle: examMap.get(a.exam_id)?.title }));
}

/** Id del intento con mejor calificación para este usuario en este examen (para mostrar resultado) */
export async function getBestAttemptIdForUserExam(examId: string, userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('exam_attempts')
    .select('id, score')
    .eq('exam_id', examId)
    .eq('user_id', userId)
    .not('finished_at', 'is', null)
    .order('score', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data.id;
}

export interface AttemptDetailAnswer {
  questionText: string;
  isCorrect: boolean;
  studentAnswer: string;
  correctAnswer: string;
}

export async function getAttemptDetailForAdmin(attemptId: string) {
  const { data: attempt, error: attErr } = await supabaseAdmin
    .from('exam_attempts')
    .select('id, exam_id, user_id, score, passed, started_at, finished_at')
    .eq('id', attemptId)
    .single();

  if (attErr || !attempt) throw new Error('Attempt not found');

  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('email, full_name')
    .eq('id', attempt.user_id)
    .single();

  const { data: answers, error: ansErr } = await supabaseAdmin
    .from('attempt_answers')
    .select('question_id, option_id, text_answer, is_correct')
    .eq('attempt_id', attemptId)
    .order('question_id');

  if (ansErr) throw new Error(ansErr.message);

  const questionIds = [...new Set((answers || []).map((a) => a.question_id))];
  const { data: questions } = await supabaseAdmin
    .from('questions')
    .select('id, question_text, type, correct_answer_text')
    .in('id', questionIds);

  const questionMap = new Map((questions || []).map((q) => [q.id, q]));

  const optionIds = (answers || []).map((a) => a.option_id).filter(Boolean) as string[];
  const { data: options } = optionIds.length
    ? await supabaseAdmin.from('options').select('id, question_id, option_text, is_correct').in('id', optionIds)
    : { data: [] as { id: string; question_id: string; option_text: string; is_correct: boolean }[] };

  const allQuestionIdsForCorrect = [...new Set((options || []).map((o) => o.question_id))];
  const { data: correctOptions } = allQuestionIdsForCorrect.length
    ? await supabaseAdmin.from('options').select('id, question_id, option_text').eq('is_correct', true).in('question_id', allQuestionIdsForCorrect)
    : { data: [] as { question_id: string; option_text: string }[] };
  const correctByQuestion = new Map((correctOptions || []).map((o) => [o.question_id, o.option_text]));
  const optionTextById = new Map((options || []).map((o) => [o.id, o.option_text]));

  const detailAnswers: AttemptDetailAnswer[] = (answers || []).map((a) => {
    const q = questionMap.get(a.question_id) as { question_text: string; type?: string; correct_answer_text?: string } | undefined;
    const questionText = q?.question_text ?? 'Pregunta';
    const isCorrect = a.is_correct === true;
    let studentAnswer = '';
    let correctAnswer = '';

    if (a.option_id) {
      studentAnswer = optionTextById.get(a.option_id) ?? '(opción seleccionada)';
      correctAnswer = correctByQuestion.get(a.question_id) ?? '(respuesta correcta)';
    } else {
      try {
        const raw = a.text_answer;
        if (raw && raw.startsWith('[')) {
          const arr = JSON.parse(raw) as string[];
          studentAnswer = Array.isArray(arr) ? arr.join(' | ') : raw;
        } else {
          studentAnswer = raw ?? '';
        }
      } catch {
        studentAnswer = a.text_answer ?? '';
      }
      const modelText = q?.correct_answer_text ?? '';
      const parts = modelText.split('|||').map((p) => p.split(/\r?\n/)[0]?.trim()).filter(Boolean);
      correctAnswer = parts.length > 1 ? parts.map((p, i) => `${String.fromCharCode(97 + i)}) ${p}`).join('; ') : (parts[0] ?? '(respuesta abierta)');
    }

    return { questionText, isCorrect, studentAnswer, correctAnswer };
  });

  return {
    attempt: { id: attempt.id, score: attempt.score, passed: attempt.passed, finished_at: attempt.finished_at },
    user: { email: profile?.email ?? '', fullName: profile?.full_name ?? '' },
    answers: detailAnswers,
  };
}

/** Detalle del intento para el propio estudiante (ver en qué se equivocó) */
export async function getAttemptDetailForStudent(attemptId: string, userId: string) {
  const { data: attempt, error: attErr } = await supabaseAdmin
    .from('exam_attempts')
    .select('id, exam_id, user_id, score, passed, started_at, finished_at')
    .eq('id', attemptId)
    .eq('user_id', userId)
    .single();

  if (attErr || !attempt) throw new Error('Attempt not found');
  if (!attempt.finished_at) throw new Error('Attempt not yet finished');

  const { data: answers, error: ansErr } = await supabaseAdmin
    .from('attempt_answers')
    .select('question_id, option_id, text_answer, is_correct')
    .eq('attempt_id', attemptId)
    .order('question_id');

  if (ansErr) throw new Error(ansErr.message);

  const questionIds = [...new Set((answers || []).map((a) => a.question_id))];
  const { data: questions } = await supabaseAdmin
    .from('questions')
    .select('id, question_text, type, correct_answer_text')
    .in('id', questionIds);

  const questionMap = new Map((questions || []).map((q) => [q.id, q]));

  const optionIds = (answers || []).map((a) => a.option_id).filter(Boolean) as string[];
  const { data: options } = optionIds.length
    ? await supabaseAdmin.from('options').select('id, question_id, option_text, is_correct').in('id', optionIds)
    : { data: [] as { id: string; question_id: string; option_text: string; is_correct: boolean }[] };

  const allQuestionIdsForCorrect = [...new Set((options || []).map((o) => o.question_id))];
  const { data: correctOptions } = allQuestionIdsForCorrect.length
    ? await supabaseAdmin.from('options').select('id, question_id, option_text').eq('is_correct', true).in('question_id', allQuestionIdsForCorrect)
    : { data: [] as { question_id: string; option_text: string }[] };
  const correctByQuestion = new Map((correctOptions || []).map((o) => [o.question_id, o.option_text]));
  const optionTextById = new Map((options || []).map((o) => [o.id, o.option_text]));

  const detailAnswers: AttemptDetailAnswer[] = (answers || []).map((a) => {
    const q = questionMap.get(a.question_id) as { question_text: string; type?: string; correct_answer_text?: string } | undefined;
    const questionText = q?.question_text ?? 'Pregunta';
    const isCorrect = a.is_correct === true;
    let studentAnswer = '';
    let correctAnswer = '';

    if (a.option_id) {
      studentAnswer = optionTextById.get(a.option_id) ?? '(opción seleccionada)';
      correctAnswer = correctByQuestion.get(a.question_id) ?? '(respuesta correcta)';
    } else {
      try {
        const raw = a.text_answer;
        if (raw && raw.startsWith('[')) {
          const arr = JSON.parse(raw) as string[];
          studentAnswer = Array.isArray(arr) ? arr.join(' | ') : raw;
        } else {
          studentAnswer = raw ?? '';
        }
      } catch {
        studentAnswer = a.text_answer ?? '';
      }
      const modelText = q?.correct_answer_text ?? '';
      const parts = modelText.split('|||').map((p) => p.split(/\r?\n/)[0]?.trim()).filter(Boolean);
      correctAnswer = parts.length > 1 ? parts.map((p, i) => `${String.fromCharCode(97 + i)}) ${p}`).join('; ') : (parts[0] ?? '(respuesta abierta)');
    }

    return { questionText, isCorrect, studentAnswer, correctAnswer };
  });

  return {
    attempt: { id: attempt.id, score: attempt.score, passed: attempt.passed, finished_at: attempt.finished_at },
    answers: detailAnswers,
  };
}
