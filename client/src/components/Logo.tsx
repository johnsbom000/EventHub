import BrandWordmark from "@/components/BrandWordmark";

export default function Logo({ className = "text-[2rem]" }: { className?: string }) {
  return <BrandWordmark className={className} />;
}
