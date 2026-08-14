import { YoutubeTranscript } from 'youtube-transcript';

export async function getVideoTranscript(videoId: string): Promise<string> {
  let lastError: unknown;
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(videoId);
      return transcript.map(t => {
        const sec = Math.floor(t.offset / 1000);
        return `[${sec}s] ${t.text.replace(/\n/g, ' ')}`;
      }).join('\n');
    } catch (error) {
      lastError = error;
      console.warn(`Transcript fetch attempt ${attempt} failed for video ${videoId}:`, error);
      
      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const backoffMs = Math.pow(2, attempt - 1) * 1000;
        await new Promise(res => setTimeout(res, backoffMs));
      }
    }
  }

  console.error(`All ${maxRetries} transcript fetch attempts failed for video ${videoId}.`);
  throw new Error(`Transcript fetch failed after ${maxRetries} attempts: ${lastError}`);
}
