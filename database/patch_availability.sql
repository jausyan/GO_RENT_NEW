-- =====================================================================
-- GO-RENT — Item availability patch
-- Adds get_item_availability() so the frontend can show real-time
-- available stock for a chosen date range (accounting for approved
-- orders that overlap that period).
-- =====================================================================

-- Returns one row per active item with how many units are still
-- rentable during [p_borrow_date, p_return_date].
-- Overlap condition: existing_borrow <= new_return AND existing_return >= new_borrow
create or replace function public.get_item_availability(
  p_borrow_date date,
  p_return_date date
) returns table(item_id uuid, available_qty integer)
language sql
security invoker
set search_path = public
as $$
  select
    i.id                                               as item_id,
    greatest(0, i.stock - coalesce(rented.qty, 0))::integer as available_qty
  from public.items i
  left join (
    select
      oi.item_id,
      sum(oi.quantity)::integer as qty
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.status = 'approved'
      and o.borrow_date <= p_return_date
      and o.return_date >= p_borrow_date
    group by oi.item_id
  ) rented on rented.item_id = i.id
  where i.is_active = true;
$$;

grant execute on function public.get_item_availability(date, date) to anon, authenticated;
