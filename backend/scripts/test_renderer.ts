import youtubedl from 'youtube-dl-exec';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

console.log("ffmpeg path:", ffmpegStatic);
ffmpeg.setFfmpegPath(ffmpegStatic as string);

async function test() {
  const url = 'https://www.youtube.com/watch?v=2eWuYf-aZE4'; // A valid test video
  console.log("Getting video info...");
  const rawInfo = await youtubedl(url, {
    dumpJson: true,
    noWarnings: true,
    format: 'worstvideo'
  });
  
  // youtubedl returns a parsed object if dumpJson is true, or sometimes a string that needs parsing
  const info = typeof rawInfo === 'string' ? JSON.parse(rawInfo) : rawInfo;
  const streamUrl = info.url;
  const duration = info.duration;
  
  console.log("Stream URL:", streamUrl);
  console.log("Duration:", duration);
  
  const interval = 10;
  const totalFrames = Math.ceil(duration / interval);
  const cols = 5;
  const rows = Math.ceil(totalFrames / cols);
  
  console.log(`Will generate ${cols}x${rows} tile`);
  
  await new Promise((resolve, reject) => {
    ffmpeg(streamUrl)
      .outputOptions([
        `-vf select='not(mod(t,${interval}))',scale=160:-1,tile=${cols}x${rows}`,
        '-frames:v 1',
        '-q:v 2'
      ])
      .output('test_spritesheet.jpg')
      .on('end', resolve)
      .on('error', (err, stdout, stderr) => {
        console.error("FFmpeg error:", err);
        console.error(stderr);
        reject(err);
      })
      .run();
  });
  
  console.log("Done!");
}

test().catch(console.error);
