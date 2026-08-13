const { YoutubeTranscript } = require('youtube-transcript');

async function main() {
  // video do Viktor Kav sobre o Muse Glimmer? Um vídeo qualquer.
  try {
    const transcript = await YoutubeTranscript.fetchTranscript('jNQXAC9IVRw'); // 'Me at the zoo'
    console.log(transcript.slice(0, 3));
  } catch(e) {
    const transcript2 = await YoutubeTranscript.fetchTranscript('dQw4w9WgXcQ'); // Rick astley
    console.log(transcript2.slice(0, 3));
  }
}
main();
