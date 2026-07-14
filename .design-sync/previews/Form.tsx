import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  Input,
  Textarea,
  Button,
} from "eventhub-ui";
import { useForm } from "react-hook-form";

// Booking-inquiry form built on react-hook-form's FormProvider.
export const InquiryForm = () => {
  const form = useForm({
    defaultValues: {
      name: "Jordan Blake",
      eventDate: "2026-06-14",
      details: "",
    },
  });

  return (
    <Form {...form}>
      <form style={{ width: 380, display: "flex", flexDirection: "column", gap: 16 }}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Your name</FormLabel>
              <FormControl>
                <Input placeholder="Jordan Blake" {...field} />
              </FormControl>
              <FormDescription>
                So the vendor knows who they're talking to.
              </FormDescription>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="eventDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Event date</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormDescription>
                Check availability before you send.
              </FormDescription>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="details"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Event details</FormLabel>
              <FormControl>
                <Textarea
                  rows={3}
                  placeholder="140-guest reception at The Gathering Place in Salt Lake City. Looking for plated dinner service and a tasting in May."
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Send inquiry</Button>
      </form>
    </Form>
  );
};
