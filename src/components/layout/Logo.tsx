import logo from "@/assets/cerberus-logo.svg";

export function Logo({ className = "h-10 w-auto" }: { className?: string }) {
  const imgSrc = typeof logo === "string" ? logo : logo.src;
  return (
    <img src={imgSrc} alt="Brasão da Atlética Imortal" className={className} />
  );
}
