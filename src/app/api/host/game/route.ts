// truth-or-dare-ai/src/app/api/host/game/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Server-only admin client (bypasses RLS)
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

async function getHostIdFromAuthHeader(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;

  return data.user.id;
}

type Body =
  | { op: "reset_game" }
  | { op: "delete_player"; playerId: string };

export async function POST(req: Request) {
  try {
    const hostId = await getHostIdFromAuthHeader(req);
    if (!hostId) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = (await req.json()) as Body;

    // ---- Reset full game (delete players + history, reset game_states) ----
    if (body.op === "reset_game") {
      const { error: playersError } = await admin.from("players").delete().eq("host_id", hostId);
      if (playersError) {
        return NextResponse.json(
          { ok: false, error: "DELETE_PLAYERS_FAILED", details: playersError.message },
          { status: 500 }
        );
      }

      const { error: historyError } = await admin.from("challenge_history").delete().eq("host_id", hostId);
      if (historyError) {
        // not fatal for UX, but report it
        console.error("challenge_history delete error:", historyError);
      }

      const { error: stateError } = await admin.from("game_states").upsert({
        host_id: hostId,
        status: "lobby",
        current_player_id: null,
        last_active_player_id: null,
        challenge_text: null,
        challenge_type: null,
        heat_level: 1,
        updated_at: new Date().toISOString(),
      });

      if (stateError) {
        return NextResponse.json(
          { ok: false, error: "RESET_GAME_STATE_FAILED", details: stateError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true });
    }

    // ---- Host deletes a specific player (used as fallback when phone leaves) ----
    if (body.op === "delete_player") {
      const playerId = (body.playerId || "").trim();
      if (!playerId) {
        return NextResponse.json({ ok: false, error: "MISSING_PLAYER_ID" }, { status: 400 });
      }

      const { error } = await admin
        .from("players")
        .delete()
        .eq("host_id", hostId)
        .eq("id", playerId);

      if (error) {
        return NextResponse.json(
          { ok: false, error: "DELETE_PLAYER_FAILED", details: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "UNKNOWN_OP" }, { status: 400 });
  } catch (err: any) {
    console.error("API /api/host/game error:", err);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
