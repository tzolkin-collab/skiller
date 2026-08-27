import youtubedl from 'youtube-dl-exec';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { PassThrough } from 'stream';

// Set the path to the statically linked ffmpeg binary
ffmpeg.setFfmpegPath(ffmpegStatic as string);

// Cache stream URLs for a short time to avoid running yt-dlp on every frame request
const streamUrlCache = new Map<string, { url: string; expires: number }>();

async function getStreamUrl(videoId: string): Promise<string | null> {
  const now = Date.now();
  const cached = streamUrlCache.get(videoId);
  if (cached && cached.expires > now) {
    return cached.url;
  }

  const url = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const rawInfo = await youtubedl(url, {
      dumpJson: true,
      noWarnings: true,
      format: 'worstvideo'
    });

    const info = typeof rawInfo === 'string' ? JSON.parse(rawInfo) : rawInfo;
    const streamUrl = info.url;

    if (streamUrl) {
      // Cache for 1 hour since YouTube streams eventually expire
      streamUrlCache.set(videoId, { url: streamUrl, expires: now + 3600 * 1000 });
      return streamUrl;
    }
  } catch (error) {
    console.error(`[Renderer] yt-dlp error for ${videoId}:`, error);
  }
  return null;
}

export async function getFrameStream(videoId: string, timeInSeconds: number): Promise<NodeJS.ReadableStream | null> {
  const streamUrl = await getStreamUrl(videoId);
  if (!streamUrl) return null;

  const passthrough = new PassThrough();

  ffmpeg(streamUrl)
    .seekInput(timeInSeconds)
    .outputOptions([
      '-vframes 1',
      '-q:v 2',
      '-f image2pipe',
      '-vcodec mjpeg'
    ])
    .on('error', (err) => {
      console.error(`[Renderer] FFmpeg error extracting frame at ${timeInSeconds}s for ${videoId}:`, err);
      if (!passthrough.destroyed) {
        passthrough.end();
      }
    })
    .pipe(passthrough);

  return passthrough;
}
