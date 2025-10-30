import { Link } from "wouter";
import { LucideIcon } from "lucide-react";

interface CategoryCardProps {
  title: string;
  image: string;
  icon: LucideIcon;
  href: string;
}

export default function CategoryCard({ title, image, icon: Icon, href }: CategoryCardProps) {
  return (
    <Link href={href}>
      <div className="group relative aspect-square rounded-xl overflow-hidden hover-elevate active-elevate-2 cursor-pointer" data-testid={`card-category-${title.toLowerCase().replace(/\s+/g, '-')}`}>
        <img 
          src={image} 
          alt={title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-6">
          <Icon className="h-10 w-10 mb-3" />
          <h3 className="text-xl font-semibold text-center">{title}</h3>
        </div>
      </div>
    </Link>
  );
}
