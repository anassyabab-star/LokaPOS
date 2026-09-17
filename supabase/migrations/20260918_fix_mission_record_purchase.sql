-- ============================================================================
-- Fix: mission_record_purchase has never recorded a single purchase.
--
-- The function declares RETURNS TABLE (..., cycle_index INTEGER, ...), which
-- makes `cycle_index` a PL/pgSQL output variable. The body then reads
--
--     SELECT COALESCE(MAX(cycle_index), -1) + 1 INTO v_next_cycle
--       FROM mission_progress ...
--
-- where `cycle_index` is also a column of mission_progress, so Postgres raises
-- 42702 "column reference cycle_index is ambiguous" and the whole call fails
-- with a 400.
--
-- lib/missions.ts swallows that: `if (rpcErr) continue;`. So the engine looked
-- healthy, the admin page listed two active missions, and 1,287 paid orders
-- since 27 July produced zero mission_progress rows and zero rewards.
--
-- Fix is to alias the table and qualify every column reference. Behaviour is
-- otherwise unchanged.
--
-- Idempotent: CREATE OR REPLACE.
-- ============================================================================

CREATE OR REPLACE FUNCTION mission_record_purchase (
  p_mission_id  UUID,
  p_customer_id UUID,
  p_order_id    UUID,
  p_order_at    TIMESTAMPTZ,
  p_window_days INTEGER,
  p_threshold   INTEGER,
  p_repeatable  BOOLEAN
) RETURNS TABLE (progress_id UUID, cycle_index INTEGER, completed BOOLEAN, already_counted BOOLEAN)
LANGUAGE plpgsql AS $$
DECLARE
  v_prog       mission_progress;
  v_next_cycle INTEGER;
  v_completed  BOOLEAN := false;
BEGIN
  PERFORM pg_advisory_xact_lock (hashtext (p_customer_id::text || p_mission_id::text));

  -- Idempotency: an order counts at most once per mission.
  INSERT INTO mission_progress_orders (mission_id, customer_id, order_id)
    VALUES (p_mission_id, p_customer_id, p_order_id)
    ON CONFLICT (mission_id, order_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, NULL::INTEGER, false, true;
    RETURN;
  END IF;

  -- Non-repeatable + already completed once → do not open a new cycle.
  IF NOT p_repeatable AND EXISTS (
      SELECT 1 FROM mission_progress mp
      WHERE mp.mission_id = p_mission_id AND mp.customer_id = p_customer_id
        AND mp.status = 'completed'
  ) THEN
    RETURN QUERY SELECT NULL::UUID, NULL::INTEGER, false, false;
    RETURN;
  END IF;

  -- Current in-flight cycle (if any).
  SELECT mp.* INTO v_prog FROM mission_progress mp
    WHERE mp.mission_id = p_mission_id AND mp.customer_id = p_customer_id
      AND mp.status = 'in_progress'
    LIMIT 1;

  IF v_prog.id IS NULL OR p_order_at > v_prog.window_end_at THEN
    IF v_prog.id IS NOT NULL THEN
      UPDATE mission_progress mp SET status = 'expired', updated_at = now ()
        WHERE mp.id = v_prog.id;
    END IF;

    -- The alias is the whole point of this migration: unqualified
    -- `cycle_index` collides with the output parameter of the same name.
    SELECT COALESCE(MAX(mp.cycle_index), -1) + 1 INTO v_next_cycle
      FROM mission_progress mp
      WHERE mp.mission_id = p_mission_id AND mp.customer_id = p_customer_id;

    INSERT INTO mission_progress (
      mission_id, customer_id, cycle_index, window_start_at, window_end_at, count, status
    ) VALUES (
      p_mission_id, p_customer_id, v_next_cycle, p_order_at,
      p_order_at + make_interval (days => p_window_days), 1, 'in_progress'
    ) RETURNING * INTO v_prog;
  ELSE
    UPDATE mission_progress mp
      SET count = mp.count + 1, updated_at = now ()
      WHERE mp.id = v_prog.id
      RETURNING mp.* INTO v_prog;
  END IF;

  UPDATE mission_progress_orders mpo SET progress_id = v_prog.id
    WHERE mpo.mission_id = p_mission_id AND mpo.order_id = p_order_id;

  IF v_prog.count >= p_threshold THEN
    UPDATE mission_progress mp
      SET status = 'completed', completed_at = now (), updated_at = now ()
      WHERE mp.id = v_prog.id;
    v_completed := true;
  END IF;

  RETURN QUERY SELECT v_prog.id, v_prog.cycle_index, v_completed, false;
END;
$$;

REVOKE ALL ON FUNCTION
  mission_record_purchase (UUID, UUID, UUID, TIMESTAMPTZ, INTEGER, INTEGER, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  mission_record_purchase (UUID, UUID, UUID, TIMESTAMPTZ, INTEGER, INTEGER, BOOLEAN)
  TO service_role;
