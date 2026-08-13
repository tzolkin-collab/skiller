export async function getPlaylistVideos(playlistId: string) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('YOUTUBE_API_KEY is missing');

  let videos: { videoId: string; title: string; description: string; publishedAt: string; thumbnailUrl: string }[] = [];
  let nextPageToken = '';
  
  do {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlistId}&key=${apiKey}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`);
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`YouTube API Error: ${res.status} - ${errorText}`);
    }
    
    const data = await res.json();
    
    for (const item of data.items) {
      if (item.snippet.resourceId.kind === 'youtube#video') {
        videos.push({
          videoId: item.snippet.resourceId.videoId,
          title: item.snippet.title,
          description: item.snippet.description,
          publishedAt: item.snippet.publishedAt,
          thumbnailUrl: item.snippet.thumbnails?.maxres?.url || item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url || ''
        });
      }
    }
    
    nextPageToken = data.nextPageToken || '';
  } while (nextPageToken);
  
  return videos;
}

export async function getPlaylistDetails(playlistId: string) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('YOUTUBE_API_KEY is missing');

  const res = await fetch(`https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}&key=${apiKey}`);
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`YouTube API Error: ${res.status} - ${errorText}`);
  }
  
  const data = await res.json();
  if (data.items.length === 0) throw new Error('Playlist not found');
  
  const item = data.items[0];
  return {
    playlistTitle: item.snippet.title,
    channelName: item.snippet.channelTitle,
    channelId: item.snippet.channelId
  };
}

export function extractPlaylistId(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.searchParams.get('list');
  } catch {
    return null;
  }
}

export function extractVideoId(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname === 'youtu.be') {
      return parsedUrl.pathname.slice(1);
    }
    return parsedUrl.searchParams.get('v');
  } catch {
    return null;
  }
}

export async function getVideoDetails(videoId: string) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('YOUTUBE_API_KEY is missing');

  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${apiKey}`);
  
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`YouTube API Error: ${res.status} - ${errorText}`);
  }
  
  const data = await res.json();
  if (!data.items || data.items.length === 0) throw new Error('Video not found');
  
  const item = data.items[0];
  return {
    videoId: item.id,
    title: item.snippet.title,
    description: item.snippet.description,
    publishedAt: item.snippet.publishedAt,
    thumbnailUrl: item.snippet.thumbnails?.maxres?.url || item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url || '',
    channelName: item.snippet.channelTitle,
    channelId: item.snippet.channelId
  };
}
