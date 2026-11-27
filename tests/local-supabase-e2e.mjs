import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SB_QA_URL;
const anonKey = process.env.SB_QA_ANON_KEY;
const serviceKey = process.env.SB_QA_SERVICE_KEY;

if (!url || !anonKey || !serviceKey) {
  throw new Error("Local Supabase QA credentials are required");
}

const parsedUrl = new URL(url);
if (
  parsedUrl.protocol !== "http:" ||
  !["localhost", "127.0.0.1", "[::1]"].includes(parsedUrl.hostname)
) {
  throw new Error("QA is restricted to a loopback Supabase instance");
}

const clientOptions = {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
};
const admin = createClient(url, serviceKey, clientOptions);
const createdUsers = [];

function expectSuccess(result, label) {
  assert.equal(result.error, null, `${label}: ${result.error?.message ?? "unknown error"}`);
  return result.data;
}

function expectBlocked(result, label) {
  assert.ok(result.error || result.data === null || result.data?.length === 0, label);
}

async function makeUser(label) {
  const email = `qa-wedding-os-${label}-${randomUUID()}@example.invalid`;
  const password = randomUUID() + randomUUID();
  const created = expectSuccess(
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `QA ${label}` },
    }),
    `create ${label}`,
  );
  createdUsers.push(created.user.id);
  const client = createClient(url, anonKey, clientOptions);
  expectSuccess(await client.auth.signInWithPassword({ email, password }), `sign in ${label}`);
  const event = expectSuccess(
    await client.from("events").select("id").eq("owner_id", created.user.id).single(),
    `event ${label}`,
  );
  return { client, email, eventId: event.id, userId: created.user.id };
}

try {
  const owner = await makeUser("owner");
  const stranger = await makeUser("stranger");
  const ownerRoles = expectSuccess(
    await owner.client.from("user_roles").select("role").eq("user_id", owner.userId),
    "new user roles",
  );
  assert.deepEqual(
    ownerRoles.map((row) => row.role),
    ["user"],
    "new users have no admin exception",
  );

  const guest = expectSuccess(
    await owner.client.rpc("create_workspace_guest", {
      _event_id: owner.eventId,
      _full_name: "QA Guest",
      _group_size: 2,
    }),
    "trial guest create",
  );
  const guestId = guest[0].id;

  for (let i = 0; i < 2; i += 1) {
    expectSuccess(
      await owner.client
        .from("guest_members")
        .insert({ guest_id: guestId, full_name: `QA member ${i}` })
        .select("id")
        .single(),
      `trial guest member ${i + 1}`,
    );
  }
  expectBlocked(
    await owner.client
      .from("guest_members")
      .insert({ guest_id: guestId, full_name: "QA excess member" })
      .select("id")
      .single(),
    "guest member count cannot exceed group size",
  );

  const issuedLink = expectSuccess(
    await owner.client.rpc("issue_guest_rsvp_link", { _guest_id: guestId }),
    "issue trial RSVP link",
  );
  assert.equal(issuedLink.length, 1);
  const publicClient = createClient(url, anonKey, clientOptions);
  expectBlocked(
    await publicClient.from("guest_rsvp_links").select("id"),
    "anonymous direct RSVP link table access blocked",
  );
  const publicView = expectSuccess(
    await publicClient.rpc("get_public_rsvp", { _token: issuedLink[0].token }),
    "anonymous RSVP view",
  );
  assert.equal(publicView[0].group_size, 2);
  expectBlocked(
    await publicClient.rpc("submit_public_rsvp", {
      _token: issuedLink[0].token,
      _confirmed_count: 3,
    }),
    "RSVP cannot exceed group size",
  );
  const submitted = expectSuccess(
    await publicClient.rpc("submit_public_rsvp", {
      _token: issuedLink[0].token,
      _confirmed_count: 1,
    }),
    "anonymous RSVP submit",
  );
  assert.equal(submitted[0].confirmed_count, 1);
  assert.equal(submitted[0].status, "partially_confirmed");
  const publicAfterSubmit = expectSuccess(
    await publicClient.rpc("get_public_rsvp", { _token: issuedLink[0].token }),
    "anonymous RSVP after submit",
  );
  assert.equal(publicAfterSubmit[0].status, "partially_confirmed");
  assert.equal(publicAfterSubmit[0].confirmed_count, 1);
  const ownerRsvp = expectSuccess(
    await owner.client.rpc("list_workspace_rsvps", { _event_id: owner.eventId }),
    "owner views workspace RSVP",
  ).find((row) => row.guest_id === guestId);
  assert.equal(ownerRsvp?.status, "partially_confirmed");
  assert.equal(ownerRsvp?.confirmed_count, 1);
  expectBlocked(
    await stranger.client.rpc("list_workspace_rsvps", { _event_id: owner.eventId }),
    "nonmember cannot view workspace RSVP",
  );
  expectBlocked(
    await stranger.client.rpc("set_guest_rsvp_state", {
      _guest_id: guestId,
      _status: "confirmed",
      _confirmed_count: 2,
    }),
    "nonmember cannot edit workspace RSVP",
  );
  const invalidView = expectSuccess(
    await publicClient.rpc("get_public_rsvp", { _token: "invalid-token" }),
    "invalid RSVP token",
  );
  assert.equal(invalidView.length, 0, "invalid token exposes no guest data");

  const strangerGuests = await stranger.client.rpc("list_workspace_guests", {
    _event_id: owner.eventId,
  });
  assert.ok(
    strangerGuests.error || strangerGuests.data?.length === 0,
    "cross-tenant guest read blocked",
  );
  expectBlocked(
    await stranger.client.from("guest_members").select("id").eq("guest_id", guestId),
    "cross-tenant member read blocked",
  );

  expectSuccess(
    await owner.client.rpc("update_workspace_guest_gift", {
      _guest_id: guestId,
      _gift_amount: 150,
      _payment_method: "מזומן",
    }),
    "trial gift edit",
  );
  expectBlocked(
    await stranger.client.rpc("update_workspace_guest_gift", {
      _guest_id: guestId,
      _gift_amount: 999,
      _payment_method: "מזומן",
    }),
    "nonmember cannot edit gift",
  );
  expectBlocked(
    await owner.client.rpc("update_workspace_guest_attendance", {
      _guest_id: guestId,
      _arrived: true,
      _arrived_count: 1,
    }),
    "trial attendance blocked",
  );

  const expenseIds = [];
  for (let i = 0; i < 5; i += 1) {
    const row = expectSuccess(
      await owner.client
        .from("expenses")
        .insert({ event_id: owner.eventId, name: `QA expense ${i}`, category: "QA", price: 10 })
        .select("id")
        .single(),
      `trial expense ${i + 1}`,
    );
    expenseIds.push(row.id);
  }
  expectBlocked(
    await owner.client
      .from("expenses")
      .insert({ event_id: owner.eventId, name: "QA sixth", category: "QA", price: 10 })
      .select("id")
      .single(),
    "sixth trial expense blocked",
  );
  expectBlocked(
    await owner.client
      .from("expenses")
      .update({ requires_deposit: true })
      .eq("id", expenseIds[0])
      .select("id"),
    "trial deposit update blocked",
  );
  expectBlocked(
    await owner.client
      .from("expense_payments")
      .insert({ expense_id: expenseIds[0], amount: 5 })
      .select("id")
      .single(),
    "trial payment blocked",
  );
  expectBlocked(
    await stranger.client
      .from("expenses")
      .update({ name: "cross tenant" })
      .eq("id", expenseIds[0])
      .select("id"),
    "cross-tenant expense update blocked",
  );

  const vendor = expectSuccess(
    await owner.client
      .from("vendors")
      .insert({ event_id: owner.eventId, business_name: "QA Venue", category: "venue" })
      .select("id,event_id,business_name")
      .single(),
    "owner creates vendor",
  );
  assert.equal(vendor.event_id, owner.eventId);
  const vendorId = vendor.id;
  assert.equal(
    expectSuccess(
      await owner.client
        .from("vendors")
        .update({ business_name: "QA Venue Updated" })
        .eq("id", vendorId)
        .select("business_name")
        .single(),
      "owner updates vendor",
    ).business_name,
    "QA Venue Updated",
  );
  expectBlocked(
    await stranger.client.from("vendors").select("id").eq("id", vendorId),
    "nonmember cannot read vendor",
  );
  expectBlocked(
    await stranger.client
      .from("vendors")
      .update({ business_name: "cross tenant" })
      .eq("id", vendorId)
      .select("id"),
    "nonmember cannot update vendor",
  );
  expectBlocked(
    await owner.client
      .from("vendors")
      .update({ event_id: stranger.eventId })
      .eq("id", vendorId)
      .select("id"),
    "vendor event cannot be reassigned",
  );
  expectBlocked(
    await owner.client.from("vendor_events").select("id"),
    "vendor audit is not directly readable",
  );

  expectBlocked(
    await stranger.client.rpc("create_event_invitation", {
      _event_id: owner.eventId,
      _email: stranger.email,
      _role: "viewer",
    }),
    "nonowner cannot invite to another workspace",
  );
  const invitation = expectSuccess(
    await owner.client.rpc("create_event_invitation", {
      _event_id: owner.eventId,
      _email: stranger.email,
      _role: "viewer",
    }),
    "owner creates viewer invitation",
  );
  assert.equal(invitation.length, 1);
  assert.ok(invitation[0].token, "invitation returns a one-time token");
  const reissued = expectSuccess(
    await owner.client.rpc("reissue_event_invitation", {
      _invitation_id: invitation[0].invitation_id,
    }),
    "owner reissues invitation",
  );
  assert.equal(reissued.length, 1);
  assert.notEqual(reissued[0].token, invitation[0].token);
  expectBlocked(
    await stranger.client.rpc("accept_event_invitation", { _token: invitation[0].token }),
    "old invitation token is invalid after reissue",
  );
  expectBlocked(
    await owner.client.rpc("accept_event_invitation", { _token: reissued[0].token }),
    "invitation cannot be accepted by a different email",
  );
  const accepted = expectSuccess(
    await stranger.client.rpc("accept_event_invitation", { _token: reissued[0].token }),
    "invitee accepts workspace invitation",
  );
  assert.equal(accepted[0].event_id, owner.eventId);
  assert.equal(accepted[0].role, "viewer");
  expectBlocked(
    await stranger.client.rpc("accept_event_invitation", { _token: reissued[0].token }),
    "accepted invitation cannot be replayed",
  );
  const workspaceAccess = expectSuccess(
    await stranger.client.rpc("list_my_workspace_access"),
    "collaborator workspace access",
  ).find((row) => row.event_id === owner.eventId);
  assert.equal(workspaceAccess?.workspace_role, "viewer");
  assert.ok(workspaceAccess.effective_capabilities.includes("vendors_view"));
  assert.ok(!workspaceAccess.effective_capabilities.includes("vendors_edit"));
  assert.ok(workspaceAccess.effective_capabilities.includes("gifts_view"));
  assert.ok(!workspaceAccess.effective_capabilities.includes("gifts_edit"));
  assert.ok(workspaceAccess.effective_capabilities.includes("rsvp_view"));
  assert.ok(!workspaceAccess.effective_capabilities.includes("rsvp_edit"));
  const viewerGuest = expectSuccess(
    await stranger.client.rpc("list_workspace_guests", { _event_id: owner.eventId }),
    "viewer reads gift through masked guest RPC",
  ).find((row) => row.id === guestId);
  assert.equal(viewerGuest?.can_view_gifts, true);
  assert.equal(Number(viewerGuest?.gift_amount), 150);
  assert.equal(viewerGuest?.payment_method, "מזומן");
  expectBlocked(
    await stranger.client.rpc("update_workspace_guest_gift", {
      _guest_id: guestId,
      _gift_amount: 999,
      _payment_method: "מזומן",
    }),
    "viewer cannot edit gift",
  );
  const viewerRsvp = expectSuccess(
    await stranger.client.rpc("list_workspace_rsvps", { _event_id: owner.eventId }),
    "viewer reads workspace RSVP",
  ).find((row) => row.guest_id === guestId);
  assert.equal(viewerRsvp?.status, "partially_confirmed");
  expectBlocked(
    await stranger.client.rpc("set_guest_rsvp_state", {
      _guest_id: guestId,
      _status: "confirmed",
      _confirmed_count: 2,
    }),
    "viewer cannot edit RSVP",
  );
  expectBlocked(
    await stranger.client.rpc("mark_guest_rsvp_contact", {
      _guest_id: guestId,
      _contact_type: "reminder",
    }),
    "viewer cannot mark RSVP reminder",
  );
  expectBlocked(
    await stranger.client.rpc("set_workspace_rsvp_settings", {
      _event_id: owner.eventId,
      _rsvp_collect_dietary: true,
    }),
    "viewer cannot change RSVP settings",
  );
  assert.equal(
    expectSuccess(
      await stranger.client.from("vendors").select("id").eq("event_id", owner.eventId),
      "viewer vendor read",
    ).length,
    1,
  );
  expectBlocked(
    await stranger.client
      .from("vendors")
      .insert({ event_id: owner.eventId, business_name: "QA forbidden", category: "venue" })
      .select("id")
      .single(),
    "viewer cannot create vendor",
  );
  expectBlocked(
    await stranger.client
      .from("vendors")
      .update({ business_name: "viewer edit" })
      .eq("id", vendorId)
      .select("id"),
    "viewer cannot update vendor",
  );
  expectBlocked(
    await stranger.client.from("vendors").delete().eq("id", vendorId).select("id"),
    "viewer cannot delete vendor",
  );

  const memberId = expectSuccess(
    await owner.client.rpc("list_workspace_members", { _event_id: owner.eventId }),
    "owner lists workspace members",
  ).find((row) => row.user_id === stranger.userId)?.member_id;
  assert.ok(memberId, "accepted collaborator appears in member list");
  assert.equal(
    expectSuccess(
      await owner.client.rpc("update_event_member_role", {
        _member_id: memberId,
        _role: "event_manager",
      }),
      "owner promotes collaborator to event manager",
    ),
    true,
  );
  const managerAccess = expectSuccess(
    await stranger.client.rpc("list_my_workspace_access"),
    "event manager workspace access",
  ).find((row) => row.event_id === owner.eventId);
  assert.ok(managerAccess.effective_capabilities.includes("vendors_edit"));
  assert.ok(!managerAccess.effective_capabilities.includes("expenses_edit"));
  assert.ok(managerAccess.effective_capabilities.includes("rsvp_edit"));
  assert.ok(!managerAccess.effective_capabilities.includes("gifts_view"));
  assert.ok(!managerAccess.effective_capabilities.includes("gifts_edit"));
  const managerGuest = expectSuccess(
    await stranger.client.rpc("list_workspace_guests", { _event_id: owner.eventId }),
    "event manager guest RPC masks gifts",
  ).find((row) => row.id === guestId);
  assert.equal(managerGuest?.can_view_gifts, false);
  assert.equal(managerGuest?.gift_amount, null);
  assert.equal(managerGuest?.payment_method, null);
  expectBlocked(
    await stranger.client.from("guests").select("gift_amount,payment_method").eq("id", guestId),
    "event manager cannot bypass gift mask through direct table read",
  );
  expectBlocked(
    await stranger.client.rpc("update_workspace_guest_gift", {
      _guest_id: guestId,
      _gift_amount: 999,
      _payment_method: "מזומן",
    }),
    "event manager cannot edit gift",
  );
  const managerRsvp = expectSuccess(
    await stranger.client.rpc("set_guest_rsvp_state", {
      _guest_id: guestId,
      _status: "confirmed",
      _confirmed_count: 2,
    }),
    "event manager manually confirms RSVP",
  );
  assert.equal(managerRsvp[0].status, "confirmed");
  assert.equal(managerRsvp[0].confirmed_count, 2);
  const managerReminder = expectSuccess(
    await stranger.client.rpc("mark_guest_rsvp_contact", {
      _guest_id: guestId,
      _contact_type: "reminder",
    }),
    "event manager marks RSVP reminder",
  );
  assert.ok(managerReminder[0].last_reminder_at);
  assert.equal(
    expectSuccess(
      await stranger.client.rpc("set_workspace_rsvp_settings", {
        _event_id: owner.eventId,
        _rsvp_collect_dietary: true,
      }),
      "event manager changes RSVP settings",
    )[0].rsvp_collect_dietary,
    true,
  );
  assert.equal(
    expectSuccess(
      await publicClient.rpc("get_public_rsvp", { _token: issuedLink[0].token }),
      "public RSVP reflects manual status",
    )[0].status,
    "confirmed",
  );
  expectSuccess(
    await stranger.client
      .from("vendors")
      .update({ business_name: "QA Managed Venue" })
      .eq("id", vendorId)
      .select("id")
      .single(),
    "event manager updates vendor",
  );
  expectBlocked(
    await stranger.client
      .from("expenses")
      .update({ vendor_id: vendorId })
      .eq("id", expenseIds[0])
      .select("id"),
    "vendor manager cannot link expense without expenses edit",
  );
  assert.equal(
    expectSuccess(
      await owner.client
        .from("expenses")
        .update({ vendor_id: vendorId })
        .eq("id", expenseIds[0])
        .select("vendor_id")
        .single(),
      "owner links vendor to expense",
    ).vendor_id,
    vendorId,
  );
  expectSuccess(
    await owner.client.from("vendors").delete().eq("id", vendorId).select("id").single(),
    "owner deletes linked vendor",
  );
  assert.equal(
    expectSuccess(
      await owner.client.from("expenses").select("vendor_id").eq("id", expenseIds[0]).single(),
      "deleted vendor unlinks expense",
    ).vendor_id,
    null,
  );
  assert.equal(
    expectSuccess(
      await owner.client.rpc("remove_event_member", { _member_id: memberId }),
      "owner removes collaborator",
    ),
    true,
  );
  expectBlocked(
    await stranger.client.from("vendors").select("id").eq("event_id", owner.eventId),
    "removed collaborator loses vendor read",
  );
  assert.ok(
    !expectSuccess(
      await stranger.client.rpc("list_my_workspace_access"),
      "workspace after removal",
    ).some((row) => row.event_id === owner.eventId),
    "removed collaborator loses workspace entry",
  );
  const revokedInvitation = expectSuccess(
    await owner.client.rpc("create_event_invitation", {
      _event_id: owner.eventId,
      _email: stranger.email,
      _role: "viewer",
    }),
    "owner creates revocable invitation",
  )[0];
  assert.equal(
    expectSuccess(
      await owner.client.rpc("revoke_event_invitation", {
        _invitation_id: revokedInvitation.invitation_id,
      }),
      "owner revokes invitation",
    ),
    true,
  );
  expectBlocked(
    await stranger.client.rpc("accept_event_invitation", { _token: revokedInvitation.token }),
    "revoked invitation cannot be accepted",
  );

  expectBlocked(
    await owner.client.rpc("admin_set_subscription", {
      _event_id: owner.eventId,
      _action: "grant_premium",
      _months: 1,
    }),
    "ordinary user cannot grant premium",
  );
  expectSuccess(
    await admin.from("user_roles").insert({ user_id: stranger.userId, role: "admin" }),
    "local QA admin role",
  );
  const granted = expectSuccess(
    await stranger.client.rpc("admin_set_subscription", {
      _event_id: owner.eventId,
      _action: "grant_premium",
      _months: 1,
    }),
    "admin grants premium",
  );
  assert.equal(granted.plan, "premium");
  expectSuccess(
    await owner.client
      .from("expenses")
      .insert({ event_id: owner.eventId, name: "QA premium sixth", category: "QA", price: 10 })
      .select("id")
      .single(),
    "premium sixth expense",
  );
  expectSuccess(
    await owner.client
      .from("expenses")
      .update({ requires_deposit: true })
      .eq("id", expenseIds[0])
      .select("id")
      .single(),
    "premium deposit update",
  );
  expectSuccess(
    await owner.client
      .from("expense_payments")
      .insert({ expense_id: expenseIds[0], amount: 5 })
      .select("id")
      .single(),
    "premium payment",
  );
  expectSuccess(
    await owner.client.rpc("update_workspace_guest_attendance", {
      _guest_id: guestId,
      _arrived: true,
      _arrived_count: 1,
    }),
    "premium attendance",
  );

  const reset = expectSuccess(
    await stranger.client.rpc("admin_set_subscription", {
      _event_id: owner.eventId,
      _action: "reset_trial",
    }),
    "admin resets trial",
  );
  assert.equal(reset.plan, "trial");
  assert.equal(reset.premium_expires_at, null, "reset clears premium expiry");
  expectSuccess(
    await stranger.client.rpc("admin_set_subscription", {
      _event_id: owner.eventId,
      _action: "grant_premium",
      _months: 1,
    }),
    "admin regrants premium",
  );

  expectSuccess(
    await admin
      .from("subscriptions")
      .update({
        trial_expires_at: new Date(Date.now() - 86400000).toISOString(),
        premium_expires_at: new Date(Date.now() - 86400000).toISOString(),
      })
      .eq("event_id", owner.eventId),
    "local expired setup",
  );
  const visibleExpenses = expectSuccess(
    await owner.client.from("expenses").select("id").eq("event_id", owner.eventId),
    "expired read",
  );
  assert.equal(visibleExpenses.length, 6, "expired event remains readable");
  assert.equal(
    expectSuccess(
      await owner.client.rpc("list_workspace_rsvps", { _event_id: owner.eventId }),
      "expired RSVP remains readable",
    ).find((row) => row.guest_id === guestId)?.status,
    "confirmed",
  );
  expectBlocked(
    await owner.client.rpc("set_guest_rsvp_state", {
      _guest_id: guestId,
      _status: "declined",
      _confirmed_count: 0,
    }),
    "expired workspace RSVP edit blocked",
  );
  const expiredPublicRsvp = expectSuccess(
    await publicClient.rpc("get_public_rsvp", { _token: issuedLink[0].token }),
    "public RSVP is read-only after expiry",
  );
  assert.equal(expiredPublicRsvp[0].can_submit, false);
  assert.equal(expiredPublicRsvp[0].link_status, "subscription_expired");
  expectBlocked(
    await publicClient.rpc("submit_public_rsvp", {
      _token: issuedLink[0].token,
      _confirmed_count: 0,
    }),
    "public RSVP submit blocked after expiry",
  );
  expectBlocked(
    await owner.client
      .from("expenses")
      .insert({ event_id: owner.eventId, name: "QA expired", category: "QA", price: 10 })
      .select("id")
      .single(),
    "expired create blocked",
  );
  expectBlocked(
    await owner.client
      .from("expenses")
      .update({ name: "QA expired update" })
      .eq("id", expenseIds[0])
      .select("id"),
    "expired update blocked",
  );
  expectBlocked(
    await owner.client.from("expenses").delete().eq("id", expenseIds[0]).select("id"),
    "expired delete blocked",
  );
} finally {
  const cleanupErrors = [];
  for (const userId of createdUsers.reverse()) {
    const roleRemoved = await admin
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", "admin");
    if (roleRemoved.error) cleanupErrors.push(`role cleanup: ${roleRemoved.error.message}`);
    const removed = await admin.auth.admin.deleteUser(userId);
    if (removed.error) cleanupErrors.push(`user cleanup: ${removed.error.message}`);
  }
  assert.deepEqual(cleanupErrors, [], "local QA users must be removed");
}

console.log(
  "Local Supabase API QA passed: Trial, Premium, Expired, cross-tenant, gifts, RSVP status and role capabilities, vendors, workspace invitations",
);
