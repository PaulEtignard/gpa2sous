/**
 * Hand-written DB types. Replace with generated types from
 * `npx supabase gen types typescript --project-id <id>` when ready.
 */

export interface Account {
  id: string;
  user_id: string;
  name: string;
  bank: string | null;
  currency: string;
  initial_balance: number;
  created_at: string;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  color: string;
  icon: string | null;
  kind: "income" | "expense" | "transfer";
  parent_id: string | null;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string | null;
  booked_at: string;
  description: string;
  amount: number;
  currency: string;
  raw_label: string | null;
  source: "csv" | "pdf" | "manual" | "bridge" | "powens";
  external_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface RuleRow {
  id: string;
  user_id: string;
  pattern: string;
  category_id: string;
  priority: number;
  created_at: string;
}

export interface Budget {
  id: string;
  user_id: string;
  category_id: string;
  monthly_amount: number;
  created_at: string;
}

export interface ImportBatch {
  id: string;
  user_id: string;
  account_id: string;
  filename: string;
  row_count: number;
  inserted_count: number;
  duplicate_count: number;
  created_at: string;
}
