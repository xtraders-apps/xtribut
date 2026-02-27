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
      console.error('requestFirstAccess error:', error?.code, error?.message, error);

      if (error?.code === 'functions/invalid-argument') {
        setMessage('E-mail inválido. Verifique e tente novamente.');
      } else if (error?.code === 'functions/permission-denied') {
        setMessage('Não encontramos pagamento aprovado para este e-mail. Use o mesmo e-mail da compra.');
      } else if (error?.code === 'functions/not-found') {
        setMessage('Serviço de validação não encontrado. Atualize o backend e tente novamente.');
      } else if (error?.code === 'functions/internal') {
        setMessage('Erro interno na validação de acesso. Tente novamente em instantes.');
      } else if (error?.code === 'auth/too-many-requests') {
        setMessage('Muitas tentativas. Aguarde alguns minutos e tente novamente.');
      } else if (error?.code === 'auth/invalid-email') {
        setMessage('Formato de e-mail inválido.');
      } else {
        setMessage('Erro ao processar solicitação. Tente novamente.');
      }

      setMessageType('error');
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
            <path fill="url(#logo-gradient-register)" d="M4.76369 -0.719727C2.13278 -0.719727 0 1.41305 0 4.04396V4.04396..." />
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
