import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "onCheck · El cheque, a la vista",
  description: "Fondo de cheques y pagarés de pymes: cada activo es un registro público y los límites de riesgo los hace cumplir el contrato. Pagos con ARGt de Twin.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <Script id="tema-inicial" strategy="beforeInteractive">
          {`try{var t=localStorage.getItem("fondo-cheques:tema");if(t==="claro"||t==="oscuro")document.documentElement.dataset.tema=t}catch(e){}`}
        </Script>
        {children}
      </body>
    </html>
  );
}
