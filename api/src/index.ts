import { serve } from '@hono/node-server';

import { app } from './app';

// hosts (Railway, Render, …) inject PORT; 3001 is the local fallback
serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3001) }, (info) => {
    console.log(`listening on http://localhost:${info.port}`);
});
