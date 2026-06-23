import { AccessControlShell } from "@/components/access-control-shell";

export default function AsistenciasPage() {
  return (
    <AccessControlShell
      activeItem="Asistencias"
      title="Asistencias"
      eyebrow="Operación diaria"
      recordType="ASISTENCIA"
    />
  );
}
