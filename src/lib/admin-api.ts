// Client-side wrapper that invokes the `admin-actions` Edge Function.
// Same signatures as the old server functions to minimize call-site changes.
import { supabase } from "@/integrations/supabase/client";

type FunctionError = {
  message?: string;
  context?: { json?: () => Promise<unknown> };
};

async function call<T>(action: string, payload?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-actions", {
    body: { action, payload: payload ?? {} },
  });
  if (error) {
    // FunctionsHttpError includes { context: Response } — try to extract server message.
    const functionError = error as FunctionError;
    let msg = functionError.message ?? "שגיאה";
    try {
      const ctx = functionError.context;
      if (ctx && typeof ctx.json === "function") {
        const body = (await ctx.json()) as { error?: unknown };
        if (typeof body.error === "string") msg = body.error;
      }
    } catch {
      /* noop */
    }
    throw new Error(msg);
  }
  if (data && typeof data === "object" && "error" in data) {
    const serverError = (data as { error?: unknown }).error;
    throw new Error(typeof serverError === "string" && serverError ? serverError : "שגיאה");
  }
  return data as T;
}

export type AdminUser = {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
  roles: string[];
  isAdmin: boolean;
};

export const adminListUsers = () => call<AdminUser[]>("list_users");
export const adminCreateUser = (data: { email: string; password: string; fullName: string }) =>
  call<{ id: string; email: string }>("create_user", data);
export const adminInviteUser = (data: { email: string }) => call<{ ok: true }>("invite_user", data);
export const adminToggleActive = (data: { userId: string; isActive: boolean }) =>
  call<{ ok: true }>("toggle_active", data);
export const adminResetPassword = (data: { email: string; redirectTo: string }) =>
  call<{ ok: true }>("reset_password", data);
export const adminDeleteUser = (data: { userId: string }) => call<{ ok: true }>("delete_user", data);
export const adminGetUserEventId = (data: { userId: string }) =>
  call<{ id: string; event_name: string } | null>("get_user_event", data);
export const adminUpdateUser = (data: {
  userId: string;
  fullName?: string;
  email?: string;
  password?: string;
}) => call<{ ok: true }>("update_user", data);
