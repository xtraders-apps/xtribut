export async function handler(event) {
  try {
    const date = event.queryStringParameters.date;

    if (!date) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Data não informada" }),
      };
    }

    // 🔥 ENCODE CORRETO
    const encodedDate = `'${date}'`;

    const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao=${encodeURIComponent(encodedDate)}&$format=json`;

    console.log("URL:", url);

    const response = await fetch(url);

    if (!response.ok) {
      const text = await response.text(); // 👈 pega erro real
      console.error("Erro BCB:", text);

      return {
        statusCode: response.status,
        body: JSON.stringify({ error: text }),
      };
    }

    const data = await response.json();

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(data),
    };

  } catch (error) {
    console.error("Erro geral:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Erro interno" }),
    };
  }
}
