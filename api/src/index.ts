import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';

import { metrics } from './routes/metrics';
import { plans } from './routes/plans';
import { subscriptions } from './routes/subscriptions';
import { settings } from './routes/settings';
import { cron } from './routes/cron';

const app = new Hono();
const v1 = new Hono();

// browsers may only call us from our own frontend; server-to-server calls
// (curl, the cron scheduler) don't send an Origin and are unaffected by CORS
app.use('/api/*', cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:3000' }));

// one central net for uncaught throws (Resend down, DB hiccup): log the real
// error server-side, hand the caller clean JSON instead of a stack trace
app.onError((err, c) => {
    console.error(`${c.req.method} ${c.req.path}:`, err);
    return c.json({ error: 'internal error' }, 500);
});

// creator view
v1.route('/metrics', metrics);

// subscriber view
v1.route('/v_plans', plans);
v1.route('/v_subscriptions', subscriptions);

v1.route('/settings', settings);

// machine view (scheduler only)
v1.route('/cron', cron);

app.route('/api/v1', v1);

// hosts (Railway, Render, …) inject PORT; 3001 is the local fallback
serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3001) }, (info) => {
    console.log(`listening on http://localhost:${info.port}`);
});
