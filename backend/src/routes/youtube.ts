import { Hono } from 'hono';
import { google } from 'googleapis';

const youtubeRouter = new Hono();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCount(value: number | string | undefined | null, suffix = ''): string {
  if (!value) return `0${suffix}`;
  const v = typeof value === 'string' ? parseInt(value, 10) : value;
  if (isNaN(v)) return `0${suffix}`;
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M${suffix}`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K${suffix}`;
  return `${v}${suffix}`;
}

function parseDuration(iso: string | null | undefined) {
  if (!iso) return { ms: 0, formatted: '0:00' };
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return { ms: 0, formatted: '0:00' };
  
  const h = parseInt(match[1] || '0', 10);
  const m = parseInt(match[2] || '0', 10);
  const s = parseInt(match[3] || '0', 10);
  
  const ms = (h * 3600 + m * 60 + s) * 1000;
  
  const mStr = m.toString().padStart(h > 0 ? 2 : 1, '0');
  const sStr = s.toString().padStart(2, '0');
  
  const formatted = h > 0 ? `${h}:${mStr}:${sStr}` : `${mStr}:${sStr}`;
  return { ms, formatted };
}

function timeAgo(dateString: string | null | undefined) {
  if (!dateString) return 'Unknown';
  const date = new Date(dateString);
  const diffInSeconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  
  const intervals = [
    { label: 'year', seconds: 31536000 },
    { label: 'month', seconds: 2592000 },
    { label: 'day', seconds: 86400 },
    { label: 'hour', seconds: 3600 },
    { label: 'minute', seconds: 60 }
  ];
  
  for (const interval of intervals) {
    const count = Math.floor(diffInSeconds / interval.seconds);
    if (count >= 1) return `${count} ${interval.label}${count > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}

function getYoutubeClient() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY is not defined in environment variables");
  return google.youtube({ version: 'v3', auth: apiKey });
}

/** Fetch channel avatars and subscriber counts in a single batched call (1 quota unit). */
async function fetchChannelInfo(
  yt: ReturnType<typeof getYoutubeClient>,
  channelIds: string[]
): Promise<Map<string, { avatar: string; subscribers: string; subscriberCount: number }>> {
  const map = new Map<string, { avatar: string; subscribers: string; subscriberCount: number }>();
  if (channelIds.length === 0) return map;

  const unique = [...new Set(channelIds)];
  // channels.list accepts up to 50 IDs per call
  const channelResponse = await yt.channels.list({
    part: ['snippet', 'statistics'],
    id: unique,
    maxResults: 50,
  });

  for (const ch of channelResponse.data.items || []) {
    const id = ch.id;
    if (!id) continue;
    map.set(id, {
      avatar: ch.snippet?.thumbnails?.default?.url || '',
      subscribers: formatCount(ch.statistics?.subscriberCount, ' subs'),
      subscriberCount: parseInt(ch.statistics?.subscriberCount || '0', 10),
    });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

youtubeRouter.get('/search', async (c) => {
  const query = c.req.query('q') || 'AI Agent Tutorial';
  const pageStr = c.req.query('page') || '1';
  
  try {
    const yt = getYoutubeClient();
    const searchString = pageStr !== '1' ? `${query} part ${pageStr}` : query;
    
    const searchResponse = await yt.search.list({
      part: ['id', 'snippet'],
      q: searchString,
      type: ['video'],
      maxResults: 35,
    });

    const items = searchResponse.data.items || [];
    const videoIds = items.map(item => item.id?.videoId).filter(Boolean) as string[];

    if (videoIds.length === 0) {
      return c.json({ videos: [], shorts: [] });
    }

    // Fetch video details (duration, views, likes, comments) — 1 quota unit
    const videoResponse = await yt.videos.list({
      part: ['contentDetails', 'statistics', 'snippet'],
      id: videoIds
    });

    const detailedVideos = videoResponse.data.items || [];

    // Collect unique channel IDs for avatar batch
    const channelIds = detailedVideos
      .map(v => v.snippet?.channelId)
      .filter(Boolean) as string[];

    // Fetch channel info (avatars + subscribers) — 1 quota unit
    const channelMap = await fetchChannelInfo(yt, channelIds);

    const videos = [];
    const shorts = [];

    for (const v of detailedVideos) {
      const duration = parseDuration(v.contentDetails?.duration);
      const chId = v.snippet?.channelId || '';
      const chInfo = channelMap.get(chId);
      
      const likes = parseInt(v.statistics?.likeCount || '0', 10);
      const comments = parseInt(v.statistics?.commentCount || '0', 10);
      const views = parseInt(v.statistics?.viewCount || '0', 10);
      
      // Engagement rate = (likes + comments) / views * 100
      const engagement = views > 0 ? ((likes + comments) / views) * 100 : 0;

      const videoObj = {
        id: v.id,
        title: v.snippet?.title || 'Unknown',
        channel: v.snippet?.channelTitle || 'Unknown',
        channelId: chId,
        channelAvatar: chInfo?.avatar || '',
        subscribers: chInfo?.subscribers || '',
        views: formatCount(v.statistics?.viewCount, ' views'),
        viewCount: views,
        likes: formatCount(v.statistics?.likeCount),
        likeCount: likes,
        comments: formatCount(v.statistics?.commentCount),
        commentCount: comments,
        engagement: Math.round(engagement * 100) / 100, // e.g. 4.52%
        timeAgo: timeAgo(v.snippet?.publishedAt),
        duration: duration.formatted,
        _ms: duration.ms
      };

      if (duration.ms >= 65000) {
        videos.push(videoObj);
      } else {
        shorts.push(videoObj);
      }
    }

    return c.json({
      videos: videos.slice(0, 16),
      shorts: shorts.slice(0, 8)
    });
  } catch (err: unknown) {
    console.error('YouTube search failed:', err);
    return c.json({ error: 'YouTube search failed' }, 500);
  }
});

youtubeRouter.get('/suggest', async (c) => {
  const query = c.req.query('q') || '';
  if (!query) return c.json({ suggestions: [] });
  
  try {
    const res = await fetch(`http://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error('Suggest API failed');
    const data = await res.json();
    return c.json({ suggestions: data[1] || [] });
  } catch (err: unknown) {
    console.error('YouTube suggest failed:', err);
    return c.json({ error: 'YouTube suggest failed' }, 500);
  }
});

youtubeRouter.get('/video', async (c) => {
  const videoId = c.req.query('v');
  if (!videoId) return c.json({ error: 'Missing video ID' }, 400);

  try {
    const yt = getYoutubeClient();
    const videoResponse = await yt.videos.list({
      part: ['snippet', 'contentDetails', 'statistics'],
      id: [videoId]
    });

    const video = videoResponse.data.items?.[0];
    if (!video) return c.json({ error: 'Video not found' }, 404);

    // Fetch channel info for this single video
    const chId = video.snippet?.channelId || '';
    const channelMap = await fetchChannelInfo(yt, chId ? [chId] : []);
    const chInfo = channelMap.get(chId);

    const likes = parseInt(video.statistics?.likeCount || '0', 10);
    const comments = parseInt(video.statistics?.commentCount || '0', 10);
    const views = parseInt(video.statistics?.viewCount || '0', 10);
    const engagement = views > 0 ? ((likes + comments) / views) * 100 : 0;

    return c.json({
      id: video.id,
      title: video.snippet?.title || 'Unknown',
      channel: video.snippet?.channelTitle || 'Unknown',
      channelId: chId,
      channelAvatar: chInfo?.avatar || '',
      subscribers: chInfo?.subscribers || '',
      views: formatCount(video.statistics?.viewCount, ' views'),
      viewCount: views,
      likes: formatCount(video.statistics?.likeCount),
      likeCount: likes,
      comments: formatCount(video.statistics?.commentCount),
      commentCount: comments,
      engagement: Math.round(engagement * 100) / 100,
      description: video.snippet?.description || '',
      duration: parseDuration(video.contentDetails?.duration).formatted,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      uploadDate: video.snippet?.publishedAt,
    });
  } catch (err: unknown) {
    console.error('YouTube video fetch failed:', err);
    return c.json({ error: 'YouTube video fetch failed' }, 500);
  }
});

export { youtubeRouter };

