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

/**
 * Resolve o channelId a partir de qualquer formato de URL de canal do YouTube:
 * - youtube.com/channel/UCxxx   → id direto
 * - youtube.com/@handle         → forHandle API
 * - youtube.com/c/name          → forUsername API (legado)
 * - youtube.com/user/name       → forUsername API (legado)
 */
export async function resolveChannelId(url: string): Promise<string | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('YOUTUBE_API_KEY is missing');

  let p: URL;
  try { p = new URL(url); } catch { return null; }

  const parts = p.pathname.split('/').filter(Boolean);

  if (parts[0] === 'channel') return parts[1] ?? null;

  const handle = parts[0]?.startsWith('@') ? parts[0].slice(1) : null;
  if (handle) {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(handle)}&key=${apiKey}`);
    if (res.ok) {
      const data = await res.json();
      return data.items?.[0]?.id ?? null;
    }
  }

  const username = (parts[0] === 'c' || parts[0] === 'user') ? parts[1] : null;
  if (username) {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=${encodeURIComponent(username)}&key=${apiKey}`);
    if (res.ok) {
      const data = await res.json();
      return data.items?.[0]?.id ?? null;
    }
  }

  return null;
}

export interface ChannelVideoResult {
  videoId: string;
  title: string;
  publishedAt: string;
  url: string;
}

export interface SearchChannelFilters {
  /** ISO 8601 (ex.: "2024-01-01T00:00:00Z") — ignora vídeos mais antigos */
  publishedAfter?: string;
}

/**
 * Busca vídeos dentro de um canal por palavra-chave.
 *
 * Usa `search.list` (100 quota units por chamada). O YouTube ordena por
 * relevância, não por data — `publishedAfter` corta pelo período mas não
 * garante ordenação cronológica.
 */
export async function searchChannelVideos(
  channelId: string,
  query: string,
  maxResults = 20,
  filters: SearchChannelFilters = {}
): Promise<ChannelVideoResult[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('YOUTUBE_API_KEY is missing');

  const params = new URLSearchParams({
    part: 'snippet',
    channelId,
    q: query,
    type: 'video',
    maxResults: String(Math.min(maxResults, 50)),
    order: 'relevance',
    key: apiKey,
  });

  if (filters.publishedAfter) params.set('publishedAfter', filters.publishedAfter);

  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`YouTube API Error: ${res.status} - ${errorText}`);
  }

  const data = await res.json();
  return (data.items ?? [])
    .filter((item: { id: { kind: string; videoId?: string } }) => item.id.kind === 'youtube#video' && item.id.videoId)
    .map((item: { id: { videoId: string }; snippet: { title: string; publishedAt: string } }) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      publishedAt: item.snippet.publishedAt,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    }));
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
