import { useState } from "react"
import {
  EnhancedButton,
  EnhancedInput,
  EnhancedCard,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  EnhancedModal,
  EnhancedDrawer,
  toast,
} from "@/components/ui-enhanced"
import { Play, Check } from "lucide-react"

export default function UIDemo() {
  const [modalOpen, setModalOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleLoadingDemo = () => {
    setLoading(true)
    setTimeout(() => setLoading(false), 2000)
  }

  const showToast = (variant: 'default' | 'success' | 'error' | 'warning' | 'info') => {
    toast({
      variant,
      title: `${variant.charAt(0).toUpperCase() + variant.slice(1)} Toast`,
      description: `This is a ${variant} toast notification with auto-dismiss.`,
    })
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-12">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-foreground" data-testid="demo-title">
            Enhanced UI Component Library
          </h1>
          <p className="text-lg text-muted-foreground">
            A comprehensive showcase of all component variants, states, and interactions
          </p>
        </div>

        {/* Button Section */}
        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold mb-2">Buttons</h2>
            <p className="text-muted-foreground mb-4">
              Enhanced buttons with ripple effects, loading states, and accessibility features
            </p>
          </div>

          {/* Variants */}
          <EnhancedCard elevation="raised">
            <CardHeader>
              <CardTitle>Button Variants</CardTitle>
              <CardDescription>Primary, Secondary, Outline, Ghost, and Destructive variants</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              <EnhancedButton variant="default" data-testid="button-primary">
                Primary
              </EnhancedButton>
              <EnhancedButton variant="secondary" data-testid="button-secondary">
                Secondary
              </EnhancedButton>
              <EnhancedButton variant="outline" data-testid="button-outline">
                Outline
              </EnhancedButton>
              <EnhancedButton variant="ghost" data-testid="button-ghost">
                Ghost
              </EnhancedButton>
              <EnhancedButton variant="destructive" data-testid="button-destructive">
                Destructive
              </EnhancedButton>
            </CardContent>
          </EnhancedCard>

          {/* Sizes */}
          <EnhancedCard elevation="raised">
            <CardHeader>
              <CardTitle>Button Sizes</CardTitle>
              <CardDescription>Small, Default, Large, and Icon sizes</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-4">
              <EnhancedButton size="sm" data-testid="button-sm">
                Small
              </EnhancedButton>
              <EnhancedButton size="default" data-testid="button-default">
                Default
              </EnhancedButton>
              <EnhancedButton size="lg" data-testid="button-lg">
                Large
              </EnhancedButton>
              <EnhancedButton size="icon" data-testid="button-icon">
                <Play className="h-4 w-4" />
              </EnhancedButton>
            </CardContent>
          </EnhancedCard>

          {/* States */}
          <EnhancedCard elevation="raised">
            <CardHeader>
              <CardTitle>Button States</CardTitle>
              <CardDescription>Loading, Disabled, and with Icons</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              <EnhancedButton 
                loading={loading} 
                onClick={handleLoadingDemo}
                data-testid="button-loading"
              >
                {loading ? "Loading..." : "Click to Load"}
              </EnhancedButton>
              <EnhancedButton disabled data-testid="button-disabled">
                Disabled
              </EnhancedButton>
              <EnhancedButton data-testid="button-with-icon">
                <Check className="mr-2 h-4 w-4" />
                With Icon
              </EnhancedButton>
              <EnhancedButton enableRipple={false} data-testid="button-no-ripple">
                No Ripple
              </EnhancedButton>
            </CardContent>
          </EnhancedCard>
        </section>

        {/* Input Section */}
        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold mb-2">Inputs</h2>
            <p className="text-muted-foreground mb-4">
              Form inputs with labels, validation states, and accessibility
            </p>
          </div>

          <EnhancedCard elevation="raised">
            <CardHeader>
              <CardTitle>Input States</CardTitle>
              <CardDescription>Default, Success, and Error states with labels and hints</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <EnhancedInput
                label="Default Input"
                placeholder="Enter your name"
                hint="This is a helpful hint"
                data-testid="input-default"
              />
              <EnhancedInput
                label="Success State"
                placeholder="Valid email"
                success
                defaultValue="user@example.com"
                data-testid="input-success"
              />
              <EnhancedInput
                label="Error State"
                placeholder="Invalid input"
                error="This field is required"
                data-testid="input-error"
              />
              <EnhancedInput
                type="email"
                label="Email Input"
                placeholder="your@email.com"
                data-testid="input-email"
              />
              <EnhancedInput
                type="password"
                label="Password Input"
                placeholder="Enter password"
                data-testid="input-password"
              />
              <EnhancedInput
                type="textarea"
                label="Textarea"
                placeholder="Enter a longer message..."
                rows={4}
                data-testid="input-textarea"
              />
            </CardContent>
          </EnhancedCard>
        </section>

        {/* Card Section */}
        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold mb-2">Cards</h2>
            <p className="text-muted-foreground mb-4">
              Cards with different elevation levels and hover states
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <EnhancedCard elevation="flat" data-testid="card-flat">
              <CardHeader>
                <CardTitle>Flat Card</CardTitle>
                <CardDescription>No shadow, border only</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  This card has no elevation and uses a simple border.
                </p>
              </CardContent>
            </EnhancedCard>

            <EnhancedCard elevation="raised" data-testid="card-raised">
              <CardHeader>
                <CardTitle>Raised Card</CardTitle>
                <CardDescription>Subtle shadow with border</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  This card has a subtle shadow that increases on hover.
                </p>
              </CardContent>
            </EnhancedCard>

            <EnhancedCard elevation="elevated" data-testid="card-elevated">
              <CardHeader>
                <CardTitle>Elevated Card</CardTitle>
                <CardDescription>Prominent shadow, no border</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  This card has a more prominent shadow for emphasis.
                </p>
              </CardContent>
            </EnhancedCard>
          </div>

          <EnhancedCard elevation="raised" hoverable data-testid="card-hoverable">
            <CardHeader>
              <CardTitle>Hoverable Card</CardTitle>
              <CardDescription>This card lifts up when you hover over it</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Hover over this card to see the lift animation effect.
              </p>
            </CardContent>
            <CardFooter>
              <EnhancedButton size="sm" data-testid="button-card-action">Action</EnhancedButton>
            </CardFooter>
          </EnhancedCard>
        </section>

        {/* Modal & Drawer Section */}
        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold mb-2">Modal & Drawer</h2>
            <p className="text-muted-foreground mb-4">
              Overlays with animations, focus traps, and keyboard navigation
            </p>
          </div>

          <EnhancedCard elevation="raised">
            <CardHeader>
              <CardTitle>Overlay Components</CardTitle>
              <CardDescription>Click to open modal or drawer</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-4">
              <EnhancedButton 
                onClick={() => setModalOpen(true)}
                data-testid="button-open-modal"
              >
                Open Modal
              </EnhancedButton>
              <EnhancedButton 
                variant="secondary"
                onClick={() => setDrawerOpen(true)}
                data-testid="button-open-drawer"
              >
                Open Drawer
              </EnhancedButton>
            </CardContent>
          </EnhancedCard>
        </section>

        {/* Toast Section */}
        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold mb-2">Toasts</h2>
            <p className="text-muted-foreground mb-4">
              Notification toasts with auto-dismiss and different variants
            </p>
          </div>

          <EnhancedCard elevation="raised">
            <CardHeader>
              <CardTitle>Toast Variants</CardTitle>
              <CardDescription>Click to show different toast notifications</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              <EnhancedButton 
                onClick={() => showToast('default')}
                data-testid="button-toast-default"
              >
                Default Toast
              </EnhancedButton>
              <EnhancedButton 
                variant="default"
                onClick={() => showToast('success')}
                data-testid="button-toast-success"
              >
                Success Toast
              </EnhancedButton>
              <EnhancedButton 
                variant="destructive"
                onClick={() => showToast('error')}
                data-testid="button-toast-error"
              >
                Error Toast
              </EnhancedButton>
              <EnhancedButton 
                variant="outline"
                onClick={() => showToast('warning')}
                data-testid="button-toast-warning"
              >
                Warning Toast
              </EnhancedButton>
              <EnhancedButton 
                variant="secondary"
                onClick={() => showToast('info')}
                data-testid="button-toast-info"
              >
                Info Toast
              </EnhancedButton>
            </CardContent>
          </EnhancedCard>
        </section>
      </div>

      {/* Modal */}
      <EnhancedModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Example Modal"
        description="This is a centered modal with animations and focus trap"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This modal demonstrates keyboard navigation (Tab, Shift+Tab), escape key to close,
            and focus trapping for accessibility.
          </p>
          <div className="flex justify-end gap-2">
            <EnhancedButton 
              variant="outline" 
              onClick={() => setModalOpen(false)}
              data-testid="modal-cancel"
            >
              Cancel
            </EnhancedButton>
            <EnhancedButton 
              onClick={() => setModalOpen(false)}
              data-testid="modal-confirm"
            >
              Confirm
            </EnhancedButton>
          </div>
        </div>
      </EnhancedModal>

      {/* Drawer */}
      <EnhancedDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Example Drawer"
        description="This is a right-side drawer panel with slide animation"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This drawer slides in from the right with smooth spring animation.
            It also supports keyboard navigation and focus trapping.
          </p>
          <EnhancedInput
            label="Example Input"
            placeholder="Try tabbing through elements"
            data-testid="input-drawer"
          />
          <EnhancedButton 
            onClick={() => setDrawerOpen(false)}
            data-testid="button-close-drawer"
          >
            Close Drawer
          </EnhancedButton>
        </div>
      </EnhancedDrawer>
    </div>
  )
}
