async function forceRetry() {
  try {
    const res = await fetch('http://localhost:3001/api/skills/669976e7-cd07-479f-98e8-4f6d708849d8/retry', {
      method: 'POST'
    });
    console.log(await res.text());
  } catch(e) {
    console.error(e);
  }
}
forceRetry();
