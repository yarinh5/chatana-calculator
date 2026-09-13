# ADR 003: RSVP Foundation

## Status

Accepted for PHASE 2A.

## Context

The guest model distinguishes between invitation groups and optional personal
members:

- `public.guests` is an invitation group.
- `public.guests.group_size` is the source of truth for invited count.
- `public.guest_members` is optional personal detail.

RSVP must not mutate attendance, gifts, seating, guest members, or the public
guest list model. Existing guests are not backfilled into RSVP rows; a missing
RSVP row is interpreted as `not_sent` with `confirmed_count = null`.

## Decision

RSVP is represented by three new RPC-only tables:

- `public.guest_rsvps`, one row per guest group when RSVP state exists.
- `public.guest_rsvp_links`, public token links stored as SHA-256 hashes only.
- `public.guest_rsvp_events`, append-only audit without raw tokens, hashes,
  email, phone, or other secrets.

The allowed statuses are stored in `public.rsvp_status`:

- `not_sent`
- `sent`
- `awaiting_response`
- `confirmed`
- `declined`
- `partially_confirmed`

The public link flow stores only `token_hash`; the raw random token is generated
from at least 32 random bytes and returned once by the issue/reissue RPC. A
reissue revokes the previous active link in the same transaction before creating
the new one.

## Access Model

Workspace management reads require `rsvp_view`. Workspace writes require
`rsvp_edit` and an editable event subscription. Trial and Premium active events
may use RSVP management; expired subscriptions are read-only. Link revocation is
allowed even when the event is expired, so stale public links can be cleaned up.

Public token RPCs do not use workspace capability checks. They resolve the token
hash, verify the link is active, verify the event subscription is still active,
and return only a minimal public projection. Public submissions can resubmit
while the link remains valid. They update RSVP state only and never touch
guest members, attendance, gifts, or seating.

## Integrity

`group_size` remains authoritative. Database triggers enforce:

- RSVP confirmed counts are nonnegative.
- RSVP confirmed counts cannot exceed `guests.group_size`.
- `confirmed` requires `confirmed_count = group_size`.
- `declined` stores `confirmed_count = 0`.
- `partially_confirmed` requires `0 < confirmed_count < group_size`.
- `not_sent`, `sent`, and `awaiting_response` require `confirmed_count = null`.
- `guests.group_size` cannot be reduced below existing guest members or RSVP
  confirmed count.

## Security

The RSVP tables enable RLS and revoke direct access from `PUBLIC`, `anon`, and
`authenticated`. Application access goes through `SECURITY DEFINER` RPCs with
fixed `search_path` and explicit grants. Public token RPCs are the only RSVP
functions granted to `anon`.

No Realtime publication is added in PHASE 2A.
