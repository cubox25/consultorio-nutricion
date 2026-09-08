import { NextResponse } from "next/server";

/**
 * Endpoint legacy eliminado: usaba service role sin autenticación.
 * Los turnos públicos ya se confirman al crearlos vía RPC create_public_appointment.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Este endpoint ya no está disponible. El turno se confirma al reservarlo.",
    },
    { status: 410 }
  );
}

export async function GET() {
  return POST();
}
