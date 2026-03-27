const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { messages, system } = JSON.parse(event.body);

    const RETRY_DELAYS = [0, 3000, 6000, 10000];
    let lastError = null;

    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
      if (attempt > 0) {
        console.log(`Overloaded — waiting ${RETRY_DELAYS[attempt]}ms then retrying (attempt ${attempt + 1}/${RETRY_DELAYS.length})…`);
        await sleep(RETRY_DELAYS[attempt]);
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          system,
          messages,
        }),
      });

      const data = await response.json();

      // Check for overload — retry if so
      if (data.error) {
        const errType = (data.error.type || '').toLowerCase();
        const errMsg  = (data.error.message || '').toLowerCase();
        const isOverloaded = errType.includes('overload') || errMsg.includes('overload');

        if (isOverloaded && attempt < RETRY_DELAYS.length - 1) {
          lastError = data.error;
          continue; // retry
        }

        // Non-overload error or exhausted retries — return to frontend
        console.error('Anthropic error after retries:', JSON.stringify(data.error));
        return {
          statusCode: 200,
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify(data),
        };
      }

      // Success
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(data),
      };
    }

    // All retries exhausted
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: lastError || { message: 'Service temporarily unavailable. Please try again.' } }),
    };

  } catch (err) {
    console.error('Function error:', err.message);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: { message: err.message } }),
    };
  }
};
