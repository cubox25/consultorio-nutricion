import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Copia cookies + headers de caché al redirect (requerido por @supabase/ssr). */
function redirectWithSession(url: URL, supabaseResponse: NextResponse) {
  const redirect = NextResponse.redirect(url);
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    redirect.cookies.set(cookie.name, cookie.value);
  });
  for (const key of ["Cache-Control", "Expires", "Pragma"] as const) {
    const value = supabaseResponse.headers.get(key);
    if (value) redirect.headers.set(key, value);
  }
  return redirect;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const pathname = request.nextUrl.pathname;
  const isAdminRoute = pathname.startsWith("/admin");
  const isLoginRoute = pathname === "/login";

  // Fail-closed: sin env no se puede validar sesión → bloquear /admin
  if (!url || !key) {
    if (isAdminRoute) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("error", "config");
      return NextResponse.redirect(redirectUrl);
    }
    return supabaseResponse;
  }

  const needsAuthDecision = isAdminRoute || isLoginRoute;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([key, value]) => {
          supabaseResponse.headers.set(key, value);
        });
      },
    },
  });

  if (!needsAuthDecision) {
    // Visitantes anónimos: no hace falta roundtrip de sesión en cada request pública.
    const hasAuthCookie = request.cookies
      .getAll()
      .some(
        (c) =>
          c.name.includes("auth-token") ||
          c.name.startsWith("sb-") ||
          c.name.includes("supabase")
      );
    if (hasAuthCookie) {
      // Refresca/valida JWT con Auth (no confiar solo en getSession).
      await supabase.auth.getUser();
    }
    return supabaseResponse;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isAdminRoute) {
    if (!user) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("next", pathname);
      return redirectWithSession(redirectUrl, supabaseResponse);
    }

    // Defensa en profundidad: no basta con estar autenticado; debe ser staff/admin
    const { data: isStaff, error: staffError } = await supabase.rpc("is_staff");
    if (staffError || isStaff !== true) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("error", "forbidden");
      // Cerrar sesión no-staff para no quedar en bucle
      await supabase.auth.signOut();
      return redirectWithSession(redirectUrl, supabaseResponse);
    }
  }

  if (isLoginRoute && user) {
    const { data: isStaff } = await supabase.rpc("is_staff");
    if (isStaff === true) {
      const redirectUrl = request.nextUrl.clone();
      const next = request.nextUrl.searchParams.get("next");
      const safeNext =
        next && next.startsWith("/") && !next.startsWith("//") ? next : "/admin";
      redirectUrl.pathname = safeNext;
      redirectUrl.search = "";
      return redirectWithSession(redirectUrl, supabaseResponse);
    }
  }

  return supabaseResponse;
}
