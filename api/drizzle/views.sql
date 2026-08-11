-- Current-state views over the append-only `events` log (CQRS read side).
--
-- Goldsky only ever INSERTs into `events`. Nothing stores current state, because
-- current state is a fold over the log: for each entity, take its newest event.
-- `DISTINCT ON (key) ... ORDER BY key, block_number DESC, log_index DESC` is that
-- fold — log_index breaks ties when two events land in the same block.
--
-- Run after `drizzle-kit migrate` (the migrations create `events`; Drizzle only
-- declares these views as `.existing()`, it does not create them).

-- ---- PLANS ---- //
-- Three independent folds, because a plan's fields change at different rates:
--   base   — name/merchant, written once by PlanCreated and never again
--   config — price/interval, replaced by every PlanUpdated
--   status — active flag, only exists once PlanStatusChanged has fired
-- LEFT JOIN + COALESCE(active, true): a plan nobody has ever toggled is active,
-- matching the contract, where `active` is set true at creation.
CREATE OR REPLACE VIEW v_plans AS
WITH base AS (
    SELECT DISTINCT ON (plan_id) plan_id, merchant, name
    FROM events
    WHERE event_type = 'PlanCreated'
    ORDER BY plan_id, block_number DESC, log_index DESC
),
config AS (
    SELECT DISTINCT ON (plan_id) plan_id, price, "interval"
    FROM events
    WHERE event_type = ANY (ARRAY['PlanCreated', 'PlanUpdated'])
    ORDER BY plan_id, block_number DESC, log_index DESC
),
status AS (
    SELECT DISTINCT ON (plan_id) plan_id, active
    FROM events
    WHERE event_type = 'PlanStatusChanged'
    ORDER BY plan_id, block_number DESC, log_index DESC
)
SELECT
    b.plan_id,
    b.merchant,
    b.name,
    c.price,
    c."interval",
    COALESCE(s.active, true) AS active
FROM base b
JOIN config c USING (plan_id)
LEFT JOIN status s USING (plan_id);

-- ---- SUBSCRIPTIONS ---- //
-- Two folds over different event sets, and the difference between them is the point:
--   paid   — newest Subscribed/Renewed only, since those are the events that move
--            expires_at. Cancelled carries no expiry, so it must not be in this set.
--   latest — newest of ALL three, so `cancelled` = "is the most recent thing that
--            happened to this sub a Cancelled?". Renewing after cancelling flips it
--            back to false on its own; no un-cancel bookkeeping needed.
-- There is deliberately no `active` column — active-ness is derived at query time
-- (expires_at > now() AND NOT cancelled), because a lapse emits no event and any
-- stored flag would silently go stale.
CREATE OR REPLACE VIEW v_subscriptions AS
WITH paid AS (
    SELECT DISTINCT ON (sub_id) sub_id, subscriber, plan_id, expires_at
    FROM events
    WHERE event_type = ANY (ARRAY['Subscribed', 'Renewed'])
    ORDER BY sub_id, block_number DESC, log_index DESC
),
latest AS (
    SELECT DISTINCT ON (sub_id) sub_id, event_type
    FROM events
    WHERE event_type = ANY (ARRAY['Subscribed', 'Renewed', 'Cancelled'])
    ORDER BY sub_id, block_number DESC, log_index DESC
)
SELECT
    p.sub_id,
    p.subscriber,
    p.plan_id,
    p.expires_at,
    l.event_type = 'Cancelled' AS cancelled
FROM paid p
JOIN latest l USING (sub_id);
