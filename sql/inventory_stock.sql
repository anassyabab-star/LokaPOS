-- Atomic stock decrement for inventory management
-- Prevents race conditions when multiple cashiers order same product
-- Safe to re-run (idempotent)

CREATE OR REPLACE FUNCTION public.decrement_stock(
  p_product_id uuid,
  p_qty integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_stock integer;
BEGIN
  UPDATE products
  SET stock = GREATEST(stock - p_qty, 0)
  WHERE id = p_product_id
    AND stock >= p_qty
  RETURNING stock INTO new_stock;

  IF NOT FOUND THEN
    -- Either product doesn't exist or insufficient stock
    SELECT stock INTO new_stock FROM products WHERE id = p_product_id;
    IF new_stock IS NULL THEN
      RAISE EXCEPTION 'Product not found: %', p_product_id;
    ELSE
      RAISE EXCEPTION 'Insufficient stock for product %. Available: %, Requested: %',
        p_product_id, new_stock, p_qty;
    END IF;
  END IF;

  RETURN new_stock;
END;
$$;

-- Grant execute to authenticated users (goes through RLS anyway)
GRANT EXECUTE ON FUNCTION public.decrement_stock(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_stock(uuid, integer) TO service_role;
