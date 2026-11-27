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
  return { client, eventId: event.id, userId: created.user.id };
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

console.log("Local Supabase API QA passed: Trial, Premium, Expired, cross-tenant, guests, RSVP");
