export async function getPlaylistVideos(playlistId: string) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('YOUTUBE_API_KEY is missing');

  const videos: { videoId: string; title: string; description: string; publishedAt: string; thumbnailUrl: string }[] = [];
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
        const title = item.snippet.title;
        // Ignore private or deleted videos from the playlist
        if (title === 'Private video' || title === 'Deleted video') continue;

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
  const channelId = item.snippet.channelId;
  let channelImageUrl = null;

  if (channelId) {
    try {
      const channelRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${apiKey}`);
      if (channelRes.ok) {
        const channelData = await channelRes.json();
        if (channelData.items && channelData.items.length > 0) {
          channelImageUrl = channelData.items[0].snippet.thumbnails?.default?.url || channelData.items[0].snippet.thumbnails?.high?.url || null;
        }
      }
    } catch (e) {
      console.warn('Failed to fetch channel image:', e);
    }
  }

  return {
    playlistTitle: item.snippet.title,
    channelName: item.snippet.channelTitle,
    channelId,
    channelImageUrl
  };
}

export function extractPlaylistId(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    const listId = parsedUrl.searchParams.get('list');
    if (listId) return listId;
    
    // Fallback regex
    const match = url.match(/[?&]list=([^#&?]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function extractVideoId(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname === 'youtu.be') {
      return parsedUrl.pathname.slice(1).split('?')[0]; // Remove query params if any
    }
    if (parsedUrl.pathname.startsWith('/shorts/')) {
      return parsedUrl.pathname.split('/')[2];
    }
    if (parsedUrl.pathname.startsWith('/live/')) {
      return parsedUrl.pathname.split('/')[2];
    }
    const v = parsedUrl.searchParams.get('v');
    if (v) return v;
  } catch {
    // Ignore URL parse error and fall through to regex
  }

  // Regex fallback for edge cases
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([^"&?/\s]{11})/);
  return match ? match[1] : null;
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
  if (!data.items || data.items.length === 0) return null;
  
  const item = data.items[0];
  const channelId = item.snippet.channelId;
  let channelImageUrl = null;

  if (channelId) {
    try {
      const channelRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${apiKey}`);
      if (channelRes.ok) {
        const channelData = await channelRes.json();
        if (channelData.items && channelData.items.length > 0) {
          channelImageUrl = channelData.items[0].snippet.thumbnails?.default?.url || channelData.items[0].snippet.thumbnails?.high?.url || null;
        }
      }
    } catch (e) {
      console.warn('Failed to fetch channel image:', e);
    }
  }

  return {
    videoId: item.id,
    title: item.snippet.title,
    description: item.snippet.description,
    publishedAt: item.snippet.publishedAt,
    thumbnailUrl: item.snippet.thumbnails?.maxres?.url || item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url || '',
    channelName: item.snippet.channelTitle,
    channelId,
    channelImageUrl
  };
}
