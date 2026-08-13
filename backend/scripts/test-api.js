async function test() {
  try {
    const res = await fetch('http://localhost:3001/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playlistUrl: 'https://www.youtube.com/watch?v=4lnb75M9YRo' })
    });
    
    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Body:', text);
  } catch (err) {
    console.error(err);
  }
}
test();
