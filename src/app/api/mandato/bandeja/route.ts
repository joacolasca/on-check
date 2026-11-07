// GET: la bandeja de activos de la demo del Mandato y el mandato por defecto (shared/fixtures/mandato-bandeja.json).
import { leerBandeja } from "@/lib/mandato/bandeja";

export const dynamic = "force-dynamic";

export async function GET() {
  const { activos, mandatoPorDefecto } = leerBandeja();
  return Response.json({ activos, mandatoPorDefecto });
}
