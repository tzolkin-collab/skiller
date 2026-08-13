import { YoutubeTranscript } from 'youtube-transcript';

export async function getVideoTranscript(videoId: string): Promise<string> {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    return transcript.map(t => {
      const sec = Math.floor(t.offset / 1000);
      return `[${sec}s] ${t.text.replace(/\n/g, ' ')}`;
    }).join('\n');
  } catch (error) {
    console.error(`Failed to fetch transcript for video ${videoId}:`, error);
    throw new Error(`Transcript fetch failed: ${error}`);
  }
}
