-- Salary flow (SPEC §7, phase 4). When a plan closes, what happened to its
-- leftover day-to-day money is noted on it; a new plan that took the leftover
-- into its Buffer records it as carry_in (its budget = salary + carry_in).

alter table public.plans
  add column leftover        numeric(14,2),
  add column leftover_action text,
  add column carry_in        numeric(14,2) not null default 0,
  add constraint plans_leftover_positive check (leftover is null or leftover > 0),
  add constraint plans_leftover_action check (leftover_action in ('savings', 'buffer', 'ignore')),
  add constraint plans_leftover_pair check ((leftover is null) = (leftover_action is null)),
  add constraint plans_carry_in_nonneg check (carry_in >= 0);
