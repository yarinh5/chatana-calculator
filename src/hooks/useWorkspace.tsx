import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";

export type WorkspaceCapability = Database["public"]["Enums"]["workspace_capability"];
export type WorkspaceRole = Database["public"]["Enums"]["workspace_role"];

export type WorkspaceAccess = {
  event_id: string;
  event_name: string;
  wedding_date: string | null;
  owner_id: string;
  is_owner: boolean;
  workspace_role: WorkspaceRole | null;
  effective_capabilities: WorkspaceCapability[];
};

type WorkspaceState = {
  workspaces: WorkspaceAccess[];
  activeWorkspace: WorkspaceAccess | null;
  activeEventId: string | null;
  loading: boolean;
  error: Error | null;
  isOwner: boolean;
  can: (capability: WorkspaceCapability) => boolean;
  selectWorkspace: (eventId: string) => void;
  refresh: () => Promise<void>;
  clearSelection: () => void;
};

const WorkspaceContext = createContext<WorkspaceState | undefined>(undefined);

const queryKey = (userId: string | null | undefined) => ["workspace-access", userId] as const;
const storageKey = (userId: string) => `wb-active-workspace:${userId}`;

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const previousUserId = useRef<string | null>(null);

  const query = useQuery<WorkspaceAccess[], Error>({
    queryKey: queryKey(userId),
    enabled: !!userId,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_my_workspace_access");
      if (error) throw error;
      return ((data ?? []) as WorkspaceAccess[]).map((workspace) => ({
        ...workspace,
        wedding_date: workspace.wedding_date ?? null,
        workspace_role: workspace.workspace_role ?? null,
        effective_capabilities: workspace.effective_capabilities ?? [],
      }));
    },
  });

  const workspaces = query.data ?? [];

  useEffect(() => {
    if (previousUserId.current && previousUserId.current !== userId) {
      localStorage.removeItem(storageKey(previousUserId.current));
    }
    previousUserId.current = userId;
    if (!userId) {
      setSelectedEventId(null);
      return;
    }
    const saved = localStorage.getItem(storageKey(userId));
    setSelectedEventId(saved);
  }, [userId]);

  const activeWorkspace = useMemo(() => {
    if (workspaces.length === 0) return null;
    return workspaces.find((workspace) => workspace.event_id === selectedEventId) ?? workspaces[0];
  }, [selectedEventId, workspaces]);

  useEffect(() => {
    if (!selectedEventId) return;
    if (
      workspaces.length > 0 &&
      !workspaces.some((workspace) => workspace.event_id === selectedEventId)
    ) {
      setSelectedEventId(workspaces[0]?.event_id ?? null);
    }
  }, [selectedEventId, workspaces]);

  useEffect(() => {
    if (!userId || !activeWorkspace) return;
    localStorage.setItem(storageKey(userId), activeWorkspace.event_id);
  }, [activeWorkspace, userId]);

  const selectWorkspace = useCallback(
    (eventId: string) => {
      if (!workspaces.some((workspace) => workspace.event_id === eventId)) return;
      setSelectedEventId(eventId);
      if (userId) localStorage.setItem(storageKey(userId), eventId);
    },
    [userId, workspaces],
  );

  const clearSelection = useCallback(() => {
    if (userId) localStorage.removeItem(storageKey(userId));
    setSelectedEventId(null);
  }, [userId]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    await queryClient.invalidateQueries({ queryKey: queryKey(userId) });
  }, [queryClient, userId]);

  const value = useMemo<WorkspaceState>(() => {
    const capabilities = new Set(activeWorkspace?.effective_capabilities ?? []);
    return {
      workspaces,
      activeWorkspace,
      activeEventId: activeWorkspace?.event_id ?? null,
      loading: query.isLoading || query.isFetching,
      error: query.error ?? null,
      isOwner: !!activeWorkspace?.is_owner,
      can: (capability) => capabilities.has(capability),
      selectWorkspace,
      refresh,
      clearSelection,
    };
  }, [
    activeWorkspace,
    query.error,
    query.isFetching,
    query.isLoading,
    refresh,
    selectWorkspace,
    clearSelection,
    workspaces,
  ]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
