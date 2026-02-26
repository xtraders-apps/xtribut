import { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

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

    try {
      // 🔎 Verifica se o usuário comprou e está com pagamento aprovado
      const pendingRef = doc(db, 'pending_users', email);
      const snap = await getDoc(pendingRef);

      if (!snap.exists() || snap.data().lastSubscriptionStatus !== 'paid') {
        setMessage('E-mail não localizado na base de pagamento.');
        setMessageType('error');
        return;
      }

      // ✅ Se estiver pago, envia link de redefinição
      await sendPasswordResetEmail(auth, email);

      setMessage('Enviamos um link para o seu e-mail para você definir sua senha e acessar a plataforma.');
      setMessageType('success');

    } catch (error) {
      console.error(error);
      setMessage('Erro ao processar solicitação. Tente novamente.');
      setMessageType('error');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#1A1A1A] to-[#0D0D0D] p-4">
      <div className="login-box">

        <h1 className="text-3xl font-semibold mb-3 text-text-primary">
          MDT - Primeiro Acesso
        </h1>

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
          />
        </div>

        <button
          onClick={handleRegistration}
          className="mt-6 btn btn-primary w-full text-base py-3"
        >
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

        {message && (
          <p className={`message ${messageType} mt-4`}>
            {message}
          </p>
        )}

      </div>
    </div>
  );
}
