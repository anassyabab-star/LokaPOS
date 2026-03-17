import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

function clearSupabaseCookies(request: NextRequest, response: NextResponse) {
  const cookies = request.cookies.getAll();
  cookies.forEach(cookie => {
    if (cookie.name.startsWith("sb-") || cookie.name.includes("auth-token")) {
      response.cookies.set(cookie.name, "", {
        path: "/",
        maxAge: 0,
      });
    }
  });
}

async function signOutWithServerClient(request: NextRequest, response: NextResponse) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>
        ) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  await supabase.auth.signOut();
}

export async function GET(request: NextRequest) {
  const nextPath = request.nextUrl.searchParams.get("next") || "/login";
  const response = NextResponse.redirect(new URL(nextPath, request.url));

  await signOutWithServerClient(request, response);
  clearSupabaseCookies(request, response);

  return response;
}

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true });

  await signOutWithServerClient(request, response);
  clearSupabaseCookies(request, response);

  return response;
}
