export async function handler(event) {
  try {
    const date = event.queryStringParameters.date;

    if (!date) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Data não informada" }),
      };
    }

    const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${date}'&$format=json`;

    const response = await fetch(url);
    const data = await response.json();

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(data),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Erro ao buscar cotação" }),
    };
  }
}
