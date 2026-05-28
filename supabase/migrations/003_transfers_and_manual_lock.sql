-- ============================================================================
-- 003 — Transfer pairing + manual category lock
-- ============================================================================
-- Adds infrastructure so that:
--   1) inter-account transfers can be detected and excluded from KPIs
--   2) any manual categorization is preserved against rule/AI passes
--   3) the source of the current categorization is visible in the UI
-- ============================================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS transfer_id uuid,
  ADD COLUMN IF NOT EXISTS manual_category boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS categorization_source text
    CHECK (categorization_source IS NULL OR categorization_source IN ('rule','ai','manual'));

CREATE INDEX IF NOT EXISTS transactions_transfer_idx
  ON public.transactions (user_id, transfer_id)
  WHERE transfer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS transactions_manual_idx
  ON public.transactions (user_id, manual_category)
  WHERE manual_category = true;

-- ============================================================================
-- get_transaction_stats — KPIs now exclude both transfer-kind AND paired rows
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_transaction_stats(
  p_account_id   uuid    DEFAULT NULL,
  p_category_id  uuid    DEFAULT NULL,
  p_uncategorized boolean DEFAULT false,
  p_type         text    DEFAULT NULL,
  p_search       text    DEFAULT NULL,
  p_from         timestamptz DEFAULT NULL,
  p_to           timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  RETURN (
    WITH filtered AS (
      SELECT
        t.amount,
        c.kind,
        t.category_id,
        t.transfer_id,
        c.name  AS cat_name,
        c.color AS cat_color
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = v_user_id
        AND (p_account_id    IS NULL OR t.account_id = p_account_id)
        AND (
          CASE
            WHEN p_uncategorized           THEN t.category_id IS NULL
            WHEN p_category_id IS NOT NULL THEN t.category_id = p_category_id
            ELSE TRUE
          END
        )
        AND (p_type IS NULL
             OR (p_type = 'credit' AND t.amount > 0)
             OR (p_type = 'debit'  AND t.amount < 0))
        AND (p_search IS NULL OR t.description ILIKE '%' || p_search || '%')
        AND (p_from   IS NULL OR t.booked_at >= p_from)
        AND (p_to     IS NULL OR t.booked_at <= p_to)
    ),
    operational AS (
      SELECT * FROM filtered
      WHERE (kind IS DISTINCT FROM 'transfer')
        AND transfer_id IS NULL
    ),
    kpis AS (
      SELECT
        COALESCE(SUM(CASE WHEN amount < 0 THEN amount END), 0) AS total_expenses,
        COALESCE(SUM(CASE WHEN amount > 0 THEN amount END), 0) AS total_income,
        COUNT(*) FILTER (WHERE amount < 0) AS count_expenses,
        COUNT(*) FILTER (WHERE amount > 0) AS count_income
      FROM operational
    ),
    totals AS (
      SELECT COUNT(*) AS total_count FROM filtered
    ),
    cat_agg AS (
      SELECT
        COALESCE(cat_name,  'Non catégorisé') AS name,
        COALESCE(cat_color, '#6b7280')        AS color,
        SUM(amount)                            AS total,
        COUNT(*)                               AS cnt
      FROM operational
      WHERE amount < 0
      GROUP BY cat_name, cat_color
      ORDER BY SUM(amount) ASC
    )
    SELECT jsonb_build_object(
      'total_expenses',  (SELECT total_expenses  FROM kpis),
      'total_income',    (SELECT total_income    FROM kpis),
      'count_expenses',  (SELECT count_expenses  FROM kpis),
      'count_income',    (SELECT count_income    FROM kpis),
      'total_count',     (SELECT total_count     FROM totals),
      'by_category',     COALESCE((SELECT jsonb_agg(
                           jsonb_build_object(
                             'name',  name,
                             'color', color,
                             'total', total,
                             'count', cnt
                           ) ORDER BY total ASC
                         ) FROM cat_agg), '[]'::jsonb)
    )
  );
END;
$function$;

-- ============================================================================
-- pair_transfers — auto-pair inter-account transfer legs
-- ============================================================================
-- For each unpaired negative-amount tx, finds a positive-amount tx on a
-- different account, ±3 days, amount = -tx.amount. Assigns the same fresh
-- transfer_id to both legs and (unless the row was manually categorized)
-- forces the user's transfer category. Returns the number of PAIRS created.

CREATE OR REPLACE FUNCTION public.pair_transfers(p_user_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id      uuid := COALESCE(p_user_id, auth.uid());
  v_transfer_cat uuid;
  v_pairs_made   integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT id INTO v_transfer_cat
  FROM categories
  WHERE user_id = v_user_id
    AND kind = 'transfer'
  ORDER BY name = 'Virements internes' DESC, created_at ASC
  LIMIT 1;

  WITH candidates AS (
    SELECT
      neg.id   AS neg_id,
      (
        SELECT pos.id
        FROM transactions pos
        WHERE pos.user_id = v_user_id
          AND pos.transfer_id IS NULL
          AND pos.account_id <> neg.account_id
          AND pos.amount = -neg.amount
          AND pos.booked_at BETWEEN neg.booked_at - INTERVAL '3 days'
                                AND neg.booked_at + INTERVAL '3 days'
          AND pos.id <> neg.id
        ORDER BY ABS(pos.booked_at - neg.booked_at), pos.created_at
        LIMIT 1
      ) AS pos_id
    FROM transactions neg
    WHERE neg.user_id = v_user_id
      AND neg.transfer_id IS NULL
      AND neg.amount < 0
  ),
  pairs AS (
    SELECT neg_id, pos_id, gen_random_uuid() AS new_tid
    FROM candidates
    WHERE pos_id IS NOT NULL
  ),
  deduped AS (
    SELECT DISTINCT ON (LEAST(neg_id::text, pos_id::text), GREATEST(neg_id::text, pos_id::text))
      neg_id, pos_id, new_tid
    FROM pairs
  ),
  upd AS (
    UPDATE transactions t
    SET transfer_id = d.new_tid,
        category_id = CASE
          WHEN t.manual_category THEN t.category_id
          ELSE v_transfer_cat
        END,
        categorization_source = CASE
          WHEN t.manual_category THEN t.categorization_source
          ELSE 'rule'
        END
    FROM deduped d
    WHERE t.user_id = v_user_id
      AND t.transfer_id IS NULL
      AND (t.id = d.neg_id OR t.id = d.pos_id)
    RETURNING t.id, d.new_tid
  )
  SELECT COUNT(DISTINCT new_tid)::int INTO v_pairs_made FROM upd;

  RETURN COALESCE(v_pairs_made, 0);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.pair_transfers(uuid) TO authenticated;
