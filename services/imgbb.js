const IMGBB_ENDPOINT = 'https://api.imgbb.com/1/upload';

async function uploadImageToImgBB(base64Image) {
  const key = process.env.IMGBB_API_KEY;
  if (!key) {
    throw new Error('IMGBB_API_KEY is not configured. Add it to your .env file.');
  }

  const form = new FormData();
  form.append('key', key);
  form.append('image', base64Image);

  const response = await fetch(IMGBB_ENDPOINT, {
    method: 'POST',
    body: form,
    headers: { Accept: 'application/json' },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) {
    throw new Error(data?.error?.message || `ImgBB upload failed (${response.status})`);
  }
  return data.data.url;
}

module.exports = { uploadImageToImgBB };
