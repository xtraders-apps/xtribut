const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// ========================================================
// 🔥 WEBHOOK HUBLA — ACEITA TODOS OS EVENTOS
// ========================================================
exports.hublaWebhook = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const body = req.body || {};
    const type = body.type;
    const ev = body.event || {};

    if (!type || !ev) {
      console.error("❌ Payload inválido:", body);
      return res.status(400).send("Bad Request");
    }

    // ========================================================
    // 📌 EXTRAÇÃO UNIVERSAL DE CAMPOS
    // ========================================================
    const email =
      ev?.userEmail ||
      ev?.user?.email ||
      ev?.payer?.email ||
      ev?.smartInstallment?.payer?.email ||
      null;

    const name =
      ev?.userName ||
      `${ev?.user?.firstName || ""} ${ev?.user?.lastName || ""}`.trim() ||
      `${ev?.payer?.firstName || ""} ${ev?.payer?.lastName || ""}`.trim() ||
      "";

    const transactionId =
      ev?.transactionId ||
      ev?.subscriptionId ||
      ev?.invoice?.id ||
      ev?.smartInstallment?.id ||
      ev?.sourceInvoiceId ||
      null;

    if (!email || !transactionId) {
      console.error("❌ Missing fields:", { email, transactionId });
      throw new Error("Missing required fields");
    }

    // ========================================================
    // 🧠 IDEMPOTÊNCIA
    // ========================================================
    const idempotencyKey =
      req.headers["x-hubla-idempotency"] ||
      `${type}-${transactionId}-${Date.now()}`;

    const logRef = db.collection("webhook_events").doc(idempotencyKey);
    if ((await logRef.get()).exists) {
      console.log("🔁 Evento duplicado ignorado:", idempotencyKey);
      return res.status(200).send("Duplicate");
    }

    await logRef.set({
      type,
      email,
      transactionId,
      payload: body,
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      success: false,
    });

    // ========================================================
    // 🔥 MAPEAMENTO DO STATUS
    // ========================================================
    const status = mapStatusFromType(type);
    const hasAccess = ["paid", "active", "completed"].includes(status);

    // ========================================================
    // 👤 BUSCAR USUÁRIO (NÃO CRIA MAIS NO AUTH)
    // ========================================================
    const user = await getUserIfExists(email, name);

    // ========================================================
    // 💾 SALVAR SUBSCRIPTION
    // ========================================================
    await db.collection("subscriptions").doc(transactionId).set(
      {
        userId: user ? user.uid : null,
        email,
        name,
        type,
        status,
        transactionId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // ========================================================
    // 🔑 ATUALIZAR CUSTOM CLAIMS + VIEWS
    // ✅ Só se o usuário já existir no Auth
    // (primeiro cadastro será feito pelo site)
    // ========================================================
    if (user) {
      await admin.auth().setCustomUserClaims(user.uid, {
        hasAccess,
        hublaStatus: status,
        lastHublaEvent: type,
        lastTransactionId: transactionId,
      });

      const activeRef = db.collection("views").doc("active_users");
      const inactiveRef = db.collection("views").doc("inactive_users");

      if (hasAccess) {
        await activeRef.collection("list").doc(user.uid).set({
          uid: user.uid,
          email,
          name,
          status,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await inactiveRef.collection("list").doc(user.uid).delete();
      } else {
        await inactiveRef.collection("list").doc(user.uid).set({
          uid: user.uid,
          email,
          name,
          status,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await activeRef.collection("list").doc(user.uid).delete();
      }
    } else {
      // usuário ainda não existe no Auth: registra em pending_users só pra controle
      await db.collection("pending_users").doc(email).set(
        {
          email,
          name,
          lastSubscriptionStatus: status,
          lastTransactionId: transactionId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    await logRef.set({ success: true }, { merge: true });

    console.log("✅ Evento processado:", {
      type,
      status,
      email,
      transactionId,
      userExists: !!user,
    });
    return res.status(200).send("OK");
  } catch (err) {
    console.error("❌ ERRO GERAL:", err);
    return res.status(500).send("Internal Error");
  }
});

// ========================================================
// 👤 GET USER (SEM CRIAR NOVO NO AUTH)
// ========================================================
async function getUserIfExists(email, name) {
  try {
    const user = await admin.auth().getUserByEmail(email);

    // mantém o doc em "users" atualizado
    await db.collection("users").doc(user.uid).set(
      {
        email,
        name,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return user;
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      // ainda não existe usuário no Auth; quem vai criar é o site no primeiro login
      console.log("ℹ️ Usuário ainda não existe no Auth:", email);
      return null;
    }
    throw err;
  }
}

// ========================================================
// 🔄 SYNC USER ACCESS ON SIGNUP
// Chamado pelo front DEPOIS do createUserWithEmailAndPassword
// ========================================================
exports.syncUserAccessOnSignup = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Usuário não autenticado."
    );
  }

  const uid = context.auth.uid;
  const email = context.auth.token.email;
  const name = context.auth.token.name || "";

  // Procurar se existe alguma subscription paga para esse e-mail
  const subsSnap = await db
    .collection("subscriptions")
    .where("email", "==", email)
    .orderBy("updatedAt", "desc")
    .limit(1)
    .get();

  let hasAccess = false;
  let hublaStatus = "none";
  let lastTransactionId = null;

  if (!subsSnap.empty) {
    const doc = subsSnap.docs[0];
    const data = doc.data();
    hublaStatus = data.status || "unknown";
    lastTransactionId = data.transactionId || doc.id;
    hasAccess = ["paid", "active", "completed"].includes(hublaStatus);
  }

  // Atualizar claims com base no que existe na base
  await admin.auth().setCustomUserClaims(uid, {
    hasAccess,
    hublaStatus,
    lastTransactionId,
  });

  // Atualizar collection users
  await db.collection("users").doc(uid).set(
    {
      email,
      name,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // Atualizar views
  const activeRef = db.collection("views").doc("active_users");
  const inactiveRef = db.collection("views").doc("inactive_users");

  if (hasAccess) {
    await activeRef.collection("list").doc(uid).set({
      uid,
      email,
      name,
      status: hublaStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await inactiveRef.collection("list").doc(uid).delete();
  } else {
    await inactiveRef.collection("list").doc(uid).set({
      uid,
      email,
      name,
      status: hublaStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await activeRef.collection("list").doc(uid).delete();
  }

  console.log("🔄 syncUserAccessOnSignup:", {
    uid,
    email,
    hasAccess,
    hublaStatus,
    lastTransactionId,
  });

  return { hasAccess, hublaStatus, lastTransactionId };
});

// ========================================================
// 🔥 MAP STATUS (ajustado para invoice.payment_succeeded)
// ========================================================
function mapStatusFromType(type) {
  if (!type) return "unknown";

  const t = type.toLowerCase();

  // ✅ Eventos que representam pagamento concluído / acesso liberado
  if (
    t.includes("approved") ||
    t.includes("completed") ||
    t.includes("active") ||
    t.includes("newsale") ||
    t.includes("on_schedule") ||
    t.includes("payment_succeeded") || // invoice.payment_succeeded
    t.includes("payment_approved")
  ) {
    return "paid";
  }

  // ⏳ Pagamento em andamento / aguardando
  if (
    t.includes("pending") ||
    t.includes("waiting_payment") ||
    t.includes("on_hold")
  ) {
    return "pending";
  }

  // ❌ Cancelado / abortado
  if (
    t.includes("canceled") ||
    t.includes("cancelled") ||
    t.includes("aborted")
  ) {
    return "canceled";
  }

  // ⌛ Expirado / vencido
  if (t.includes("expired") || t.includes("overdue")) {
    return "expired";
  }

  // 💸 Reembolsado / chargeback
  if (t.includes("refunded") || t.includes("chargeback")) {
    return "refunded";
  }

  return "unknown";
}
