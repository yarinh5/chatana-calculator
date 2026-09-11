# ADR 002: Wedding Workspace Permissions

## Status

Accepted for Phase 6A implementation.

## Context

Wedding Budget IL already uses `public.events` as the practical wedding workspace. Existing budget, guest, subscription, admin, and trial/premium flows are keyed by `event_id`, and `events.owner_id` is the current ownership source of truth.

Phase 6A adds the database foundation for workspace sharing and capability-based authorization. It does not open existing budget or guest data to collaborators yet.

## Decision

`public.events` is the Wedding Workspace. `events.owner_id` remains the source of truth for ownership.

Owners are not duplicated as rows in `public.event_members`. Membership rows represent collaborators only.

`public.app_role` remains a system role enum for `admin` and `user`. Workspace roles are a separate domain enum and are not added to `app_role`.

`public.subscriptions` continues to be scoped to `event_id`. Accepting an invitation adds access to another workspace and does not create a second subscription for that shared workspace.

Every new user still receives a personal event and trial through `handle_new_user`. Joining another event through an invitation does not delete, merge, or transfer that personal event.

Phase 6A does not implement ownership transfer, custom roles, workspace selector UI, email delivery, RSVP, seating, vendors, or realtime membership updates.

Capability mapping is centralized in the database. Owner and active Admin receive all capabilities through helper logic, not through duplicated mapping rows.

Phase 6A intentionally does not change the policies of `events`, `subscriptions`, `expenses`, `expense_payments`, `guests`, `guest_members`, or `guest_settings` to use workspace capabilities. Collaborators therefore do not yet receive read access to core event data. This is the secure default until Phase 6B connects product surfaces to the capability model after review.

## Capability Boundaries

`editor` receives all view/edit capabilities except `workspace_manage`.

`viewer` receives `event_view` and all view capabilities, without edit capabilities and without `workspace_manage`.

`guest_manager` receives event viewing plus guest, RSVP, seating, and wedding-day capabilities. It does not receive finance, payments, gifts, documents, or workspace management capabilities.

`event_manager` receives event viewing plus vendors, guests, RSVP, seating, documents, and wedding-day capabilities. It does not receive budget, expenses, payments, gifts, or workspace management capabilities.

Gifts and attendance currently live as columns on `public.guests`. Before Guest Manager access is opened in Phase 6B, the app must add field-level enforcement through triggers or a safe projection so users with guest capabilities cannot read or mutate financial gift fields or attendance fields without the matching capability.

## Consequences

Workspace sharing can be reviewed and tested independently from UI changes.

Invitation tokens are stored only as hashes. Raw tokens are returned once by creation/reissue RPCs and are never persisted in tables or audit details.

Expired workspaces remain read-only for commercial edits, but owners and admins can still revoke invitations and remove members for security.

Admin system access remains separate from a user's personal workspace list.
