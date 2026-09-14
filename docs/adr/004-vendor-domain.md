# ADR 004: Vendor Domain Foundation

## Status

Accepted for Phase 3A.

## Context

Wedding Budget IL needs a supplier management foundation that fits the existing Wedding Workspace, subscription, expenses and payments model. Phase 3A is database foundation only. It does not introduce a vendor UI, realtime flows, document management, payment redesign, planned-vs-actual budgeting, seating, timeline or a new subscription system.

## Decision

`public.vendors` represents an independent supplier or business inside a Wedding Workspace. A vendor can exist without any linked expenses, and a vendor can be linked to one or more expenses.

`public.expenses` remains the source of truth for committed or agreed costs. `public.expense_payments` remains the source of truth for paid amounts. The vendor record stores only `initial_quote`, which is an early quote and not a committed price.

The relationship is one-to-many:

- One vendor can be linked to many expenses.
- One expense can be linked to zero or one vendor.
- Deleting a vendor unlinks related expenses through `expenses.vendor_id = null`.
- Deleting a vendor never deletes expenses or expense payments.

No backfill is performed. Existing expenses stay intact with `vendor_id = null`.

## Capability Model

Vendor access uses the existing workspace capability model:

- `vendors_view` allows reading vendors.
- `vendors_edit` plus `private.can_edit_event(event_id)` allows creating, updating and deleting vendors.
- Linking an expense to a vendor requires both `expenses_edit` and `vendors_edit`.

Owner and admin access is derived through the existing helper functions. Workspace roles inherit access from `private.workspace_role_capabilities`.

Trial active and Premium active workspaces can manage vendors. Expired workspaces are read only through `private.can_edit_event(event_id)`: users with `vendors_view` can still read vendors, but create/update/delete is blocked.

Vendors are not Premium-only.

## Financial Privacy

Phase 3A does not expose committed, paid or remaining totals through a vendor RPC or view. Those values require expense and payment capabilities and should be designed in a later phase.

`initial_quote` belongs to the vendor domain. Committed cost belongs to expenses. Paid amount belongs to expense payments.

## Audit

`public.vendor_events` stores minimal audit events for vendor CRUD and expense link/unlink actions:

- `vendor_created`
- `vendor_updated`
- `vendor_deleted`
- `expense_linked`
- `expense_unlinked`

The audit table stores identifiers, action metadata and limited transition details. It does not store phone numbers, emails, WhatsApp numbers, notes, tokens, secrets or full vendor snapshots. It intentionally does not use a foreign key to `public.vendors` so vendor deletion does not erase vendor history.

## Consequences

The database can enforce tenant-safe vendor ownership and cross-event link prevention before any UI is built. Phase 3B can choose the UI shape without changing the financial source-of-truth model.

The vendor list can later display financial summaries only after checking the appropriate expense/payment capabilities.

## Not In Phase 3A

- Vendor UI
- Vendor documents
- Payment redesign
- Planned vs actual
- Realtime
- Seating or timeline features
- Automatic vendor creation from existing expenses
- Automatic category synchronization between vendors and expenses
- New subscription model
