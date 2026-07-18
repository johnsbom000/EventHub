import {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastAction,
  ToastClose,
} from "eventhub-ui";

// Toasts forced open. The ToastViewport is position:fixed by default (it pins
// notifications to the screen corner), which takes them out of the card's
// content box. An inline `position: static` (beats the Tailwind `fixed` class)
// renders the toast in normal flow so the preview card shows it inline.
const inlineViewport = {
  position: "static" as const,
  padding: 0,
  width: "100%",
  maxWidth: 440,
};

export const BookingConfirmed = () => (
  <ToastProvider>
    <Toast open>
      <div className="grid gap-1">
        <ToastTitle>Booking confirmed</ToastTitle>
        <ToastDescription>
          Bella Fiori Florals is booked for June 14, 2026. Deposit of $212.50 paid.
        </ToastDescription>
      </div>
      <ToastAction altText="View booking details">View</ToastAction>
      <ToastClose />
    </Toast>
    <ToastViewport style={inlineViewport} />
  </ToastProvider>
);

export const PaymentFailed = () => (
  <ToastProvider>
    <Toast open variant="destructive">
      <div className="grid gap-1">
        <ToastTitle>Payment failed</ToastTitle>
        <ToastDescription>
          We couldn't charge your card for the Riverside Pavilion deposit.
        </ToastDescription>
      </div>
      <ToastAction altText="Retry the deposit payment">Retry</ToastAction>
      <ToastClose />
    </Toast>
    <ToastViewport style={inlineViewport} />
  </ToastProvider>
);
