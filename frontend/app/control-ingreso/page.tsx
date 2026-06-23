import { AccessControlShell } from "@/components/access-control-shell";

export default function ControlIngresoPage() {
  return (
    <AccessControlShell
      activeItem="Control de Ingreso"
      title="Control de Ingreso"
      eyebrow="Operación diaria"
      recordType="INGRESO"
    />
  );
}
