# ADR 001: Advanced Guest Model Foundation

## Status

Accepted for Phase 1A.

## Context

Wedding Budget IL already stores guest rows in `public.guests`. Existing UI, imports, totals, wedding-day attendance, and gift tracking depend on that table and on `group_size`.

This phase adds infrastructure for richer guest details without changing the current product behavior or inventing future RSVP, seating, or gift-ledger models.

## Decision

`public.guests` remains the domain-level Invitation Group table. A row represents the invited group or household as managed by the current product.

`public.guest_members` is an optional child table for personal details inside an invitation group. It is not a replacement for `public.guests`, and existing groups do not need member rows to keep working.

`group_size` remains the source of truth for invited count.

Confirmed count and RSVP status are deferred to Phase 2. This phase does not add `rsvp_status`, confirmation columns, public RSVP tokens, or public link infrastructure.

Seating assignment is deferred to Phase 7. This phase does not add table assignment columns or seating relationships.

Gift data stays on `public.guests` until Phase 9. This phase does not move `gift_amount` or `payment_method` to member-level records.

No backfill invents people. Existing invitation groups are preserved as-is, and `guest_members` rows are created only when future product flows explicitly collect personal details.

## Consequences

Existing Guest CRUD, imports, exports, dashboard totals, gift handling, and attendance behavior continue to use `public.guests`.

Future phases can add RSVP and seating on top of this foundation without renaming or replacing the existing guest table.
