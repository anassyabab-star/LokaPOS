-- ============================================================================
-- Bestsellers ranking, computed in the database.
--
-- /api/public/catalog used to pull `order_items` and tally quantities in JS.
-- PostgREST caps a response at 1,000 rows, so on 8,000+ item rows the "top
-- sellers" were whichever 1,000 rows came back — the ranking was arbitrary,
-- and it shipped ~65 KB across the network on every menu load.
--
-- Aggregate functions are disabled on this project (PGRST123), so the grouping
-- lives here instead. The route falls back to a paged scan when this function
-- is absent, so applying the migration is an improvement, not a prerequisite.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_bestsellers(
  p_since timestamptz DEFAULT (now() - interval '90 days'),
  p_limit integer DEFAULT 24
)
RETURNS TABLE (product_id uuid, total_qty bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT oi.product_id, SUM(COALESCE(oi.qty, 0))::bigint AS total_qty
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.product_id IS NOT NULL
    AND oi.created_at >= p_since
    AND o.status <> 'cancelled'
  GROUP BY oi.product_id
  HAVING SUM(COALESCE(oi.qty, 0)) > 0
  ORDER BY total_qty DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200));
$$;

REVOKE ALL ON FUNCTION public.get_bestsellers(timestamptz, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_bestsellers(timestamptz, integer) TO service_role;

-- Makes the window filter and the join cheap.
CREATE INDEX IF NOT EXISTS order_items_created_at_product_idx
  ON public.order_items (created_at DESC, product_id);
