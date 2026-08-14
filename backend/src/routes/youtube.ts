import { Hono } from 'hono';
import ytSearch from 'yt-search';

const youtubeRouter = new Hono();

// Helper to format views like '1.2M views'
function formatViews(views: number): string {
  if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M views`;
  if (views >= 1000) return `${(views / 1000).toFixed(1)}K views`;
  return `${views} views`;
}

youtubeRouter.get('/search', async (c) => {
  const query = c.req.query('q') || 'AI Agent Tutorial';
  const pageStr = c.req.query('page') || '1';
  
  try {
    // yt-search doesn't have true pagination, so we append a randomizing string or the page number
    // to get slightly different results if we want endless scroll, though query modification is best we can do.
    const searchString = pageStr !== '1' ? `${query} part ${pageStr}` : query;
    const [searchResult, shortsResult] = await Promise.all([
      ytSearch(searchString),
      ytSearch({ query: searchString + ' shorts', sp: 'EgIYAQ%3D%3D' })
    ]);
    
    // Separate into videos and shorts based on duration
    const videos = [];
    
    for (const item of searchResult.videos) {
      if (item.seconds >= 65) {
        videos.push(item);
      }
    }

    const shorts = [];
    for (const item of shortsResult.videos) {
      if (item.seconds < 65) {
        shorts.push(item);
      }
    }
    
    // Fallback if main search had some shorts that are relevant
    if (shorts.length < 8) {
      for (const item of searchResult.videos) {
        if (item.seconds < 65 && !shorts.some(s => s.videoId === item.videoId)) {
          shorts.push(item);
        }
      }
    }

    // Secondary fallback: do a broad search just to fill the shorts shelf
    if (shorts.length < 8) {
      const broadShorts = await ytSearch({ query: 'youtube shorts ' + query.split(' ')[0], sp: 'EgIYAQ%3D%3D' });
      for (const item of broadShorts.videos) {
        if (item.seconds < 65 && !shorts.some(s => s.videoId === item.videoId)) {
          shorts.push(item);
          if (shorts.length >= 8) break;
        }
      }
    }
    
    return c.json({
      videos: videos.slice(0, 16).map(v => ({
        id: v.videoId,
        title: v.title,
        channel: v.author.name,
        channelAvatar: "", // Fallback to initial
        views: formatViews(v.views),
        timeAgo: v.ago,
        duration: v.timestamp
      })),
      shorts: shorts.slice(0, 8).map(s => ({
        id: s.videoId,
        title: s.title,
        channel: s.author.name,
        views: formatViews(s.views),
        timeAgo: s.ago
      }))
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
    const video = await ytSearch({ videoId });
    if (!video) return c.json({ error: 'Video not found' }, 404);

    return c.json({
      id: video.videoId,
      title: video.title,
      channel: video.author.name,
      channelAvatar: video.author.user_url,
      views: formatViews(video.views),
      description: video.description,
      duration: video.timestamp,
      url: video.url,
      uploadDate: video.uploadDate,
    });
  } catch (err: unknown) {
    console.error('YouTube video fetch failed:', err);
    return c.json({ error: 'YouTube video fetch failed' }, 500);
  }
});

export { youtubeRouter };
