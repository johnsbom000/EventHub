import { Calendar, Users, Star, Award } from "lucide-react";

const stats = [
  {
    icon: Calendar,
    value: "10,000+",
    label: "Events Planned",
  },
  {
    icon: Users,
    value: "500+",
    label: "Trusted Vendors",
  },
  {
    icon: Star,
    value: "4.9★",
    label: "Average Rating",
  },
  {
    icon: Award,
    value: "100%",
    label: "Satisfaction",
  },
];

export default function TrustSection() {
  return (
    <section className="py-16 md:py-24 bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <div key={stat.label} className="text-center" data-testid={`stat-${index + 1}`}>
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
                <stat.icon className="h-6 w-6 text-primary" />
              </div>
              <div className="text-3xl md:text-4xl font-bold mb-2" data-testid={`stat-value-${index + 1}`}>
                {stat.value}
              </div>
              <div className="text-sm text-muted-foreground" data-testid={`stat-label-${index + 1}`}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
