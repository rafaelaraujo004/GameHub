const BASE_URL = 'http://127.0.0.1:3001';

export async function playGame({ name, downloadUrl, metadataId = '' }) {
  const response = await fetch(`${BASE_URL}/play`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, downloadUrl, metadataId }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || 'Falha ao iniciar jogo.');
  }

  return data.jobId;
}

export async function getPlayStatus(jobId) {
  const response = await fetch(`${BASE_URL}/jobs/${encodeURIComponent(jobId)}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || 'Falha ao consultar status.');
  }

  return data.job;
}
