import type { NextPageContext } from "next";

type ErrorPageProps = {
  statusCode?: number;
};

function ErrorPage({ statusCode }: ErrorPageProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
      <section className="w-full max-w-xl rounded-[2rem] bg-white p-10 text-center shadow-panel">
        <p className="text-sm uppercase tracking-[0.3em] text-sky">Sistema Escolar</p>
        <h1 className="mt-4 text-4xl font-bold text-slate-900">
          {statusCode ? `Error ${statusCode}` : "Ocurrió un error inesperado"}
        </h1>
        <p className="mt-4 text-sm text-slate-600">
          La aplicación local encontró un problema al renderizar esta vista. Intenta recargar o volver al inicio.
        </p>
      </section>
    </main>
  );
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res?.statusCode ?? err?.statusCode ?? 500;
  return { statusCode };
};

export default ErrorPage;
