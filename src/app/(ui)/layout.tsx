import { FooterLegal } from "@/components/FooterLegal";
import { NavPrincipal } from "@/components/NavPrincipal";

export default function UiLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavPrincipal />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">{children}</main>
      <FooterLegal />
    </>
  );
}
