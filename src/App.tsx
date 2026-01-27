import { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { LoginScreen } from './components/LoginScreen';
import { RegisterScreen } from './components/RegisterScreen';
import { NoAccessScreen } from './components/NoAccessScreen';
import { TermsModal } from './components/TermsModal';
import { LoadingOverlay } from './components/LoadingOverlay';
import { MainApplication } from './components/MainApplication';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Carregando plataforma...');
  const [screen, setScreen] = useState<'login' | 'register' | 'no-access' | 'terms' | 'main'>('login');
  const [showMain, setShowMain] = useState(false);
  const [shouldAutoStartTutorial, setShouldAutoStartTutorial] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log('Estado de autenticação mudou:', currentUser ? currentUser.email : 'sem usuário');

      if (currentUser) {
        console.log('Usuário autenticado, iniciando verificações...');
        setUser(currentUser);
        setLoadingMessage('Verificando seu acesso...');
        setLoading(true);
        document.body.style.overflow = 'hidden';

        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const docSnap = await getDoc(userDocRef);

          console.log('Documento do usuário existe:', docSnap.exists());

          if (docSnap.exists() && docSnap.data().termsAccepted) {
            console.log('Termos aceitos, verificando pagamento...');
            const hasActivePayment = await checkUserPaymentStatus(currentUser);
            console.log('Pagamento ativo:', hasActivePayment);

            if (hasActivePayment) {
              console.log('Iniciando aplicação principal...');
              // Check if tutorial was already seen
              const tutorialSeen = docSnap.data().tutorialSeen === true;
              setShouldAutoStartTutorial(!tutorialSeen);
              showMainApplication();
            } else {
              console.log('Sem pagamento ativo, mostrando tela de acesso negado');
              setScreen('no-access');
              setLoading(false);
            }
          } else {
            console.log('Termos não aceitos, mostrando modal de termos');
            setScreen('terms');
            setLoading(false);
          }
        } catch (error) {
          console.error('Erro no fluxo de verificação:', error);
          alert('Ocorreu um erro ao verificar suas permissões. Tente novamente.');
          setLoading(false);
        }
      } else {
        console.log('Usuário não autenticado, mostrando tela de login');
        setUser(null);
        setScreen(prev => (prev === 'login' || prev === 'register') ? prev : 'login');
        setLoading(false);
        setShowMain(false);
        document.body.style.overflow = 'auto';
      }
    });

    return () => unsubscribe();
  }, []);

  async function checkUserPaymentStatus(user: User): Promise<boolean> {
    if (!user) return false;

    try {
      // Force refresh token to get latest custom claims
      await user.getIdToken(true);
      const tokenResult = await user.getIdTokenResult();

      // Check for the 'hasAccess' claim set by the webhook
      return !!tokenResult.claims.hasAccess;
    } catch (error) {
      console.error('Erro ao verificar permissões (claims):', error);
      return false;
    }
  }

  function showMainApplication() {
    console.log('Iniciando showMainApplication...');
    setLoadingMessage('Carregando plataforma...');
    setLoading(true);

    setTimeout(() => {
      console.log('Fade out iniciando...');
      setScreen('main');

      setTimeout(() => {
        console.log('Mostrando conteúdo principal...');
        setLoading(false);
        setShowMain(true);
        document.body.style.overflow = 'auto';
        console.log('Aplicação carregada com sucesso!');

        // O tour será iniciado automaticamente pelo hook useTour() no MainApplication
        // se o usuário ainda não tiver visto o tutorial
      }, 500);
    }, 1000);
  }

  async function handleTermsAccept() {
    setLoadingMessage('Verificando seu acesso...');
    setLoading(true);
    if (user) {
      const hasActivePayment = await checkUserPaymentStatus(user);
      if (hasActivePayment) {
        // First time accepting terms, so tutorial should auto-start
        setShouldAutoStartTutorial(true);
        showMainApplication();
      } else {
        setScreen('no-access');
        setLoading(false);
      }
    }
  }

  if (loading && screen !== 'main') {
    return <LoadingOverlay message={loadingMessage} visible />;
  }

  return (
    <>

      {screen === 'login' && <LoginScreen onSwitchToRegister={() => setScreen('register')} />}
      {screen === 'register' && <RegisterScreen onSwitchToLogin={() => setScreen('login')} />}
      {screen === 'no-access' && <NoAccessScreen />}
      {screen === 'terms' && <TermsModal onAccept={handleTermsAccept} />}
      {screen === 'main' && (
        <>
          <LoadingOverlay message={loadingMessage} visible={loading} />
          {showMain && <MainApplication user={user} autoStartTutorial={shouldAutoStartTutorial} />}
        </>
      )}
    </>
  );
}
