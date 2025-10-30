import { Search, MessageCircle, PartyPopper } from "lucide-react";

const steps = [
  {
    icon: Search,
    title: "Browse & Compare",
    description: "Search through hundreds of verified vendors and compare their services, pricing, and reviews.",
  },
  {
    icon: MessageCircle,
    title: "Connect & Book",
    description: "Message vendors directly, request quotes, and book your favorites with confidence.",
  },
  {
    icon: PartyPopper,
    title: "Celebrate Your Event",
    description: "Relax and enjoy your special day knowing you've hired the best professionals.",
  },
];

export default function HowItWorks() {
  return (
    <section className="py-16 md:py-24 bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-how-it-works-title">
            How It Works
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto" data-testid="text-how-it-works-description">
            Three simple steps to planning your perfect event
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
          {steps.map((step, index) => (
            <div key={step.title} className="text-center" data-testid={`card-step-${index + 1}`}>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
                <step.icon className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
