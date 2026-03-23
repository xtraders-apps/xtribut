export async function handler(event) {
  try {
    const date = event.queryStringParameters.date;

    const encodedDate = `'${date}'`;
    const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao=${encodeURIComponent(encodedDate)}&$format=json`;

    let response;

    // 🔥 TENTA ATÉ 3 VEZES
    for (let i = 0; i < 3; i++) {
      response = await fetch(url);

      if (response.ok) break;

      console.log(`Tentativa ${i + 1} falhou`);
      await new Promise(r => setTimeout(r, 500)); // espera 0.5s
    }

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: "BCB indisponível" }),
      };
    }

    const data = await response.json();

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(data),
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Erro interno" }),
    };
  }
}
