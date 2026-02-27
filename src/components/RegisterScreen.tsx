import { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface RegisterScreenProps {
  onSwitchToLogin: () => void;
}

export function RegisterScreen({ onSwitchToLogin }: RegisterScreenProps) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'error' | 'success'>('error');

  const handleRegistration = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setMessage('Por favor, insira um e-mail válido.');
      setMessageType('error');
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    try {
      const functions = getFunctions();
      const requestFirstAccess = httpsCallable(functions, 'requestFirstAccess');

      await requestFirstAccess({ email: normalizedEmail });
      await sendPasswordResetEmail(auth, normalizedEmail);

      setMessage('Enviamos um link para o seu e-mail para você definir sua senha e acessar a plataforma.');
      setMessageType('success');
    } catch (error: any) {
      if (error.code === 'functions/permission-denied') {
        setMessage('Não encontramos pagamento aprovado para este e-mail. Use o mesmo e-mail da compra.');
        setMessageType('error');
      } else if (error.code === 'functions/not-found') {
        setMessage('Serviço de validação não encontrado. Atualize o backend (Cloud Functions) e tente novamente.');
        setMessageType('error');
      } else if (error.code === 'functions/internal') {
        setMessage('Erro interno na validação de acesso. Tente novamente em instantes.');
        setMessageType('error');
      } else if (error.code === 'auth/user-not-found') {
        setMessage('Não foi possível preparar sua conta. Tente novamente em alguns segundos.');
        setMessageType('error');
      } else if (error.code === 'auth/invalid-email') {
        setMessage('Formato de e-mail inválido.');
        setMessageType('error');
      } else if (error.code === 'auth/too-many-requests') {
        setMessage('Muitas tentativas. Aguarde alguns minutos e tente novamente.');
        setMessageType('error');
      } else {
        setMessage('Erro ao processar solicitação. Tente novamente.');
        setMessageType('error');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#1A1A1A] to-[#0D0D0D] p-4">
      <div className="login-box">
        <div className="mx-auto mb-8 flex justify-center">
          <svg className="w-14 h-auto flex-shrink-0" viewBox="0 0 59.7 45.9" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="logo-gradient-register" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#D4AF37" />
                <stop offset="50%" stopColor="#FFEE99" />
                <stop offset="100%" stopColor="#D4AF37" />
              </linearGradient>
            </defs>
            <path
              fill="url(#logo-gradient-register)"
              d="M4.76369 -0.719727C2.13278 -0.719727 0 1.41305 0 4.04396V4.04396C0.00217239 3.70526 0.105853 3.37498 0.297665 3.09573C0.489477 2.81649 0.760619 2.60109 1.07611 2.47733C1.3916 2.35357 1.73695 2.32713 2.06762 2.40142C2.39829 2.47571 2.6991 2.64732 2.93124 2.89411L12.335 12.8644C13.2797 13.866 14.5956 14.4337 15.9724 14.4337H25.321C25.7157 14.4314 26.1025 14.5448 26.4334 14.7599C26.7644 14.975 27.0249 15.2823 27.1829 15.6438C27.3409 16.0054 27.3894 16.4053 27.3224 16.794C27.2553 17.1828 27.0757 17.5434 26.8058 17.8313L2.93398 43.2184C2.70202 43.4662 2.40099 43.6387 2.06985 43.7135C1.7387 43.7884 1.3927 43.7622 1.07662 43.6383C0.760551 43.5144 0.488961 43.2986 0.297012 43.0187C0.105064 42.7389 0.00159475 42.4079 0 42.0686V42.0686C0 44.6587 2.09968 46.7584 4.68977 46.7584H55.1698C57.9313 46.7584 60.1698 44.5198 60.1698 41.7584V4.28028C60.1698 1.51886 57.9313 -0.719727 55.1698 -0.719727H4.76369Z"
            />
          </svg>
        </div>

        <h1 className="text-3xl font-semibold mb-3 text-text-primary">MDT - Primeiro Acesso</h1>
        <p className="text-base text-text-secondary mb-8">
          Use o mesmo e-mail que você utilizou na compra para receber seu link de acesso.
        </p>

        <div className="space-y-4">
          <input
            type="email"
            placeholder="Seu e-mail da compra"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-field"
            autoComplete="email"
          />
        </div>

        <button onClick={handleRegistration} className="mt-6 btn btn-primary w-full text-base py-3">
          <span>Receber Link de Acesso</span>
        </button>

        <div className="mt-6 text-sm">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onSwitchToLogin();
            }}
            className="font-semibold text-accent-primary hover:text-accent-hover transition-colors duration-200"
          >
            Já tem uma conta? Acesse aqui.
          </a>
        </div>

        {message && <p className={`message ${messageType} mt-4`}>{message}</p>}
      </div>
    </div>
  );
}
