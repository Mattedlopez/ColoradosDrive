'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && user) {
      const dest = user.role === 'admin' ? '/admin' : user.role === 'instructor' ? '/instructor' : '/student';
      router.replace(dest);
    }
  }, [user, authLoading, router]);

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      // Redirige a Keycloak (OIDC + PKCE); el retorno llega a /auth/callback.
      await login();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
      setLoading(false);
    }
  };

  if (authLoading || user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950">
        <div className="flex flex-col items-center gap-5">
          <div className="w-12 h-12 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-neutral-400 text-sm font-medium">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row relative overflow-hidden">
      {/* Fondo dinámico */}
      <div className="absolute inset-0 bg-neutral-950">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            background: `
              radial-gradient(ellipse 80% 50% at 20% 40%, rgba(185, 28, 28, 0.25), transparent),
              radial-gradient(ellipse 60% 40% at 80% 60%, rgba(220, 38, 38, 0.15), transparent),
              radial-gradient(ellipse 50% 30% at 50% 80%, rgba(127, 29, 29, 0.2), transparent)
            `,
          }}
        />
        <div className="absolute w-[600px] h-[600px] rounded-full bg-red-600/20 blur-[120px] -top-40 -left-40 animate-float" />
        <div
          className="absolute w-[400px] h-[400px] rounded-full bg-red-500/10 blur-[100px] bottom-0 right-0"
          style={{ animation: 'float 22s ease-in-out infinite reverse', animationDelay: '-5s' }}
        />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      {/* Panel izquierdo: acceso centrado */}
      <div className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-10 lg:p-16 overflow-y-auto">
        <div className="w-full max-w-[420px] py-4">
          <div
            className="relative rounded-3xl bg-white/95 backdrop-blur-xl shadow-2xl shadow-black/20 border border-white/20 p-8 sm:p-10 login-stagger"
            style={{ animation: 'login-fade-in-up 0.6s ease-out' }}
          >
            <div className="mb-8">
              <Logo variant="large" href="/" className="inline-block" />
            </div>

            <div className="mb-8">
              <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight">
                Bienvenido
              </h1>
              <p className="mt-1.5 text-neutral-500 text-sm sm:text-base">
                Accede con tu cuenta institucional para entrar a tu curso
              </p>
            </div>

            {error && (
              <div
                className="mb-5 flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm"
                role="alert"
              >
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleLogin}
              disabled={loading}
              className="
                w-full min-h-[48px] py-4 rounded-xl font-semibold text-white
                bg-gradient-to-b from-red-600 to-red-700
                shadow-lg shadow-red-600/30
                hover:from-red-500 hover:to-red-600
                hover:shadow-xl hover:shadow-red-500/35 hover:-translate-y-0.5
                active:translate-y-0 active:shadow-md
                disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0
                transition-all duration-200 flex items-center justify-center gap-2
              "
            >
              {loading ? (
                <>
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Redirigiendo...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Iniciar sesión
                </>
              )}
            </button>

            <p className="mt-4 text-center text-xs text-neutral-400">
              Autenticación centralizada (Keycloak · SSO · OTP)
            </p>

            <p className="mt-6 text-center text-sm text-neutral-500">
              ¿Problemas para acceder? Contacta a tu instructor.
            </p>
          </div>

          <p className="mt-6 text-center text-xs text-neutral-500">
            Colorados Drive · Santo Domingo, Ecuador
          </p>
        </div>
      </div>

      {/* Panel derecho: branding (solo desktop) */}
      <div className="hidden lg:flex relative z-10 flex-1 flex-col justify-between p-12 xl:p-16 text-white">
        <div />
        <div className="space-y-8 max-w-md">
          <h2 className="text-3xl xl:text-4xl font-bold leading-tight">
            Formación profesional
            <br />
            <span className="text-red-400">de conductores</span>
          </h2>
          <p className="text-neutral-400 text-lg">
            Cursos Tipo A y Tipo B. Material teórico, exámenes prácticos y seguimiento de tu progreso.
          </p>
          <ul className="space-y-4">
            {['Contenido teórico', 'Exámenes en línea', 'Seguimiento de progreso'].map((item, i) => (
              <li key={i} className="flex items-center gap-3 text-neutral-300">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/20 text-red-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-neutral-500 text-sm">Santo Domingo, Ecuador</p>
      </div>
    </div>
  );
}
